import type { GenerationParams } from './types'

export type GeneratedImage = {
  b64: string          // base64 (data 부분만, data: 프리픽스 없음)
  contentType: string  // 'image/png' 등
}

export type ImageGenerateResult = {
  images: GeneratedImage[]
  cost_usd_raw: number   // 외부 API 실제 원가 (마진 전)
  meta?: Record<string, unknown>
}

// 이미지(동기) 어댑터. 외부 API 호출만 담당 — 가격/환율/저장은 모름.
export interface ImageAdapter {
  id: string
  kind: 'IMAGE'
  generate(params: GenerationParams): Promise<ImageGenerateResult>
}

export class AdapterError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code)
  }
}

export type VideoStartResult = { externalJobId: string; cost_usd_raw_estimate?: number }
export type VideoPollResult =
  | { status: 'running' }
  | { status: 'succeeded'; videoUrl: string; cost_usd_raw: number; meta?: Record<string, unknown> }
  | { status: 'failed'; reason: string }

export interface VideoAdapter {
  id: string
  kind: 'VIDEO'
  start(params: GenerationParams): Promise<VideoStartResult>
  poll(externalJobId: string): Promise<VideoPollResult>
}
