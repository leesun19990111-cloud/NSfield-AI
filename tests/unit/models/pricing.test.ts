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

// 해상도×화면비→픽셀, 토큰 = 면적×길이×fps/1024, 비용 = 토큰/1000×$/1k.
// 720p 16:9 = 1280×720 = 921600px, 1080p = 1920×1080 = 2073600px.
const videoToken: ModelMeta = {
  id: 'seedance-2-i2v', kind: 'VIDEO', display_name: 'Seedance', provider: 'bytedance',
  is_active: true, margin_pct: 10,
  pricing_json: { kind: 'per_video_token', usd_per_1k_tokens: 0.0112, fps: 24,
    options: { allowed_durations_sec: [4, 5, 6, 7, 8, 9, 10], polling_interval_sec: 60 } },
}

describe('per_video_token (해상도×화면비 토큰 과금)', () => {
  it('720p 16:9 8초 → $1.93536 (921600×192/1024/1000×0.0112)', () => {
    expect(estimateRawUsd(videoToken, { prompt: 'x', duration_sec: 8, resolution: '720p', ratio: '16:9' }))
      .toBeCloseTo(1.93536, 5)
  })

  it('1080p 16:9 10초 → $5.4432', () => {
    expect(estimateRawUsd(videoToken, { prompt: 'x', duration_sec: 10, resolution: '1080p', ratio: '16:9' }))
      .toBeCloseTo(5.4432, 4)
  })

  it('720p 1:1 8초 → $1.08864 (정사각이라 16:9보다 저렴)', () => {
    expect(estimateRawUsd(videoToken, { prompt: 'x', duration_sec: 8, resolution: '720p', ratio: '1:1' }))
      .toBeCloseTo(1.08864, 5)
  })

  it('adaptive는 16:9로 간주', () => {
    expect(estimateRawUsd(videoToken, { prompt: 'x', duration_sec: 8, resolution: '720p', ratio: 'adaptive' }))
      .toBeCloseTo(1.93536, 5)
  })

  it('resolution/ratio 미지정이면 720p 16:9 폴백', () => {
    expect(estimateRawUsd(videoToken, { prompt: 'x', duration_sec: 8 })).toBeCloseTo(1.93536, 5)
  })

  it('마진 10% 포함 720p 8초 → $2.1289', () => {
    expect(estimateBilledUsd(videoToken, { prompt: 'x', duration_sec: 8, resolution: '720p', ratio: '16:9' }))
      .toBeCloseTo(2.1289, 4)
  })

  it('미지원 길이는 예외', () => {
    expect(() => estimateRawUsd(videoToken, { prompt: 'x', duration_sec: 15, resolution: '720p' }))
      .toThrowError('UNSUPPORTED_DURATION')
  })
})

// 해상도별 기본 단가 + 토글 추가과금(웹/이미지 검색). nano-banana-2 t2i.
const imageTiered: ModelMeta = {
  id: 'nanobanana-2-t2i', kind: 'IMAGE', display_name: 'Nano Banana 2', provider: 'google',
  is_active: true, margin_pct: 10,
  pricing_json: {
    kind: 'per_image_tiered',
    resolution_usd: { '1k': 0.08, '2k': 0.12, '4k': 0.16 },
    surcharges: { enable_web_search: 0.014, enable_image_search: 0.014 },
  },
}

describe('per_image_tiered (해상도 tier + 토글 추가과금)', () => {
  it('1k 기본 → $0.08', () => {
    expect(estimateRawUsd(imageTiered, { prompt: 'x', resolution: '1k' })).toBeCloseTo(0.08, 6)
  })

  it('2k → $0.12, 4k → $0.16', () => {
    expect(estimateRawUsd(imageTiered, { prompt: 'x', resolution: '2k' })).toBeCloseTo(0.12, 6)
    expect(estimateRawUsd(imageTiered, { prompt: 'x', resolution: '4k' })).toBeCloseTo(0.16, 6)
  })

  it('1k + 웹검색 → $0.094', () => {
    expect(estimateRawUsd(imageTiered, { prompt: 'x', resolution: '1k', enable_web_search: true }))
      .toBeCloseTo(0.094, 6)
  })

  it('2k + 웹검색 + 이미지검색 → $0.148', () => {
    expect(estimateRawUsd(imageTiered, { prompt: 'x', resolution: '2k', enable_web_search: true, enable_image_search: true }))
      .toBeCloseTo(0.148, 6)
  })

  it('resolution 미지정이면 최고가(4k)로 폴백해 과소청구 방지', () => {
    expect(estimateRawUsd(imageTiered, { prompt: 'x' })).toBeCloseTo(0.16, 6)
  })

  it('count 2 (1k) → $0.16', () => {
    expect(estimateRawUsd(imageTiered, { prompt: 'x', resolution: '1k', count: 2 })).toBeCloseTo(0.16, 6)
  })

  it('마진 10% 포함 4k → $0.176', () => {
    expect(estimateBilledUsd(imageTiered, { prompt: 'x', resolution: '4k' })).toBeCloseTo(0.176, 6)
  })
})

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
