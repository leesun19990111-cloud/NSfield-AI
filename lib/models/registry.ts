import type { ImageAdapter, VideoAdapter } from './adapter'
import { gptImageAdapter } from './image/gpt-image'
import { seedreamAdapter } from './image/seedream'
import { nanobanana20Adapter, nanobananaProAdapter } from './image/nanobanana'
import { mockImageAdapter } from './image/mock'
import { veo3Adapter } from './video/veo3'
import { klingAdapter } from './video/kling'
import { seedanceAdapter } from './video/seedance'
import { mockVideoAdapter } from './video/mock'

const isNonProd = process.env.NODE_ENV !== 'production'

const imageAdapters: Record<string, ImageAdapter> = {
  [gptImageAdapter.id]: gptImageAdapter,
  [seedreamAdapter.id]: seedreamAdapter,
  [nanobanana20Adapter.id]: nanobanana20Adapter,
  [nanobananaProAdapter.id]: nanobananaProAdapter,
  ...(isNonProd ? { [mockImageAdapter.id]: mockImageAdapter } : {}),
}
const videoAdapters: Record<string, VideoAdapter> = {
  [veo3Adapter.id]: veo3Adapter,
  [klingAdapter.id]: klingAdapter,
  [seedanceAdapter.id]: seedanceAdapter,
  ...(isNonProd ? { [mockVideoAdapter.id]: mockVideoAdapter } : {}),
}

export function getImageAdapter(modelId: string): ImageAdapter | null { return imageAdapters[modelId] ?? null }
export function getVideoAdapter(modelId: string): VideoAdapter | null { return videoAdapters[modelId] ?? null }
