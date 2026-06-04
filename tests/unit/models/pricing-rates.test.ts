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
  it('nanobanana-2-t2i per_image 0.08 → 0.088 (owner 확정 단가)', () => {
    expect(estimateBilledUsd(meta('nanobanana-2-t2i'), { prompt: 'x' })).toBeCloseTo(0.088, 4)
  })

  it('nanobanana-pro-t2i per_image 0.14 → 0.154', () => {
    expect(estimateBilledUsd(meta('nanobanana-pro-t2i'), { prompt: 'x' })).toBeCloseTo(0.154, 4)
  })

  it('seedream-v4-t2i per_image 0.03 → 0.033', () => {
    expect(estimateBilledUsd(meta('seedream-v4-t2i'), { prompt: 'x' })).toBeCloseTo(0.033, 4)
  })

  it('veo3.1-fast-t2v per_second 0.08 × 8s → 0.704', () => {
    expect(estimateBilledUsd(meta('veo3.1-fast-t2v'), { prompt: 'x', duration_sec: 8 })).toBeCloseTo(0.704, 4)
  })

  it('seedance-2-i2v per_second 0.112 × 10s → 1.232', () => {
    expect(estimateBilledUsd(meta('seedance-2-i2v'), { prompt: 'x', duration_sec: 10 })).toBeCloseTo(1.232, 4)
  })

  it('veo3.1-t2v per_second 0.2 × 8s → 1.76 (오디오 OFF)', () => {
    expect(estimateBilledUsd(meta('veo3.1-t2v'), { prompt: 'x', duration_sec: 8 })).toBeCloseTo(1.76, 4)
  })

  it('veo3.1-t2v 오디오 ON 0.4 × 8s → 3.52', () => {
    expect(estimateBilledUsd(meta('veo3.1-t2v'), { prompt: 'x', duration_sec: 8, generate_audio: true }))
      .toBeCloseTo(3.52, 4)
  })

  it('veo3.1-i2v 오디오 ON 0.4 × 8s → 3.52', () => {
    expect(estimateBilledUsd(meta('veo3.1-i2v'), { prompt: 'x', duration_sec: 8, generate_audio: true }))
      .toBeCloseTo(3.52, 4)
  })

  it('kling-v3-std-t2v per_second 0.084 × 5s → 0.462', () => {
    expect(estimateBilledUsd(meta('kling-v3-std-t2v'), { prompt: 'x', duration_sec: 5 })).toBeCloseTo(0.462, 4)
  })

  it('kling-v3-pro-i2v per_second 0.112 × 5s → 0.616', () => {
    expect(estimateBilledUsd(meta('kling-v3-pro-i2v'), { prompt: 'x', duration_sec: 5 })).toBeCloseTo(0.616, 4)
  })
})
