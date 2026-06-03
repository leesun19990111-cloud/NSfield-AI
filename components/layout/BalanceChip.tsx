import Link from 'next/link'
import { prisma } from '@/lib/db/prisma'
import { formatKrw } from '@/components/common/MoneyText'

export async function BalanceChip({ userId }: { userId: string }) {
  const wallet = await prisma.wallet.findUnique({ where: { user_id: userId } })
  const balance = wallet?.balance_krw ?? 0
  return (
    <Link
      href="/wallet"
      className="px-3 py-1.5 rounded-full bg-[var(--bg-surface-2)] border border-[var(--border)] text-sm font-mono hover:bg-[var(--bg-surface)]"
    >
      {formatKrw(balance)}
    </Link>
  )
}
