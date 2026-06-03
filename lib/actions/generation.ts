'use server'

import { requireUser } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { getCurrentFxRate } from '@/lib/fx/service'
import { estimateBilledUsd } from '@/lib/models/pricing'
import { usdToKrw } from '@/lib/money/format'
import { getImageAdapter } from '@/lib/models/registry'
import { uploadGenerationImages } from '@/lib/storage/upload'
import { computeSettlementKrw } from '@/lib/generation/settle'
import { imageGenerateSchema, type ImageGenerateInput } from '@/lib/validation/generation'
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

export async function estimateGeneration(input: ImageGenerateInput): Promise<EstimateResult> {
  await requireUser()
  const parsed = imageGenerateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: '입력값을 확인해주세요.' }
  const model = await prisma.model.findUnique({ where: { id: parsed.data.modelId } })
  if (!model || !model.is_active) return { ok: false, message: '사용할 수 없는 모델입니다.' }
  const meta = toModelMeta(model)
  const billedUsd = estimateBilledUsd(meta, { prompt: parsed.data.prompt, count: parsed.data.count })
  let fxRate: number
  try { fxRate = await getCurrentFxRate() }
  catch { return { ok: false, message: '환율 정보를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.' } }
  return { ok: true, billedUsd, krw: usdToKrw(billedUsd, fxRate), fxRate }
}

export type CreateResult =
  | { ok: true; generationId: string }
  | { ok: false; code: 'VALIDATION' | 'MODEL' | 'INSUFFICIENT' | 'ADAPTER' | 'UNKNOWN'; message: string }

export async function createImageGeneration(input: ImageGenerateInput): Promise<CreateResult> {
  const user = await requireUser()
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
