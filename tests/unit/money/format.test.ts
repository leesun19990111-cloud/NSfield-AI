import { describe, it, expect } from 'vitest'
import { usdToKrw, roundCeilUsd } from '@/lib/money/format'

describe('money/format', () => {
  it('usdToKrw: 반올림 정수', () => {
    expect(usdToKrw(0.5, 1380)).toBe(690)
    expect(usdToKrw(0.04, 1380)).toBe(55) // 55.2 → 55
  })

  it('roundCeilUsd: 4자리 올림 (운영자 손해 방지)', () => {
    expect(roundCeilUsd(0.040000001, 4)).toBe(0.0401)
    expect(roundCeilUsd(0.044, 4)).toBe(0.044)
  })
})
