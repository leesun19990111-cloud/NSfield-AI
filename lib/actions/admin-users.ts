'use server'

import { requireAdmin } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { recordAdminAction } from '@/lib/audit/record'
import { revalidatePath } from 'next/cache'

export type AdminActionResult = { ok: true } | { ok: false; message: string }

export async function listUsers(query?: string) {
  await requireAdmin()
  const where = query && query.trim()
    ? {
        OR: [
          { email: { contains: query, mode: 'insensitive' as const } },
          { display_name: { contains: query, mode: 'insensitive' as const } },
          { topup_code: { contains: query.toUpperCase() } },
        ],
      }
    : {}
  return prisma.user.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: 100,
    include: {
      wallet: { select: { balance_krw: true } },
      _count: { select: { generations: true } },
    },
  })
}

export async function getUserDetail(id: string) {
  await requireAdmin()
  const user = await prisma.user.findUnique({
    where: { id },
    include: { wallet: true },
  })
  if (!user) return null
  const [transactions, generations, topups] = await Promise.all([
    user.wallet
      ? prisma.walletTransaction.findMany({
          where: { wallet_id: user.wallet.id },
          orderBy: { created_at: 'desc' },
          take: 50,
        })
      : Promise.resolve([]),
    prisma.generation.findMany({
      where: { user_id: id },
      orderBy: { created_at: 'desc' },
      take: 50,
    }),
    prisma.topupRequest.findMany({
      where: { user_id: id },
      orderBy: { created_at: 'desc' },
      take: 50,
    }),
  ])
  return { user, transactions, generations, topups }
}

export async function adjustBalance(
  userId: string,
  amountKrw: number,
  reason: string,
): Promise<AdminActionResult> {
  const admin = await requireAdmin()
  if (!Number.isInteger(amountKrw) || amountKrw === 0) {
    return { ok: false, message: '0이 아닌 정수 금액을 입력하세요.' }
  }
  if (!reason.trim()) {
    return { ok: false, message: '사유를 입력하세요.' }
  }
  const wallet = await prisma.wallet.findUnique({ where: { user_id: userId } })
  if (!wallet) {
    return { ok: false, message: '지갑을 찾을 수 없습니다.' }
  }
  try {
    await prisma.$executeRaw`SELECT wallet_apply_tx(${wallet.id}::text, 'ADJUSTMENT', ${amountKrw}::int, 'admin_adjust', ${null}::text, ${reason})`
  } catch (e) {
    console.error('[adjustBalance] failed:', e)
    return { ok: false, message: '잔액 조정에 실패했습니다.' }
  }
  await recordAdminAction({
    adminId: admin.id,
    action: 'adjust_balance',
    targetType: 'user',
    targetId: userId,
    before: { balance_krw: wallet.balance_krw },
    after: { delta_krw: amountKrw },
    reason,
  })
  revalidatePath(`/admin/users/${userId}`)
  return { ok: true }
}
