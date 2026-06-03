import { describe, it, expect } from 'vitest'
import { computeSettlementKrw } from '@/lib/generation/settle'

describe('computeSettlementKrw', () => {
  it('실제 == 견적: 추가 차감 0', () => {
    expect(computeSettlementKrw(690, 690)).toBe(0)
  })
  it('실제 > 견적: 차액만 추가 차감(양수)', () => {
    expect(computeSettlementKrw(690, 750)).toBe(60)
  })
  it('실제 < 견적: 추가 차감 0 (운영자 흡수, 환불 안 함)', () => {
    expect(computeSettlementKrw(690, 600)).toBe(0)
  })
})
