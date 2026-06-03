import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MoneyText } from '@/components/common/MoneyText'

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
