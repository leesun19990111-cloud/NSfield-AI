import { fetchWithTimeout } from '@/lib/http/fetch'
import type { ImageAdapter, ImageGenerateResult } from '../adapter'
import { AdapterError } from '../adapter'
import type { GenerationParams } from '../types'

// TODO(owner): NanoBanana 실제 엔드포인트/요청·응답 스키마 확정 필요. 아래는 형식 골격.
function makeNanobananaAdapter(id: string, model: string): ImageAdapter {
  return {
    id,
    kind: 'IMAGE',
    async generate(params: GenerationParams): Promise<ImageGenerateResult> {
      const key = process.env.NANOBANANA_API_KEY
      if (!key) throw new AdapterError('NANOBANANA_NO_KEY', 'NANOBANANA_API_KEY 미설정')

      const count = params.count ?? 1
      // TODO(owner): 실제 엔드포인트/스키마 확정
      const res = await fetchWithTimeout('https://api.nanobanana.ai/v1/images/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, prompt: params.prompt, n: count, response_format: 'b64_json' }),
      })
      if (!res.ok) throw new AdapterError('NANOBANANA_ERROR', `NanoBanana ${res.status}`)
      const json = (await res.json()) as { data?: { b64_json?: string }[] }
      const data = json.data ?? []
      if (data.length === 0 || !data[0]?.b64_json) {
        throw new AdapterError('NANOBANANA_ERROR', '결과 이미지 없음')
      }
      return {
        images: data.map((d) => ({ b64: d.b64_json!, contentType: 'image/png' })),
        cost_usd_raw: 0.02 * count,
      }
    },
  }
}

export const nanobanana20Adapter: ImageAdapter = makeNanobananaAdapter('nanobanana-2.0', 'nanobanana-2.0')
export const nanobananaProAdapter: ImageAdapter = makeNanobananaAdapter('nanobanana-pro', 'nanobanana-pro')
