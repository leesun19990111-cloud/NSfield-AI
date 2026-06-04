'use server'

import { requireUser } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { getCurrentFxRate } from '@/lib/fx/service'
import { estimateBilledUsd, estimateRawUsd, perSecondUnitUsd, UnsupportedDurationError } from '@/lib/models/pricing'
import { usdToKrw } from '@/lib/money/format'
import { getImageAdapter, getVideoAdapter } from '@/lib/models/registry'
import { uploadGenerationImages } from '@/lib/storage/upload'
import { computeSettlementKrw } from '@/lib/generation/settle'
import { checkDualLimit, RATE_LIMITS } from '@/lib/rate-limit/token-bucket'
import { getModelConfig } from '@/lib/models/catalog/registry'
import { buildInputSchema } from '@/lib/validation/dynamic'
import type { ModelMeta, PricingJson, GenerationParams } from '@/lib/models/types'
import { revalidatePath } from 'next/cache'

function toModelMeta(m: {
  id: string; kind: string; display_name: string; provider: string
  is_active: boolean; margin_pct: unknown; pricing_json: unknown
}): ModelMeta {
  return {
    id: m.id, kind: m.kind as 'IMAGE' | 'VIDEO', display_name: m.display_name,
    provider: m.provider, is_active: m.is_active,
    margin_pct: Number(m.margin_pct), pricing_json: m.pricing_json as PricingJson,
  }
}

export type EstimateBreakdown = {
  kind: 'per_image' | 'per_second' | 'per_token' | 'per_video_fixed' | 'per_video_token'
  unitUsd: number // base usd_per_unit (per_video_fixed: tier price)
  units: number // count (image) or duration_sec (video); 1 if N/A
  unitLabel: string // '장' | '초' | '건'
  marginPct: number
  baseUsd: number // unitUsd*units (pre-margin)
  billedUsd: number // *(1+margin)
}

export type EstimateResult =
  | { ok: true; billedUsd: number; krw: number; fxRate: number; breakdown: EstimateBreakdown }
  | { ok: false; message: string }

export type EstimateInput = {
  modelId: string
  prompt: string
  count?: number
  duration_sec?: number
  [k: string]: unknown
}

export async function estimateGeneration(input: EstimateInput): Promise<EstimateResult> {
  await requireUser()
  if (!input?.modelId || !input?.prompt || !String(input.prompt).trim()) {
    return { ok: false, message: '입력값을 확인해주세요.' }
  }
  const model = await prisma.model.findUnique({ where: { id: input.modelId } })
  if (!model || !model.is_active) return { ok: false, message: '사용할 수 없는 모델입니다.' }
  const config = getModelConfig(model.id)
  if (!config) return { ok: false, message: '모델 설정을 찾을 수 없습니다.' }
  const meta = toModelMeta(model)

  // 영상이면 durationParam 값(또는 명시적 duration_sec)을 가격용 duration_sec로 매핑.
  const durationVal = config.durationParam
    ? input[config.durationParam] ?? input.duration_sec
    : input.duration_sec
  const params = {
    prompt: String(input.prompt),
    count: input.count,
    duration_sec: durationVal !== undefined ? Number(durationVal) : undefined,
    // 오디오 단가 분기를 위해 generate_audio를 가격 계산까지 전달 (미지정/false → 기본 단가)
    generate_audio: input.generate_audio === true,
    // 토큰 과금 영상(per_video_token)의 출력 픽셀 산출용
    resolution: typeof input.resolution === 'string' ? input.resolution : undefined,
    ratio: typeof input.ratio === 'string' ? input.ratio : undefined,
  }
  let billedUsd: number
  let baseUsd: number
  try {
    baseUsd = estimateRawUsd(meta, params)
    billedUsd = estimateBilledUsd(meta, params)
  } catch (e) {
    if (e instanceof UnsupportedDurationError) return { ok: false, message: '지원하지 않는 길이입니다.' }
    throw e
  }
  let fxRate: number
  try { fxRate = await getCurrentFxRate() }
  catch { return { ok: false, message: '환율 정보를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.' } }
  const breakdown = buildBreakdown(meta, params, baseUsd, billedUsd)
  return { ok: true, billedUsd, krw: usdToKrw(billedUsd, fxRate), fxRate, breakdown }
}

// pricing_json + 결정된 params로 가격 분해(모델·단가·수량·마진)를 만든다.
// baseUsd/billedUsd는 호출부가 이미 계산한 값을 넘겨받아 실제 차감과 동일한 반올림을 유지한다.
function buildBreakdown(
  meta: ModelMeta,
  params: { prompt: string; count?: number; duration_sec?: number; generate_audio?: boolean; resolution?: string; ratio?: string },
  baseUsd: number,
  billedUsd: number,
): EstimateBreakdown {
  const p = meta.pricing_json
  const marginPct = meta.margin_pct
  switch (p.kind) {
    case 'per_image': {
      const units = params.count ?? 1
      return { kind: 'per_image', unitUsd: p.usd_per_unit, units, unitLabel: '장', marginPct, baseUsd, billedUsd }
    }
    case 'per_second': {
      const units = params.duration_sec ?? 1
      // 오디오 ON이면 오디오 단가가 표시되도록 유효 단가를 사용 (unitUsd*units == baseUsd 유지)
      const unitUsd = perSecondUnitUsd(p, params)
      return { kind: 'per_second', unitUsd, units, unitLabel: '초', marginPct, baseUsd, billedUsd }
    }
    case 'per_video_token': {
      // 해상도·화면비에 따라 초당 원가가 달라지므로 유효 초당 단가(baseUsd/초)로 표시.
      const units = params.duration_sec ?? 1
      const unitUsd = units > 0 ? baseUsd / units : baseUsd
      return { kind: 'per_video_token', unitUsd, units, unitLabel: '초', marginPct, baseUsd, billedUsd }
    }
    case 'per_token': {
      return { kind: 'per_token', unitUsd: p.usd_per_unit, units: 1, unitLabel: '건', marginPct, baseUsd, billedUsd }
    }
    case 'per_video_fixed': {
      return { kind: 'per_video_fixed', unitUsd: baseUsd, units: 1, unitLabel: '건', marginPct, baseUsd, billedUsd }
    }
  }
}

export type CreateResult =
  | { ok: true; generationId: string }
  | { ok: false; code: 'VALIDATION' | 'MODEL' | 'INSUFFICIENT' | 'ADAPTER' | 'DURATION' | 'RATE_LIMIT' | 'UNKNOWN'; message: string }

// 모델-불문 통합 생성 액션. 입력은 config 기반 동적 zod로 검증되어 어댑터에 그대로 전달된다.
// 이미지=동기(생성→업로드→정산), 영상=비동기(작업등록→RUNNING, 확정은 폴링 cron).
export async function createGeneration(
  modelId: string,
  inputs: Record<string, unknown>,
): Promise<CreateResult> {
  const user = await requireUser()

  const model = await prisma.model.findUnique({ where: { id: modelId } })
  if (!model || !model.is_active) {
    return { ok: false, code: 'MODEL', message: '사용할 수 없는 모델입니다.' }
  }
  const dbKind = model.kind as 'IMAGE' | 'VIDEO'
  const config = getModelConfig(model.id)
  if (!config) return { ok: false, code: 'MODEL', message: '모델 설정을 찾을 수 없습니다.' }

  // 1) 입력 검증 (config 기반)
  const schema = buildInputSchema(config)
  const parsed = schema.safeParse(inputs)
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: '입력값을 확인해주세요.' }
  const data = parsed.data

  // 2) 레이트 리밋 (ADMIN 면제)
  if (user.role !== 'ADMIN') {
    const key = dbKind === 'IMAGE' ? 'image_gen' : 'video_gen'
    const ok = await checkDualLimit(user.id, key, RATE_LIMITS[key].perMin, RATE_LIMITS[key].perHour)
    if (!ok) return { ok: false, code: 'RATE_LIMIT', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
  }

  const imageAdapter = dbKind === 'IMAGE' ? getImageAdapter(model.id) : null
  const videoAdapter = dbKind === 'VIDEO' ? getVideoAdapter(model.id) : null
  if (dbKind === 'IMAGE' ? !imageAdapter : !videoAdapter) {
    return { ok: false, code: 'MODEL', message: '모델 어댑터가 없습니다.' }
  }

  const wallet = await prisma.wallet.findUnique({ where: { user_id: user.id } })
  if (!wallet) return { ok: false, code: 'UNKNOWN', message: '지갑을 찾을 수 없습니다.' }

  const meta = toModelMeta(model)
  const prompt = String(data.prompt ?? '')

  // 가격: 영상이면 durationParam 값을 duration_sec로 매핑.
  // (durationParam 키가 없으면 명시적 duration_sec로 폴백 — estimateGeneration과 동일 규약)
  // duration_sec는 필드로 선언되지 않아 strip될 수 있으므로 raw inputs에서도 폴백한다.
  const durationVal = config.durationParam
    ? data[config.durationParam] ?? inputs.duration_sec
    : inputs.duration_sec
  let billedUsd: number
  try {
    const resolutionVal = data.resolution ?? inputs.resolution
    const ratioVal = data.ratio ?? inputs.ratio
    billedUsd = estimateBilledUsd(meta, {
      prompt,
      count: typeof inputs.count === 'number' && inputs.count > 0 ? inputs.count : 1,
      duration_sec: durationVal !== undefined ? Number(durationVal) : undefined,
      // 오디오 단가 분기. 검증 통과한 data 우선, 없으면 raw inputs 폴백.
      generate_audio: (data.generate_audio ?? inputs.generate_audio) === true,
      // 토큰 과금 영상(per_video_token) 출력 픽셀 산출용
      resolution: typeof resolutionVal === 'string' ? resolutionVal : undefined,
      ratio: typeof ratioVal === 'string' ? ratioVal : undefined,
    })
  } catch (e) {
    if (e instanceof UnsupportedDurationError) return { ok: false, code: 'DURATION', message: '지원하지 않는 길이입니다.' }
    console.error('[createGeneration] pricing failed:', e)
    return { ok: false, code: 'UNKNOWN', message: '가격 계산에 실패했습니다.' }
  }

  let fxRate: number
  try { fxRate = await getCurrentFxRate() }
  catch { return { ok: false, code: 'UNKNOWN', message: '환율 정보를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.' } }
  const krw = usdToKrw(billedUsd, fxRate)

  // 3) Generation(PENDING) + 견적 차감(CHARGE)을 한 트랜잭션으로. 잔액부족 → 롤백.
  let generationId: string
  try {
    // pgBouncer transaction mode에서도 interactive tx는 BEGIN~COMMIT 동안 서버 커넥션이
    // pin되므로 wallet_apply_tx 내부의 FOR UPDATE 락이 보장된다.
    const created = await prisma.$transaction(async (tx) => {
      const gen = await tx.generation.create({
        data: {
          user_id: user.id, model_id: model.id, kind: dbKind,
          prompt, params_json: data as object,
          status: 'PENDING',
          cost_usd_billed: billedUsd, margin_pct: meta.margin_pct, fx_rate: fxRate, charged_krw: krw,
        },
      })
      const memo = dbKind === 'IMAGE' ? '이미지 생성' : '영상 생성'
      await tx.$executeRaw`SELECT wallet_apply_tx(${wallet.id}::text, 'CHARGE', ${-krw}::int, 'generation', ${gen.id}::text, ${memo})`
      return gen
    })
    generationId = created.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('INSUFFICIENT_BALANCE')) {
      return { ok: false, code: 'INSUFFICIENT', message: `잔액이 부족합니다. (필요: ₩${krw.toLocaleString('ko-KR')})` }
    }
    console.error('[createGeneration] charge tx failed:', e)
    return { ok: false, code: 'UNKNOWN', message: '생성 요청 처리에 실패했습니다.' }
  }

  const adapterParams = data as GenerationParams

  if (dbKind === 'IMAGE') {
    // 2) RUNNING
    await prisma.generation.update({ where: { id: generationId }, data: { status: 'RUNNING', started_at: new Date() } })

    // 3) 외부 어댑터 호출 → 실패 시 전액 환불
    try {
      const result = await imageAdapter!.generate(adapterParams)
      const uploads = result.images.map((img, i) => ({
        path: `${user.id}/${generationId}/output_${i}.png`,
        b64: img.b64, contentType: img.contentType,
      }))
      const paths = await uploadGenerationImages(uploads)

      // 4) 정산: 실제 > 견적이면 차액만 추가 차감. 이미지 고정가 모델은 extra=0(미발화).
      //    정산 차감이 실패해도 생성 자체는 성공 처리한다(결과물은 이미 저장됨).
      const actualBilledKrw = krw
      const extra = computeSettlementKrw(krw, actualBilledKrw)
      if (extra > 0) {
        try {
          await prisma.$executeRaw`SELECT wallet_apply_tx(${wallet.id}::text, 'CHARGE', ${-extra}::int, 'generation', ${generationId}::text, ${'정산 차액'})`
        } catch (settleErr) {
          console.error('[createGeneration] settlement charge failed (generation still succeeds):', generationId, settleErr)
        }
      }

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      await prisma.generation.update({
        where: { id: generationId },
        data: {
          status: 'SUCCEEDED', result_urls: paths, finished_at: new Date(),
          expires_at: expiresAt, cost_usd_raw: result.cost_usd_raw,
          result_meta_json: (result.meta ?? {}) as object,
        },
      })
      revalidatePath('/library')
      return { ok: true, generationId }
    } catch (e) {
      console.error('[createGeneration] adapter/storage failed:', e)
      try {
        await prisma.$executeRaw`SELECT wallet_apply_tx(${wallet.id}::text, 'REFUND', ${krw}::int, 'generation', ${generationId}::text, ${'생성 실패 환불'})`
      } catch (refundErr) {
        console.error('[CRITICAL] REFUND FAILED — 사용자 차감 후 환불 실패:', generationId, refundErr)
      }
      try {
        await prisma.generation.update({
          where: { id: generationId },
          data: { status: 'FAILED', failed_reason: (e instanceof Error ? e.message : 'unknown').slice(0, 500), finished_at: new Date() },
        })
      } catch (updateErr) {
        console.error('[createGeneration] FAILED 상태 업데이트 실패:', generationId, updateErr)
      }
      return { ok: false, code: 'ADAPTER', message: '생성에 실패했습니다. 차감 금액은 환불되었습니다.' }
    }
  }

  // VIDEO: 외부 작업 등록 + RUNNING 전이. 어느 단계든 실패하면 전액 환불 + FAILED(고아 방지).
  try {
    const { externalJobId } = await videoAdapter!.start(adapterParams)
    await prisma.generation.update({
      where: { id: generationId },
      data: { status: 'RUNNING', external_job_id: externalJobId, started_at: new Date() },
    })
  } catch (e) {
    console.error('[createGeneration] start/RUNNING-transition failed:', generationId, e)
    try {
      await prisma.$executeRaw`SELECT wallet_apply_tx(${wallet.id}::text, 'REFUND', ${krw}::int, 'generation', ${generationId}::text, ${'영상 등록 실패 환불'})`
    } catch (refundErr) { console.error('[CRITICAL] REFUND FAILED:', generationId, refundErr) }
    try {
      await prisma.generation.updateMany({
        where: { id: generationId, status: { in: ['PENDING', 'RUNNING'] } },
        data: { status: 'FAILED', failed_reason: (e instanceof Error ? e.message : 'start failed').slice(0, 500), finished_at: new Date() },
      })
    } catch (uErr) { console.error('[createGeneration] FAILED update err:', generationId, uErr) }
    return { ok: false, code: 'ADAPTER', message: '영상 작업 등록에 실패했습니다. 차감 금액은 환불되었습니다.' }
  }

  revalidatePath('/library')
  return { ok: true, generationId }
}

// ── 하위호환 래퍼 (Task 6에서 DynamicGenerator로 교체 전까지 기존 호출부 컴파일 유지) ──
export async function createImageGeneration(
  input: { modelId: string; prompt: string; count?: number },
): Promise<CreateResult> {
  return createGeneration(input.modelId, { prompt: input.prompt, count: input.count })
}

export async function createVideoGeneration(
  input: { modelId: string; prompt: string; duration_sec: number },
): Promise<CreateResult> {
  return createGeneration(input.modelId, { prompt: input.prompt, duration_sec: input.duration_sec })
}
