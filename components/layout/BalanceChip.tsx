import Link from 'next/link'
import { getMyWallet } from '@/lib/actions/wallet'
import { formatKrw } from '@/components/common/MoneyText'

export async function BalanceChip() {
  const wallet = await getMyWallet()
  return (
    <Link href="/wallet" className="px-3 py-1.5 rounded-full bg-[var(--bg-surface-2)] border border-[var(--border)] text-sm font-mono hover:bg-[var(--bg-surface)]">
      {formatKrw(wallet.balance_krw)}
    </Link>
  )
}
