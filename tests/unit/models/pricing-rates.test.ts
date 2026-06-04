import { describe, it, expect } from 'vitest'
import { estimateBilledUsd } from '@/lib/models/pricing'
import { getModelConfig } from '@/lib/models/catalog/registry'
import type { ModelConfig } from '@/lib/models/catalog/types'
import type { ModelMeta, PricingJson } from '@/lib/models/types'

// config → ModelMeta (lib/actions/generation.ts의 toModelMeta가 export 안 되어 인라인 구성)
function toMeta(c: ModelConfig): ModelMeta {
  return {
    id: c.id,
    kind: c.output,
    display_name: c.displayName,
    provider: c.provider,
    is_active: c.isActive,
    margin_pct: c.marginPct ?? 10,
    pricing_json: c.pricing as unknown as PricingJson,
  }
}

function meta(id: string): ModelMeta {
  const c = getModelConfig(id)
  if (!c) throw new Error(`missing config: ${id}`)
  return toMeta(c)
}

// 기준 단가(AtlasCloud 실제 요금) × 1.1(엔진 margin_pct=10). roundCeilUsd(4) 때문에 toBeCloseTo로 검증.
describe('AtlasCloud 기준 단가 × 1.1 (엔진 마진)', () => {
  it('nanobanana-2-t2i per_image 0.048 → 0.0528 (owner 확정 단가)', () => {
    expect(estimateBilledUsd(meta('nanobanana-2-t2i'), { prompt: 'x' })).toBeCloseTo(0.0528, 4)
  })

  it('nanobanana-pro-t2i per_image 0.06 → 0.066', () => {
    expect(estimateBilledUsd(meta('nanobanana-pro-t2i'), { prompt: 'x' })).toBeCloseTo(0.066, 4)
  })

  it('seedream-v4-t2i per_image 0.032 → 0.0352', () => {
    expect(estimateBilledUsd(meta('seedream-v4-t2i'), { prompt: 'x' })).toBeCloseTo(0.0352, 4)
  })

  it('veo3.1-fast-t2v per_second 0.05 × 8s → 0.44', () => {
    expect(estimateBilledUsd(meta('veo3.1-fast-t2v'), { prompt: 'x', duration_sec: 8 })).toBeCloseTo(0.44, 4)
  })

  it('seedance-2-i2v per_second 0.096 × 10s → 1.056', () => {
    expect(estimateBilledUsd(meta('seedance-2-i2v'), { prompt: 'x', duration_sec: 10 })).toBeCloseTo(1.056, 4)
  })

  it('veo3.1-t2v per_second 0.15 × 8s → 1.32', () => {
    expect(estimateBilledUsd(meta('veo3.1-t2v'), { prompt: 'x', duration_sec: 8 })).toBeCloseTo(1.32, 4)
  })

  it('kling-v3-std-t2v per_second 0.071 × 5s → 0.3905', () => {
    expect(estimateBilledUsd(meta('kling-v3-std-t2v'), { prompt: 'x', duration_sec: 5 })).toBeCloseTo(0.3905, 4)
  })

  it('kling-v3-pro-i2v per_second 0.14 × 5s → 0.77', () => {
    expect(estimateBilledUsd(meta('kling-v3-pro-i2v'), { prompt: 'x', duration_sec: 5 })).toBeCloseTo(0.77, 4)
  })
})
