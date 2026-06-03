import { fetchWithTimeout } from '@/lib/http/fetch'
import type { ImageAdapter, ImageGenerateResult } from '../adapter'
import { AdapterError } from '../adapter'
import type { GenerationParams } from '../types'

export const gptImageAdapter: ImageAdapter = {
  id: 'gpt-image-2.0',
  kind: 'IMAGE',
  async generate(params: GenerationParams): Promise<ImageGenerateResult> {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new AdapterError('OPENAI_NO_KEY', 'OPENAI_API_KEY 미설정')

    const count = params.count ?? 1
    const res = await fetchWithTimeout('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: params.prompt,
        n: count,
        size: '1024x1024',
        response_format: 'b64_json',
      }),
    })
    if (!res.ok) {
      throw new AdapterError('OPENAI_ERROR', `OpenAI ${res.status}`)
    }
    const json = (await res.json()) as { data?: { b64_json?: string }[] }
    const data = json.data ?? []
    if (data.length === 0 || !data[0]?.b64_json) {
      throw new AdapterError('OPENAI_EMPTY', '결과 이미지 없음')
    }
    return {
      images: data.map((d) => ({ b64: d.b64_json!, contentType: 'image/png' })),
      cost_usd_raw: 0.04 * count,
    }
  },
}
