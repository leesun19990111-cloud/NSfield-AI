import { fetchWithTimeout } from '@/lib/http/fetch'
import type { ImageAdapter, ImageGenerateResult } from '../adapter'
import { AdapterError } from '../adapter'
import type { GenerationParams } from '../types'

const ATLAS_BASE = 'https://api.atlascloud.ai/api/v1/model'
const POLL_INTERVAL_MS = 2000
const MAX_POLL_MS = 50_000 // generate()는 maxDuration 60초 안에서 완료

function stripDataUri(s: string): string {
  const m = s.match(/^data:[^;]+;base64,(.*)$/)
  return m ? m[1]! : s
}

// AtlasCloud 호스팅 모델용 공용 이미지 어댑터. submit→poll→base64.
function makeAtlasImageAdapter(id: string, atlasModel: string, costUsd: number): ImageAdapter {
  return {
    id,
    kind: 'IMAGE',
    async generate(params: GenerationParams): Promise<ImageGenerateResult> {
      const key = process.env.ATLASCLOUD_API_KEY
      if (!key) throw new AdapterError('ATLASCLOUD_NO_KEY', 'ATLASCLOUD_API_KEY 미설정')
      const authHeaders = { authorization: `Bearer ${key}` }

      // 1) submit
      const submitRes = await fetchWithTimeout(`${ATLAS_BASE}/generateImage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          model: atlasModel,
          prompt: params.prompt,
          aspect_ratio: typeof params.aspect_ratio === 'string' ? params.aspect_ratio : '1:1',
          resolution: '1k',
          enable_base64_output: true,
          output_format: 'png',
        }),
      })
      if (!submitRes.ok) throw new AdapterError('ATLASCLOUD_ERROR', `AtlasCloud submit ${submitRes.status}`)
      const submitJson = (await submitRes.json()) as { data?: { id?: string } }
      const predictionId = submitJson.data?.id
      if (!predictionId) throw new AdapterError('ATLASCLOUD_NO_JOB', '예측 ID 없음')

      // 2) poll
      const deadline = Date.now() + MAX_POLL_MS
      while (Date.now() < deadline) {
        const pollRes = await fetchWithTimeout(
          `${ATLAS_BASE}/prediction/${encodeURIComponent(predictionId)}`,
          { headers: authHeaders },
        )
        if (!pollRes.ok) throw new AdapterError('ATLASCLOUD_ERROR', `AtlasCloud poll ${pollRes.status}`)
        const pollJson = (await pollRes.json()) as {
          data?: { status?: string; outputs?: string[]; error?: string }
        }
        const status = pollJson.data?.status
        if (status === 'completed' || status === 'succeeded') {
          const out = pollJson.data?.outputs ?? []
          if (out.length === 0 || !out[0]) throw new AdapterError('ATLASCLOUD_EMPTY', '결과 이미지 없음')
          return {
            images: [{ b64: stripDataUri(out[0]), contentType: 'image/png' }],
            cost_usd_raw: costUsd,
            meta: { provider: 'atlascloud', model: atlasModel, prediction_id: predictionId },
          }
        }
        if (status === 'failed') {
          throw new AdapterError('ATLASCLOUD_FAILED', pollJson.data?.error || 'AtlasCloud 생성 실패')
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }
      throw new AdapterError('ATLASCLOUD_TIMEOUT', '생성 시간 초과')
    },
  }
}

// nano-banana-2 (문서 확인됨)
export const nanobanana20Adapter: ImageAdapter = makeAtlasImageAdapter(
  'nanobanana-2.0',
  'google/nano-banana-2/text-to-image',
  0.02,
)
// TODO(owner): nano-banana Pro의 실제 AtlasCloud 모델 id 확정 필요(아래는 추정). 키/엔드포인트는 동일.
export const nanobananaProAdapter: ImageAdapter = makeAtlasImageAdapter(
  'nanobanana-pro',
  'google/nano-banana-2-pro/text-to-image',
  0.05,
)
