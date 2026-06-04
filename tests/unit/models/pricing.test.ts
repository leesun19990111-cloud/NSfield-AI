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

// 오디오 생성 시 초당 단가가 2배가 되는 모델(Veo 3.1 계열). usd_per_unit_audio 선언.
const videoAudio: ModelMeta = {
  id: 'veo3.1-t2v', kind: 'VIDEO', display_name: 'Veo 3.1', provider: 'google',
  is_active: true, margin_pct: 10,
  pricing_json: { kind: 'per_second', usd_per_unit: 0.2, usd_per_unit_audio: 0.4,
    options: { allowed_durations_sec: [4, 6, 8], polling_interval_sec: 60 } },
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

  it('per_second: generate_audio 미지정이면 기본 단가', () => {
    expect(estimateRawUsd(videoAudio, { prompt: 'x', duration_sec: 8 })).toBeCloseTo(1.6, 6)
  })

  it('per_second: generate_audio=false면 기본 단가', () => {
    expect(estimateRawUsd(videoAudio, { prompt: 'x', duration_sec: 8, generate_audio: false }))
      .toBeCloseTo(1.6, 6)
  })

  it('per_second: generate_audio=true면 오디오 단가(2배)', () => {
    expect(estimateRawUsd(videoAudio, { prompt: 'x', duration_sec: 8, generate_audio: true }))
      .toBeCloseTo(3.2, 6)
  })

  it('per_second: usd_per_unit_audio 미선언 모델은 generate_audio=true여도 기본 단가', () => {
    const noAudioRate: ModelMeta = {
      id: 'seedance', kind: 'VIDEO', display_name: 'Seedance', provider: 'bytedance',
      is_active: true, margin_pct: 10,
      pricing_json: { kind: 'per_second', usd_per_unit: 0.112,
        options: { allowed_durations_sec: [4, 8], polling_interval_sec: 60 } },
    }
    expect(estimateRawUsd(noAudioRate, { prompt: 'x', duration_sec: 8, generate_audio: true }))
      .toBeCloseTo(0.896, 6)
  })
})
