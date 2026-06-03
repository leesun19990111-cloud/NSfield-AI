import { fetchWithTimeout } from '@/lib/http/fetch'
import type { ImageAdapter, ImageGenerateResult } from '../adapter'
import { AdapterError } from '../adapter'
import type { GenerationParams } from '../types'

// TODO(owner): ByteDance Seedream 실제 엔드포인트/요청·응답 스키마 확정 필요. 아래는 형식 골격.
export const seedreamAdapter: ImageAdapter = {
  id: 'seedream-4.5',
  kind: 'IMAGE',
  async generate(params: GenerationParams): Promise<ImageGenerateResult> {
    const key = process.env.BYTEDANCE_API_KEY
    if (!key) throw new AdapterError('SEEDREAM_NO_KEY', 'BYTEDANCE_API_KEY 미설정')

    const count = params.count ?? 1
    // TODO(owner): 실제 엔드포인트/스키마 확정
    const res = await fetchWithTimeout('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'seedream-4.5', prompt: params.prompt, n: count, response_format: 'b64_json' }),
    })
    if (!res.ok) throw new AdapterError('SEEDREAM_ERROR', `Seedream ${res.status}`)
    const json = (await res.json()) as { data?: { b64_json?: string }[] }
    const data = json.data ?? []
    if (data.length === 0 || !data[0]?.b64_json) {
      throw new AdapterError('SEEDREAM_ERROR', '결과 이미지 없음')
    }
    return {
      images: data.map((d) => ({ b64: d.b64_json!, contentType: 'image/png' })),
      cost_usd_raw: 0.03 * count,
    }
  },
}
