import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MoneyText, formatUsd, formatUsdPrecise } from '@/components/common/MoneyText'

describe('MoneyText', () => {
  it('KRW 주표기 + 천단위 콤마', () => {
    render(<MoneyText krw={30000} />)
    expect(screen.getByText('₩30,000')).toBeInTheDocument()
  })

  it('USD 주표기는 $ + 소수 2자리', () => {
    render(<MoneyText usd={0.5} primary="usd" />)
    expect(screen.getByText('$0.50')).toBeInTheDocument()
  })
})

describe('formatUsd', () => {
  it('항상 소수 2자리로 표기', () => {
    expect(formatUsd(0.5)).toBe('$0.50')
  })
})

describe('formatUsdPrecise', () => {
  it('소액은 유효 자리까지 정밀 표기', () => {
    expect(formatUsdPrecise(0.013)).toBe('$0.013')
    expect(formatUsdPrecise(0.0143)).toBe('$0.0143')
    expect(formatUsdPrecise(0.5)).toBe('$0.5')
  })

  it('1달러 이상은 소수 2자리', () => {
    expect(formatUsdPrecise(1.056)).toBe('$1.06')
  })

  it('0은 $0', () => {
    expect(formatUsdPrecise(0)).toBe('$0')
  })
})
