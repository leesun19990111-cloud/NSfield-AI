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
  it('nanobanana-2-t2i 해상도 tier 1k 0.08 → 0.088', () => {
    expect(estimateBilledUsd(meta('nanobanana-2-t2i'), { prompt: 'x', resolution: '1k' })).toBeCloseTo(0.088, 4)
  })

  it('nanobanana-2-t2i 2k 0.12 → 0.132, 4k 0.16 → 0.176', () => {
    expect(estimateBilledUsd(meta('nanobanana-2-t2i'), { prompt: 'x', resolution: '2k' })).toBeCloseTo(0.132, 4)
    expect(estimateBilledUsd(meta('nanobanana-2-t2i'), { prompt: 'x', resolution: '4k' })).toBeCloseTo(0.176, 4)
  })

  it('nanobanana-2-t2i 1k + 웹검색 0.094 → 0.1034', () => {
    expect(estimateBilledUsd(meta('nanobanana-2-t2i'), { prompt: 'x', resolution: '1k', enable_web_search: true }))
      .toBeCloseTo(0.1034, 4)
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

  it('seedance-2-i2v 토큰과금 720p 16:9 8s → 2.1289', () => {
    expect(estimateBilledUsd(meta('seedance-2-i2v'), { prompt: 'x', duration_sec: 8, resolution: '720p', ratio: '16:9' }))
      .toBeCloseTo(2.1289, 4)
  })

  it('seedance-2-i2v 토큰과금 1080p 16:9 10s → 5.9876', () => {
    expect(estimateBilledUsd(meta('seedance-2-i2v'), { prompt: 'x', duration_sec: 10, resolution: '1080p', ratio: '16:9' }))
      .toBeCloseTo(5.9876, 4)
  })

  it('seedance-2-t2v 토큰과금 720p 16:9 5s → 1.3306', () => {
    expect(estimateBilledUsd(meta('seedance-2-t2v'), { prompt: 'x', duration_sec: 5, resolution: '720p', ratio: '16:9' }))
      .toBeCloseTo(1.3306, 4)
  })

  it('seedance-2-ref2v 토큰과금 480p 1:1 4s → 0.2662', () => {
    expect(estimateBilledUsd(meta('seedance-2-ref2v'), { prompt: 'x', duration_sec: 4, resolution: '480p', ratio: '1:1' }))
      .toBeCloseTo(0.2662, 4)
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
