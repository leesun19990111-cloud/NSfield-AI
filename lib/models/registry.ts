import type { ImageAdapter } from './adapter'
import { gptImageAdapter } from './image/gpt-image'
import { mockImageAdapter } from './image/mock'

const imageAdapters: Record<string, ImageAdapter> = {
  [gptImageAdapter.id]: gptImageAdapter,
  // mock 어댑터는 테스트/개발 전용 — production 레지스트리에서 제외(무료 생성 방지)
  ...(process.env.NODE_ENV !== 'production' ? { [mockImageAdapter.id]: mockImageAdapter } : {}),
}

export function getImageAdapter(modelId: string): ImageAdapter | null {
  return imageAdapters[modelId] ?? null
}
