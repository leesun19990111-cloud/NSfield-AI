import type { ModelMeta, GenerationParams } from './types'
import { roundCeilUsd } from '@/lib/money/format'

export class UnsupportedDurationError extends Error {
  constructor() {
    super('UNSUPPORTED_DURATION')
  }
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

  if (p.kind === 'per_second' || p.kind === 'per_video_fixed') {
    const d = params.duration_sec
    if (d === undefined || !p.options.allowed_durations_sec.includes(d)) {
      throw new UnsupportedDurationError()
    }
  }

  switch (p.kind) {
    case 'per_image':
      return p.usd_per_unit * (params.count ?? 1)
    case 'per_token':
      return p.usd_per_unit * (typeof params.tokens === 'number' ? params.tokens : 1)
    case 'per_second':
      return perSecondUnitUsd(p, params) * (params.duration_sec ?? 0)
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
