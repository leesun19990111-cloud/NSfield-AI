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
