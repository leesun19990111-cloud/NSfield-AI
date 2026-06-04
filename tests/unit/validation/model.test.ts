import { describe, it, expect } from 'vitest'
import { pricingJsonSchema, updateModelSchema } from '@/lib/validation/model'

describe('pricingJsonSchema', () => {
  it('valid per_image passes', () => {
    const r = pricingJsonSchema.safeParse({ kind: 'per_image', usd_per_unit: 0.04 })
    expect(r.success).toBe(true)
  })

  it('valid per_video_fixed with tiers + options passes', () => {
    const r = pricingJsonSchema.safeParse({
      kind: 'per_video_fixed',
      tiers: { '5': 0.5, '10': 0.9 },
      options: { allowed_durations_sec: [5, 10], polling_interval_sec: 3 },
    })
    expect(r.success).toBe(true)
  })

  it('valid per_video_token passes', () => {
    const r = pricingJsonSchema.safeParse({
      kind: 'per_video_token',
      usd_per_1k_tokens: 0.0112,
      fps: 24,
      options: { allowed_durations_sec: [4, 8], polling_interval_sec: 60 },
    })
    expect(r.success).toBe(true)
  })

  it('rejects per_video_token with non-positive fps', () => {
    const r = pricingJsonSchema.safeParse({
      kind: 'per_video_token',
      usd_per_1k_tokens: 0.0112,
      fps: 0,
      options: { allowed_durations_sec: [4], polling_interval_sec: 60 },
    })
    expect(r.success).toBe(false)
  })

  it('rejects missing kind', () => {
    const r = pricingJsonSchema.safeParse({ usd_per_unit: 0.04 })
    expect(r.success).toBe(false)
  })

  it('rejects negative usd_per_unit', () => {
    const r = pricingJsonSchema.safeParse({ kind: 'per_image', usd_per_unit: -1 })
    expect(r.success).toBe(false)
  })

  it('rejects per_second with bad options (non-positive interval)', () => {
    const r = pricingJsonSchema.safeParse({
      kind: 'per_second',
      usd_per_unit: 0.01,
      options: { allowed_durations_sec: [5], polling_interval_sec: 0 },
    })
    expect(r.success).toBe(false)
  })
})

describe('updateModelSchema', () => {
  const validPricing = { kind: 'per_image', usd_per_unit: 0.04 }

  it('rejects empty display_name', () => {
    const r = updateModelSchema.safeParse({
      display_name: '   ',
      is_active: true,
      margin_pct: 10,
      pricing_json: validPricing,
    })
    expect(r.success).toBe(false)
  })

  it('rejects margin_pct > 1000', () => {
    const r = updateModelSchema.safeParse({
      display_name: 'GPT Image',
      is_active: true,
      margin_pct: 1001,
      pricing_json: validPricing,
    })
    expect(r.success).toBe(false)
  })

  it('accepts a complete valid input (margin coerced from string)', () => {
    const r = updateModelSchema.safeParse({
      display_name: 'GPT Image',
      is_active: false,
      margin_pct: '15',
      pricing_json: validPricing,
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.margin_pct).toBe(15)
  })
})
