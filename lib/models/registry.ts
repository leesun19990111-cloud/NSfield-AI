import type { ImageAdapter } from './adapter'
import { gptImageAdapter } from './image/gpt-image'
import { mockImageAdapter } from './image/mock'

const imageAdapters: Record<string, ImageAdapter> = {
  [gptImageAdapter.id]: gptImageAdapter,
  [mockImageAdapter.id]: mockImageAdapter,
}

export function getImageAdapter(modelId: string): ImageAdapter | null {
  return imageAdapters[modelId] ?? null
}
