import type { ImageAdapter, VideoAdapter } from './adapter'
import { gptImageAdapter } from './image/gpt-image'
import { mockImageAdapter } from './image/mock'
import { mockVideoAdapter } from './video/mock'
import { makeAtlasImageAdapter, makeAtlasVideoAdapter } from './atlas/adapters'
import { listConfigs } from './catalog/registry'

const isNonProd = process.env.NODE_ENV !== 'production'
const imageAdapters: Record<string, ImageAdapter> = {}
const videoAdapters: Record<string, VideoAdapter> = {}

for (const c of listConfigs()) {
  if (c.id === 'gpt-image-2.0') {
    imageAdapters[c.id] = gptImageAdapter // OpenAI, AtlasCloud 아님
    continue
  }
  if (c.atlasModel === '') continue // atlas도 gpt도 아닌 config: 스킵
  if (c.output === 'IMAGE') imageAdapters[c.id] = makeAtlasImageAdapter(c)
  else videoAdapters[c.id] = makeAtlasVideoAdapter(c)
}

if (isNonProd) {
  imageAdapters[mockImageAdapter.id] = mockImageAdapter
  videoAdapters[mockVideoAdapter.id] = mockVideoAdapter
}

export function getImageAdapter(modelId: string): ImageAdapter | null {
  return imageAdapters[modelId] ?? null
}
export function getVideoAdapter(modelId: string): VideoAdapter | null {
  return videoAdapters[modelId] ?? null
}
