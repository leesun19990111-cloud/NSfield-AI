import Link from 'next/link'
import { MoneyText } from '@/components/common/MoneyText'

export function BalanceCard({ balanceKrw, fxRate, topupCode }: {
  balanceKrw: number; fxRate: number; topupCode: string
}) {
  const usd = balanceKrw / fxRate
  return (
    <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] p-6 flex items-start justify-between">
      <div>
        <div className="text-sm text-[var(--text-muted)]">현재 잔액</div>
        <div className="text-3xl font-bold font-mono mt-1">
          <MoneyText krw={balanceKrw} usd={usd} primary="krw" />
        </div>
        <div className="text-xs text-[var(--text-dim)] mt-2">
          1USD = {fxRate.toLocaleString('ko-KR')}₩ · 식별 코드 <span className="font-mono">{topupCode}</span>
        </div>
      </div>
      <Link href="/wallet/topup"
        className="px-4 py-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm">
        충전하기
      </Link>
    </div>
  )
}
