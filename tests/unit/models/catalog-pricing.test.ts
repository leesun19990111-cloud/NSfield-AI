import { describe, it, expect } from 'vitest'
import { lowestBilledUsd } from '@/lib/models/catalog-pricing'

// /models 카드의 "최저가" 산정.
describe('lowestBilledUsd', () => {
  it('per_image: 1장 단가 × (1+마진)', () => {
    const u = lowestBilledUsd({ kind: 'IMAGE', margin_pct: 10, pricing_json: { kind: 'per_image', usd_per_unit: 0.04 } })
    expect(u).toBeCloseTo(0.044, 4)
  })

  it('per_second: 최소 길이 단가', () => {
    const u = lowestBilledUsd({
      kind: 'VIDEO', margin_pct: 10,
      pricing_json: { kind: 'per_second', usd_per_unit: 0.2, options: { allowed_durations_sec: [4, 8], polling_interval_sec: 60 } },
    })
    expect(u).toBeCloseTo(0.88, 4) // 0.2×4×1.1
  })

  it('per_image_tiered: 최저 해상도 단가, 부가옵션 제외', () => {
    const u = lowestBilledUsd({
      kind: 'IMAGE', margin_pct: 10,
      pricing_json: {
        kind: 'per_image_tiered',
        resolution_usd: { '1k': 0.08, '2k': 0.12, '4k': 0.16 },
        surcharges: { enable_web_search: 0.014 },
      },
    })
    expect(u).toBeCloseTo(0.088, 4) // 1k 0.08 × 1.1, 토글 미적용
  })

  it('per_video_token: 최소 길이 + 최저 해상도/비율(480p 1:1)', () => {
    const u = lowestBilledUsd({
      kind: 'VIDEO', margin_pct: 10,
      pricing_json: {
        kind: 'per_video_token', usd_per_1k_tokens: 0.0112, fps: 24,
        options: { allowed_durations_sec: [4, 5, 6, 7, 8], polling_interval_sec: 60 },
      },
    })
    // 480p 1:1 4s = 230400×96/1024/1000×0.0112 = 0.24192, ×1.1 = 0.266112
    expect(u).toBeCloseTo(0.2662, 4)
  })
})
