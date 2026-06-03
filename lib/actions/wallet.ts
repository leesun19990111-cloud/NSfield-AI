'use server'

import { requireUser } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'

export async function getMyWallet() {
  const user = await requireUser()
  const wallet = await prisma.wallet.findUnique({ where: { user_id: user.id } })
  return wallet ?? { id: '', user_id: user.id, balance_krw: 0, updated_at: new Date() }
}

export async function listMyTransactions(limit = 30, cursor?: string) {
  const user = await requireUser()
  const wallet = await prisma.wallet.findUnique({ where: { user_id: user.id } })
  if (!wallet) return { items: [], nextCursor: null as string | null }

  const items = await prisma.walletTransaction.findMany({
    where: { wallet_id: wallet.id },
    orderBy: { created_at: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  const hasMore = items.length > limit
  return {
    items: hasMore ? items.slice(0, limit) : items,
    nextCursor: hasMore ? items[limit - 1]!.id : null,
  }
}
