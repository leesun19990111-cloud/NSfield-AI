import { describe, it, expect } from 'vitest'
import { estimateRawUsd, estimateBilledUsd } from '@/lib/models/pricing'
import type { ModelMeta } from '@/lib/models/types'

const imageModel: ModelMeta = {
  id: 'gpt-image-2.0', kind: 'IMAGE', display_name: 'GPT', provider: 'openai',
  is_active: true, margin_pct: 10,
  pricing_json: { kind: 'per_image', usd_per_unit: 0.04 },
}

const videoFixed: ModelMeta = {
  id: 'veo3', kind: 'VIDEO', display_name: 'Veo3', provider: 'google',
  is_active: true, margin_pct: 10,
  pricing_json: { kind: 'per_video_fixed', tiers: { '5': 0.45, '10': 0.82 },
    options: { allowed_durations_sec: [5, 10], polling_interval_sec: 60 } },
}

describe('pricing', () => {
  it('이미지 장당 원가', () => {
    expect(estimateRawUsd(imageModel, { prompt: 'x', count: 2 })).toBeCloseTo(0.08)
  })

  it('이미지 마진 10% 포함', () => {
    expect(estimateBilledUsd(imageModel, { prompt: 'x' })).toBeCloseTo(0.044)
  })

  it('영상 고정가 tier', () => {
    expect(estimateRawUsd(videoFixed, { prompt: 'x', duration_sec: 5 })).toBe(0.45)
  })

  it('영상 미지원 길이는 예외', () => {
    expect(() => estimateRawUsd(videoFixed, { prompt: 'x', duration_sec: 15 }))
      .toThrowError('UNSUPPORTED_DURATION')
  })
})
