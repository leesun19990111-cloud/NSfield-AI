import { prisma } from '@/lib/db/prisma'
import { getVideoAdapter } from '@/lib/models/registry'
import { uploadGenerationImages } from '@/lib/storage/upload'
import { computeSettlementKrw } from '@/lib/generation/settle'
import { fetchWithTimeout } from '@/lib/http/fetch'

const TIMEOUT_MS = 30 * 60 * 1000 // 30분

// videoUrl(data: 또는 http) → base64
async function fetchAsBase64(url: string): Promise<{ b64: string; contentType: string }> {
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;]+);base64,(.*)$/)
    if (!m) throw new Error('INVALID_DATA_URL')
    return { b64: m[2]!, contentType: m[1]! }
  }
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error('VIDEO_DOWNLOAD_FAILED')
  const buf = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') ?? 'video/mp4'
  return { b64: buf.toString('base64'), contentType }
}

async function refund(walletUserId: string, genId: string, krw: number, memo: string) {
  const wallet = await prisma.wallet.findUnique({ where: { user_id: walletUserId } })
  if (!wallet) { console.error('[poll] wallet not found for refund', genId); return }
  try {
    await prisma.$executeRaw`SELECT wallet_apply_tx(${wallet.id}::text, 'REFUND', ${krw}::int, 'generation', ${genId}::text, ${memo})`
  } catch (e) { console.error('[CRITICAL] poll REFUND failed', genId, e) }
}

export async function pollRunningVideoGenerations(): Promise<{ processed: number; succeeded: number; failed: number }> {
  const running = await prisma.generation.findMany({
    where: { status: 'RUNNING', kind: 'VIDEO' },
    take: 50,
    orderBy: { last_polled_at: 'asc' },
  })
  let succeeded = 0, failed = 0, processed = 0

  const modelIds = [...new Set(running.map((g) => g.model_id))]
  const models = await prisma.model.findMany({ where: { id: { in: modelIds } } })
  const modelMap = new Map(models.map((m) => [m.id, m]))

  for (const gen of running) {
    // 모델 폴링 간격
    const model = modelMap.get(gen.model_id)
    const pollIntervalSec = (model?.pricing_json as { options?: { polling_interval_sec?: number } } | null)?.options?.polling_interval_sec ?? 60
    if (gen.last_polled_at && Date.now() - new Date(gen.last_polled_at).getTime() < pollIntervalSec * 1000) {
      continue
    }
    processed++

    // 타임아웃
    if (gen.started_at && Date.now() - new Date(gen.started_at).getTime() > TIMEOUT_MS) {
      const upd = await prisma.generation.updateMany({
        where: { id: gen.id, status: 'RUNNING' },
        data: { status: 'FAILED', failed_reason: 'timeout (30m)', finished_at: new Date() },
      })
      if (upd.count > 0 && gen.charged_krw) { await refund(gen.user_id, gen.id, gen.charged_krw, '영상 타임아웃 환불'); failed++ }
      continue
    }

    const adapter = getVideoAdapter(gen.model_id)
    if (!adapter || !gen.external_job_id) { continue }

    let result
    try { result = await adapter.poll(gen.external_job_id) }
    catch (e) { console.error('[poll] adapter.poll error', gen.id, e); await prisma.generation.update({ where: { id: gen.id }, data: { last_polled_at: new Date() } }); continue }

    if (result.status === 'running') {
      await prisma.generation.update({ where: { id: gen.id }, data: { last_polled_at: new Date() } })
      continue
    }

    if (result.status === 'failed') {
      const upd = await prisma.generation.updateMany({
        where: { id: gen.id, status: 'RUNNING' },
        data: { status: 'FAILED', failed_reason: result.reason.slice(0, 500), finished_at: new Date(), last_polled_at: new Date() },
      })
      if (upd.count > 0 && gen.charged_krw) { await refund(gen.user_id, gen.id, gen.charged_krw, '영상 생성 실패 환불'); failed++ }
      continue
    }

    // succeeded: 다운로드 → 저장 → SUCCEEDED 전이(가드) → 전이 성공 시에만 정산
    try {
      const { b64, contentType } = await fetchAsBase64(result.videoUrl)
      const ext = contentType.includes('mp4') ? 'mp4' : contentType.includes('png') ? 'png' : 'bin'
      const path = `${gen.user_id}/${gen.id}/output_0.${ext}`
      const paths = await uploadGenerationImages([{ path, b64, contentType }])

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      const upd = await prisma.generation.updateMany({
        where: { id: gen.id, status: 'RUNNING' },
        data: {
          status: 'SUCCEEDED', result_urls: paths, finished_at: new Date(), last_polled_at: new Date(),
          expires_at: expiresAt, cost_usd_raw: result.cost_usd_raw,
          result_meta_json: (result.meta ?? {}) as object,
        },
      })
      if (upd.count > 0) {
        // 이 인스턴스만 RUNNING→SUCCEEDED 전이에 성공 → 정산은 여기서만
        const charged = gen.charged_krw ?? 0
        const extra = computeSettlementKrw(charged, charged) // 고정가: 0. per_second 모델 추가 시 result.cost_usd_raw로 actual 계산 필요(TODO)
        if (extra > 0) {
          const wallet = await prisma.wallet.findUnique({ where: { user_id: gen.user_id } })
          if (wallet) {
            try { await prisma.$executeRaw`SELECT wallet_apply_tx(${wallet.id}::text, 'CHARGE', ${-extra}::int, 'generation', ${gen.id}::text, ${'정산 차액'})` }
            catch (e) { console.error('[poll] settlement charge failed', gen.id, e) }
          }
        }
        succeeded++
      }
    } catch (e) {
      console.error('[poll] succeeded-handling failed (refund)', gen.id, e)
      const upd = await prisma.generation.updateMany({
        where: { id: gen.id, status: 'RUNNING' },
        data: { status: 'FAILED', failed_reason: (e instanceof Error ? e.message : 'store failed').slice(0, 500), finished_at: new Date(), last_polled_at: new Date() },
      })
      if (upd.count > 0 && gen.charged_krw) { await refund(gen.user_id, gen.id, gen.charged_krw, '영상 저장 실패 환불'); failed++ }
    }
  }

  return { processed, succeeded, failed }
}
