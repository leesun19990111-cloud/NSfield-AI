import type { ModelMeta, GenerationParams } from './types'
import { roundCeilUsd } from '@/lib/money/format'

export class UnsupportedDurationError extends Error {
  constructor() {
    super('UNSUPPORTED_DURATION')
  }
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
      return p.usd_per_unit * (params.duration_sec ?? 0)
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
