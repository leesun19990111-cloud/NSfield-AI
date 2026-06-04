import type { ModelMeta, GenerationParams } from './types'
import { roundCeilUsd } from '@/lib/money/format'

export class UnsupportedDurationError extends Error {
  constructor() {
    super('UNSUPPORTED_DURATION')
  }
}

// 해상도(짧은 변 px)와 화면비(긴변/짧은변 배수)로 출력 영상의 픽셀 수(H×W) 산출.
// 16:9 720p=1280×720, 1080p=1920×1080. 정사각/4:3은 픽셀이 적어 더 저렴.
// 미지정/미지원 값은 720p·16:9(최대 픽셀)로 폴백해 과소청구를 방지.
const VIDEO_SHORT_SIDE_PX: Record<string, number> = { '480p': 480, '720p': 720, '1080p': 1080 }
const VIDEO_RATIO_LONG_FACTOR: Record<string, number> = {
  '16:9': 16 / 9, '9:16': 16 / 9, '4:3': 4 / 3, '3:4': 4 / 3, '1:1': 1, adaptive: 16 / 9,
}

export function videoPixelArea(resolution?: string, ratio?: string): number {
  const short = VIDEO_SHORT_SIDE_PX[resolution ?? ''] ?? 720 // 폴백: 720p
  const factor = VIDEO_RATIO_LONG_FACTOR[ratio ?? ''] ?? 16 / 9 // 폴백: 16:9(최대 픽셀)
  const long = Math.round(short * factor)
  return short * long
}

// per_second 모델의 유효 초당 단가. 오디오 단가(usd_per_unit_audio)가 선언되어 있고
// generate_audio=true면 오디오 단가, 아니면 기본 단가. 가격 계산·breakdown 표시가 같은 값을 쓰도록 공유.
export function perSecondUnitUsd(
  p: { usd_per_unit: number; usd_per_unit_audio?: number },
  params: { generate_audio?: boolean },
): number {
  if (params.generate_audio === true && p.usd_per_unit_audio !== undefined) {
    return p.usd_per_unit_audio
  }
  return p.usd_per_unit
}

export function estimateRawUsd(model: ModelMeta, params: GenerationParams): number {
  const p = model.pricing_json

  if (p.kind === 'per_second' || p.kind === 'per_video_fixed' || p.kind === 'per_video_token') {
    const d = params.duration_sec
    if (d === undefined || !p.options.allowed_durations_sec.includes(d)) {
      throw new UnsupportedDurationError()
    }
  }

  switch (p.kind) {
    case 'per_image':
      return p.usd_per_unit * (params.count ?? 1)
    case 'per_image_tiered': {
      // 해상도별 기본 단가. 미지정/미지원이면 최고가로 폴백(과소청구 방지).
      const res = typeof params.resolution === 'string' ? params.resolution : ''
      const base = p.resolution_usd[res] ?? Math.max(...Object.values(p.resolution_usd))
      let perImage = base
      for (const [param, fee] of Object.entries(p.surcharges ?? {})) {
        if (params[param] === true) perImage += fee
      }
      return perImage * (params.count ?? 1)
    }
    case 'per_token':
      return p.usd_per_unit * (typeof params.tokens === 'number' ? params.tokens : 1)
    case 'per_second':
      return perSecondUnitUsd(p, params) * (params.duration_sec ?? 0)
    case 'per_video_token': {
      const area = videoPixelArea(params.resolution, params.ratio)
      const frames = (params.duration_sec ?? 0) * p.fps
      const tokens = (area * frames) / 1024
      return (tokens / 1000) * p.usd_per_1k_tokens
    }
    case 'per_video_fixed': {
      const tier = p.tiers[String(params.duration_sec)]
      if (tier === undefined) throw new UnsupportedDurationError()
      return tier
    }
  }
}

export function estimateBilledUsd(model: ModelMeta, params: GenerationParams): number {
  const raw = estimateRawUsd(model, params)
  return roundCeilUsd(raw * (1 + model.margin_pct / 100), 4)
}
