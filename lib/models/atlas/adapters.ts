import { fetchWithTimeout } from '@/lib/http/fetch'
import type { ImageAdapter, VideoAdapter, ImageGenerateResult, VideoPollResult } from '@/lib/models/adapter'
import { AdapterError } from '@/lib/models/adapter'
import type { ModelConfig } from '@/lib/models/catalog/types'
import type { GenerationParams } from '@/lib/models/types'
import { atlasSubmit, atlasPoll } from './client'

const POLL_INTERVAL_MS = 2000
const MAX_POLL_MS = 40_000

async function urlToBase64(url: string): Promise<{ b64: string; contentType: string }> {
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;]+);base64,(.*)$/)
    if (m) return { contentType: m[1]!, b64: m[2]! }
  }
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new AdapterError('ATLASCLOUD_DOWNLOAD_FAILED', `다운로드 ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return { contentType: res.headers.get('content-type') ?? 'image/png', b64: buf.toString('base64') }
}

// raw 응답에서 total_tokens가 있으면 추출 (meta 기록용)
function tokensFromRaw(raw: unknown): number | undefined {
  if (raw && typeof raw === 'object') {
    const t = (raw as Record<string, unknown>).total_tokens
    if (typeof t === 'number') return t
  }
  return undefined
}

// 이미지: 동기 (submit + inline poll ≤ 40s → base64)
export function makeAtlasImageAdapter(config: ModelConfig): ImageAdapter {
  return {
    id: config.id,
    kind: 'IMAGE',
    async generate(params: GenerationParams): Promise<ImageGenerateResult> {
      const predictionId = await atlasSubmit(config, params as Record<string, unknown>)
      const deadline = Date.now() + MAX_POLL_MS
      while (Date.now() < deadline) {
        const r = await atlasPoll(predictionId)
        if (r.status === 'succeeded') {
          const img = await urlToBase64(r.url)
          const total_tokens = tokensFromRaw(r.raw)
          const meta: Record<string, unknown> = { atlas_model: config.atlasModel, prediction_id: predictionId }
          if (total_tokens !== undefined) meta.total_tokens = total_tokens
          return { images: [img], cost_usd_raw: 0, meta }
        }
        if (r.status === 'failed') throw new AdapterError('ATLASCLOUD_FAILED', r.reason)
        await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS))
      }
      throw new AdapterError('ATLASCLOUD_TIMEOUT', '이미지 생성 시간 초과')
    },
  }
}

// 영상: 비동기 (start=submit, poll=atlasPoll → VideoPollResult)
export function makeAtlasVideoAdapter(config: ModelConfig): VideoAdapter {
  return {
    id: config.id,
    kind: 'VIDEO',
    async start(params: GenerationParams) {
      const externalJobId = await atlasSubmit(config, params as Record<string, unknown>)
      return { externalJobId }
    },
    async poll(externalJobId: string): Promise<VideoPollResult> {
      const r = await atlasPoll(externalJobId)
      if (r.status === 'succeeded') {
        const total_tokens = tokensFromRaw(r.raw)
        const meta: Record<string, unknown> = { atlas_model: config.atlasModel }
        if (total_tokens !== undefined) meta.total_tokens = total_tokens
        return { status: 'succeeded', videoUrl: r.url, cost_usd_raw: 0, meta }
      }
      if (r.status === 'failed') return { status: 'failed', reason: r.reason }
      return { status: 'running' }
    },
  }
}
