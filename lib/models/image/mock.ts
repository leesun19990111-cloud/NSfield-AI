import type { ImageAdapter, ImageGenerateResult } from '../adapter'
import type { GenerationParams } from '../types'

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

export const mockImageAdapter: ImageAdapter = {
  id: 'mock-image',
  kind: 'IMAGE',
  async generate(_params: GenerationParams): Promise<ImageGenerateResult> {
    return {
      images: [{ b64: TINY_PNG_B64, contentType: 'image/png' }],
      cost_usd_raw: 0.04,
      meta: { mock: true },
    }
  },
}
