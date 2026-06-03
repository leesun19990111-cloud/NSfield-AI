import { estimateBilledUsd } from '@/lib/models/pricing'
import type { ModelMeta, PricingJson } from '@/lib/models/types'

export function lowestBilledUsd(model: {
  kind: string
  margin_pct: unknown
  pricing_json: unknown
}): number {
  const meta: ModelMeta = {
    id: '',
    kind: model.kind as 'IMAGE' | 'VIDEO',
    display_name: '',
    provider: '',
    is_active: true,
    margin_pct: Number(model.margin_pct),
    pricing_json: model.pricing_json as PricingJson,
  }
  if (meta.kind === 'IMAGE') return estimateBilledUsd(meta, { prompt: 'x', count: 1 })
  const p = meta.pricing_json
  if (p.kind === 'per_video_fixed') {
    const min = Math.min(...p.options.allowed_durations_sec)
    return estimateBilledUsd(meta, { prompt: 'x', duration_sec: min })
  }
  if (p.kind === 'per_second') {
    const min = Math.min(...p.options.allowed_durations_sec)
    return estimateBilledUsd(meta, { prompt: 'x', duration_sec: min })
  }
  return 0
}
