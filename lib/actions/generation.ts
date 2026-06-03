'use server'

import { requireUser } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { getCurrentFxRate } from '@/lib/fx/service'
import { estimateBilledUsd, UnsupportedDurationError } from '@/lib/models/pricing'
import { usdToKrw } from '@/lib/money/format'
import { getImageAdapter, getVideoAdapter } from '@/lib/models/registry'
import { uploadGenerationImages } from '@/lib/storage/upload'
import { computeSettlementKrw } from '@/lib/generation/settle'
import { checkDualLimit, RATE_LIMITS } from '@/lib/rate-limit/token-bucket'
import {
  imageGenerateSchema, type ImageGenerateInput,
  videoGenerateSchema, type VideoGenerateInput,
} from '@/lib/validation/generation'
import type { ModelMeta, PricingJson } from '@/lib/models/types'
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

export type EstimateResult =
  | { ok: true; billedUsd: number; krw: number; fxRate: number }
  | { ok: false; message: string }

export type EstimateInput = {
  modelId: string
  prompt: string
  count?: number
  duration_sec?: number
}

export async function estimateGeneration(input: EstimateInput): Promise<EstimateResult> {
  await requireUser()
  if (!input?.modelId || !input?.prompt || !input.prompt.trim()) {
    return { ok: false, message: '입력값을 확인해주세요.' }
  }
  const model = await prisma.model.findUnique({ where: { id: input.modelId } })
  if (!model || !model.is_active) return { ok: false, message: '사용할 수 없는 모델입니다.' }
  const meta = toModelMeta(model)
  let billedUsd: number
  try {
    billedUsd = estimateBilledUsd(meta, { prompt: input.prompt, count: input.count, duration_sec: input.duration_sec })
  } catch (e) {
    if (e instanceof UnsupportedDurationError) return { ok: false, message: '지원하지 않는 길이입니다.' }
    throw e
  }
  let fxRate: number
  try { fxRate = await getCurrentFxRate() }
  catch { return { ok: false, message: '환율 정보를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.' } }
  return { ok: true, billedUsd, krw: usdToKrw(billedUsd, fxRate), fxRate }
}

export type CreateResult =
  | { ok: true; generationId: string }
  | { ok: false; code: 'VALIDATION' | 'MODEL' | 'INSUFFICIENT' | 'ADAPTER' | 'DURATION' | 'RATE_LIMIT' | 'UNKNOWN'; message: string }

export async function createImageGeneration(input: ImageGenerateInput): Promise<CreateResult> {
  const user = await requireUser()
  if (user.role !== 'ADMIN') {
    const ok = await checkDualLimit(user.id, 'image_gen', RATE_LIMITS.image_gen.perMin, RATE_LIMITS.image_gen.perHour)
    if (!ok) return { ok: false, code: 'RATE_LIMIT', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
  }
  const parsed = imageGenerateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: '입력값을 확인해주세요.' }
  const d = parsed.data

  const model = await prisma.model.findUnique({ where: { id: d.modelId } })
  if (!model || !model.is_active || model.kind !== 'IMAGE') {
    return { ok: false, code: 'MODEL', message: '사용할 수 없는 이미지 모델입니다.' }
  }
  const meta = toModelMeta(model)
  const adapter = getImageAdapter(model.id)
  if (!adapter) return { ok: false, code: 'MODEL', message: '모델 어댑터가 없습니다.' }

  const wallet = await prisma.wallet.findUnique({ where: { user_id: user.id } })
  if (!wallet) return { ok: false, code: 'UNKNOWN', message: '지갑을 찾을 수 없습니다.' }

  const billedUsd = estimateBilledUsd(meta, { prompt: d.prompt, count: d.count })
  let fxRate: number
  try { fxRate = await getCurrentFxRate() }
  catch { return { ok: false, code: 'UNKNOWN', message: '환율 정보를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.' } }
  const krw = usdToKrw(billedUsd, fxRate)

  // 1) Generation(PENDING) + 견적 차감(CHARGE)을 한 트랜잭션으로. 잔액부족 → 롤백.
  let generationId: string
  try {
    // pgBouncer transaction mode에서도 interactive tx는 BEGIN~COMMIT 동안 서버 커넥션이
    // pin되므로 wallet_apply_tx 내부의 FOR UPDATE 락이 보장된다. (DATABASE_URL=pooler ?pgbouncer=true)
    const created = await prisma.$transaction(async (tx) => {
      const gen = await tx.generation.create({
        data: {
          user_id: user.id, model_id: model.id, kind: 'IMAGE',
          prompt: d.prompt, params_json: { count: d.count },
          status: 'PENDING',
          cost_usd_billed: billedUsd, margin_pct: meta.margin_pct, fx_rate: fxRate, charged_krw: krw,
        },
      })
      await tx.$executeRaw`SELECT wallet_apply_tx(${wallet.id}::text, 'CHARGE', ${-krw}::int, 'generation', ${gen.id}::text, ${'이미지 생성'})`
      return gen
    })
    generationId = created.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('INSUFFICIENT_BALANCE')) {
      return { ok: false, code: 'INSUFFICIENT', message: `잔액이 부족합니다. (필요: ₩${krw.toLocaleString('ko-KR')})` }
    }
    console.error('[createImageGeneration] charge tx failed:', e)
    return { ok: false, code: 'UNKNOWN', message: '생성 요청 처리에 실패했습니다.' }
  }

  // 2) RUNNING
  await prisma.generation.update({ where: { id: generationId }, data: { status: 'RUNNING', started_at: new Date() } })

  // 3) 외부 어댑터 호출 → 실패 시 전액 환불
  try {
    const result = await adapter.generate({ prompt: d.prompt, count: d.count })
    const uploads = result.images.map((img, i) => ({
      path: `${user.id}/${generationId}/output_${i}.png`,
      b64: img.b64, contentType: img.contentType,
    }))
    const paths = await uploadGenerationImages(uploads)

    // 4) 정산: 실제 > 견적이면 차액만 추가 차감. 이미지 고정가 모델은 extra=0(미발화).
    //    정산 차감이 실패해도 생성 자체는 성공 처리한다(결과물은 이미 저장됨). 차액은 사후 보정 대상.
    const actualBilledKrw = krw
    const extra = computeSettlementKrw(krw, actualBilledKrw)
    if (extra > 0) {
      try {
        await prisma.$executeRaw`SELECT wallet_apply_tx(${wallet.id}::text, 'CHARGE', ${-extra}::int, 'generation', ${generationId}::text, ${'정산 차액'})`
      } catch (settleErr) {
        console.error('[createImageGeneration] settlement charge failed (generation still succeeds):', generationId, settleErr)
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
    console.error('[createImageGeneration] adapter/storage failed:', e)
    try {
      await prisma.$executeRaw`SELECT wallet_apply_tx(${wallet.id}::text, 'REFUND', ${krw}::int, 'generation', ${generationId}::text, ${'생성 실패 환불'})`
    } catch (refundErr) {
      console.error('[CRITICAL] REFUND FAILED — 사용자 차감 후 환불 실패:', generationId, refundErr)
      // TODO: 운영 알림(Sentry 등) 연동
    }
    try {
      await prisma.generation.update({
        where: { id: generationId },
        data: { status: 'FAILED', failed_reason: (e instanceof Error ? e.message : 'unknown').slice(0, 500), finished_at: new Date() },
      })
    } catch (updateErr) {
      console.error('[createImageGeneration] FAILED 상태 업데이트 실패:', generationId, updateErr)
    }
    return { ok: false, code: 'ADAPTER', message: '생성에 실패했습니다. 차감 금액은 환불되었습니다.' }
  }
}

// 영상 생성: 비동기. 견적(CHARGE) + PENDING 생성을 원자적으로 처리한 뒤,
// 외부 작업을 등록(adapter.start)하고 RUNNING으로 전환한다. 등록 실패 시 전액 환불.
// 완료/실패 확정은 폴링 cron(Task 3)이 담당한다 — 여기서는 저장/poll을 하지 않는다.
export async function createVideoGeneration(input: VideoGenerateInput): Promise<CreateResult> {
  const user = await requireUser()
  if (user.role !== 'ADMIN') {
    const ok = await checkDualLimit(user.id, 'video_gen', RATE_LIMITS.video_gen.perMin, RATE_LIMITS.video_gen.perHour)
    if (!ok) return { ok: false, code: 'RATE_LIMIT', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
  }
  const parsed = videoGenerateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: '입력값을 확인해주세요.' }
  const d = parsed.data

  const model = await prisma.model.findUnique({ where: { id: d.modelId } })
  if (!model || !model.is_active || model.kind !== 'VIDEO') {
    return { ok: false, code: 'MODEL', message: '사용할 수 없는 영상 모델입니다.' }
  }
  const meta = toModelMeta(model)
  const adapter = getVideoAdapter(model.id)
  if (!adapter) return { ok: false, code: 'MODEL', message: '모델 어댑터가 없습니다.' }

  const wallet = await prisma.wallet.findUnique({ where: { user_id: user.id } })
  if (!wallet) return { ok: false, code: 'UNKNOWN', message: '지갑을 찾을 수 없습니다.' }

  let billedUsd: number
  try { billedUsd = estimateBilledUsd(meta, { prompt: d.prompt, duration_sec: d.duration_sec }) }
  catch { return { ok: false, code: 'DURATION', message: '지원하지 않는 길이입니다.' } }

  let fxRate: number
  try { fxRate = await getCurrentFxRate() }
  catch { return { ok: false, code: 'UNKNOWN', message: '환율 정보를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.' } }
  const krw = usdToKrw(billedUsd, fxRate)

  // 1) Generation(PENDING) + hold 차감(CHARGE) 원자적
  let generationId: string
  try {
    const created = await prisma.$transaction(async (tx) => {
      const gen = await tx.generation.create({
        data: {
          user_id: user.id, model_id: model.id, kind: 'VIDEO',
          prompt: d.prompt, params_json: { duration_sec: d.duration_sec },
          status: 'PENDING',
          cost_usd_billed: billedUsd, margin_pct: meta.margin_pct, fx_rate: fxRate, charged_krw: krw,
        },
      })
      await tx.$executeRaw`SELECT wallet_apply_tx(${wallet.id}::text, 'CHARGE', ${-krw}::int, 'generation', ${gen.id}::text, ${'영상 생성'})`
      return gen
    })
    generationId = created.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('INSUFFICIENT_BALANCE')) {
      return { ok: false, code: 'INSUFFICIENT', message: `잔액이 부족합니다. (필요: ₩${krw.toLocaleString('ko-KR')})` }
    }
    console.error('[createVideoGeneration] charge tx failed:', e)
    return { ok: false, code: 'UNKNOWN', message: '생성 요청 처리에 실패했습니다.' }
  }

  // 2) 외부 작업 등록 + RUNNING 전이. 어느 단계든 실패하면 전액 환불 + FAILED.
  try {
    const { externalJobId } = await adapter.start({ prompt: d.prompt, duration_sec: d.duration_sec })
    await prisma.generation.update({
      where: { id: generationId },
      data: { status: 'RUNNING', external_job_id: externalJobId, started_at: new Date() },
    })
  } catch (e) {
    console.error('[createVideoGeneration] start/RUNNING-transition failed:', generationId, e)
    try {
      await prisma.$executeRaw`SELECT wallet_apply_tx(${wallet.id}::text, 'REFUND', ${krw}::int, 'generation', ${generationId}::text, ${'영상 등록 실패 환불'})`
    } catch (refundErr) { console.error('[CRITICAL] REFUND FAILED:', generationId, refundErr) }
    try {
      await prisma.generation.updateMany({
        where: { id: generationId, status: { in: ['PENDING', 'RUNNING'] } },
        data: { status: 'FAILED', failed_reason: (e instanceof Error ? e.message : 'start failed').slice(0, 500), finished_at: new Date() },
      })
    } catch (uErr) { console.error('[createVideoGeneration] FAILED update err:', generationId, uErr) }
    return { ok: false, code: 'ADAPTER', message: '영상 작업 등록에 실패했습니다. 차감 금액은 환불되었습니다.' }
  }

  revalidatePath('/library')
  return { ok: true, generationId }
}
