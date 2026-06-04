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
    // 최저가는 가장 싼 tier 기준. allowed_durations_sec의 최소값이 tier에 없을 수 있으므로
    // (예: 허용 [4..15]·tier {5,10,15}) tier 키만으로 산정한다.
    const min = Math.min(...Object.keys(p.tiers).map(Number))
    return estimateBilledUsd(meta, { prompt: 'x', duration_sec: min })
  }
  if (p.kind === 'per_second') {
    const min = Math.min(...p.options.allowed_durations_sec)
    return estimateBilledUsd(meta, { prompt: 'x', duration_sec: min })
  }
  if (p.kind === 'per_video_token') {
    // 최저가 = 최소 길이 + 최저 픽셀(480p·1:1) 조합
    const min = Math.min(...p.options.allowed_durations_sec)
    return estimateBilledUsd(meta, { prompt: 'x', duration_sec: min, resolution: '480p', ratio: '1:1' })
  }
  return 0
}
