import { describe, it, expect } from 'vitest'
import { topupRequestSchema } from '@/lib/validation/topup'

describe('topupRequestSchema', () => {
  it('정상 입력 통과', () => {
    const r = topupRequestSchema.safeParse({
      amount_krw: 30000, depositor_name: '김철수9A2K',
      transferred_at: '2026-05-30T14:00', note: '',
    })
    expect(r.success).toBe(true)
  })
  it('1000 미만 금액 거부', () => {
    const r = topupRequestSchema.safeParse({
      amount_krw: 500, depositor_name: '김철수', transferred_at: '2026-05-30T14:00',
    })
    expect(r.success).toBe(false)
  })
  it('100만 초과 금액 거부', () => {
    const r = topupRequestSchema.safeParse({
      amount_krw: 2000000, depositor_name: '김철수', transferred_at: '2026-05-30T14:00',
    })
    expect(r.success).toBe(false)
  })
})
