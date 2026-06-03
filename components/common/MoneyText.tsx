type Props = {
  krw?: number
  usd?: number
  primary?: 'krw' | 'usd'
  className?: string
}

export function formatKrw(n: number): string {
  return '₩' + Math.round(n).toLocaleString('ko-KR')
}

export function formatUsd(n: number): string {
  return '$' + n.toFixed(2)
}

// 소액까지 정확히 표기: 1달러 미만은 유효 4자리까지, 이상은 2자리.
export function formatUsdPrecise(n: number): string {
  if (n === 0) return '$0'
  const abs = Math.abs(n)
  if (abs >= 1) return '$' + n.toFixed(2)
  // 1 미만: 4 significant decimals, trailing zeros 제거
  const s = n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
  return '$' + s
}

export function MoneyText({ krw, usd, primary = 'krw', className }: Props) {
  const showKrwFirst = primary === 'krw'
  const krwStr = krw !== undefined ? formatKrw(krw) : null
  const usdStr = usd !== undefined ? formatUsd(usd) : null
  const primaryStr = showKrwFirst ? krwStr : usdStr
  const secondaryStr = showKrwFirst ? usdStr : krwStr

  return (
    <span className={className}>
      <span className="font-mono">{primaryStr}</span>
      {secondaryStr && (
        <span className="text-[var(--text-dim)] text-sm ml-1">≈ {secondaryStr}</span>
      )}
    </span>
  )
}
