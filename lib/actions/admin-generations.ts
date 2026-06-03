'use server'

import { requireAdmin } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { recordAdminAction } from '@/lib/audit/record'
import { revalidatePath } from 'next/cache'

export type AdminActionResult = { ok: true } | { ok: false; message: string }

type Filters = {
  status?: string
  kind?: string
  modelId?: string
  userQuery?: string
  cursor?: string
}

export async function listAllGenerations(f: Filters = {}) {
  await requireAdmin()
  const where: Record<string, unknown> = {}
  if (f.status) where.status = f.status
  if (f.kind) where.kind = f.kind
  if (f.modelId) where.model_id = f.modelId
  // userQuery: 이메일/이름으로 user 찾아 user_id in
  if (f.userQuery && f.userQuery.trim()) {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: f.userQuery, mode: 'insensitive' } },
          { display_name: { contains: f.userQuery, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: 50,
    })
    where.user_id = { in: users.map((u) => u.id) }
  }
  const take = 50
  const items = await prisma.generation.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: take + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    include: { user: { select: { email: true, display_name: true } } },
  })
  const hasMore = items.length > take
  return {
    items: hasMore ? items.slice(0, take) : items,
    nextCursor: hasMore ? items[take - 1]!.id : null,
  }
}

export async function getGenerationAdmin(id: string) {
  await requireAdmin()
  return prisma.generation.findUnique({
    where: { id },
    include: { user: { select: { email: true, display_name: true } } },
  })
}

export async function isGenerationRefunded(genId: string): Promise<boolean> {
  await requireAdmin()
  const existing = await prisma.walletTransaction.findFirst({
    where: { type: 'REFUND', ref_type: 'generation', ref_id: genId },
  })
  return existing !== null
}

export async function forceRefund(genId: string, reason: string): Promise<AdminActionResult> {
  const admin = await requireAdmin()
  if (!reason.trim()) return { ok: false, message: '환불 사유를 입력하세요.' }
  const gen = await prisma.generation.findUnique({ where: { id: genId } })
  if (!gen) return { ok: false, message: '생성 내역을 찾을 수 없습니다.' }
  if (!gen.charged_krw || gen.charged_krw <= 0) return { ok: false, message: '차감 금액이 없습니다.' }
  // 중복 환불 방지: 이미 이 generation에 REFUND 거래가 있는지
  const existingRefund = await prisma.walletTransaction.findFirst({
    where: { type: 'REFUND', ref_type: 'generation', ref_id: genId },
  })
  if (existingRefund) return { ok: false, message: '이미 환불된 생성입니다.' }
  const wallet = await prisma.wallet.findUnique({ where: { user_id: gen.user_id } })
  if (!wallet) return { ok: false, message: '지갑을 찾을 수 없습니다.' }
  try {
    await prisma.$executeRaw`SELECT wallet_apply_tx(${wallet.id}::text, 'REFUND', ${gen.charged_krw}::int, 'generation', ${genId}::text, ${reason})`
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // 부분 유니크 인덱스 위반 = 동시/중복 환불
    if (msg.includes('uniq_refund_per_generation') || msg.includes('duplicate key') || msg.includes('23505')) {
      return { ok: false, message: '이미 환불된 생성입니다.' }
    }
    console.error('[forceRefund] failed:', e)
    return { ok: false, message: '환불 처리에 실패했습니다.' }
  }
  const updated = await prisma.wallet.findUnique({ where: { id: wallet.id } })
  await recordAdminAction({
    adminId: admin.id,
    action: 'force_refund',
    targetType: 'generation',
    targetId: genId,
    before: { charged_krw: gen.charged_krw, status: gen.status },
    after: { balance_krw: updated?.balance_krw },
    reason,
  })
  revalidatePath('/admin/generations')
  revalidatePath(`/admin/generations/${genId}`)
  return { ok: true }
}
