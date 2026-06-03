'use server'

import { requireAdmin } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { recordAdminAction } from '@/lib/audit/record'
import { revalidatePath } from 'next/cache'

export type ActionResult = { ok: true } | { ok: false; message: string }

export async function listPendingTopups() {
  await requireAdmin()
  return prisma.topupRequest.findMany({
    where: { status: 'PENDING' },
    orderBy: { created_at: 'asc' },
    include: { user: { select: { email: true, display_name: true, topup_code: true } } },
  })
}

export async function approveTopup(requestId: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  const req = await prisma.topupRequest.findUnique({ where: { id: requestId } })
  if (!req || req.status !== 'PENDING') {
    return { ok: false, message: '이미 처리되었거나 존재하지 않는 요청입니다.' }
  }
  try {
    await prisma.$executeRaw`SELECT apply_topup(${requestId}::text, ${admin.id}::text)`
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('TOPUP_NOT_PENDING')) {
      return { ok: false, message: '이미 처리된 요청입니다.' }
    }
    console.error('[approveTopup] failed:', e)
    return { ok: false, message: '승인 처리에 실패했습니다.' }
  }
  await recordAdminAction({
    adminId: admin.id, action: 'approve_topup', targetType: 'topup_request',
    targetId: requestId,
    before: { status: req.status, reviewed_by: req.reviewed_by },
    after: { status: 'APPROVED', amount_krw: req.amount_krw },
  })
  revalidatePath('/admin/topups')
  return { ok: true }
}

export async function rejectTopup(requestId: string, reason: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  const req = await prisma.topupRequest.findUnique({ where: { id: requestId } })
  if (!req || req.status !== 'PENDING') {
    return { ok: false, message: '이미 처리되었거나 존재하지 않는 요청입니다.' }
  }
  await prisma.topupRequest.update({
    where: { id: requestId },
    data: { status: 'REJECTED', reject_reason: reason, reviewed_by: admin.id, reviewed_at: new Date() },
  })
  await recordAdminAction({
    adminId: admin.id, action: 'reject_topup', targetType: 'topup_request',
    targetId: requestId,
    before: { status: req.status },
    after: { status: 'REJECTED' },
    reason,
  })
  revalidatePath('/admin/topups')
  return { ok: true }
}
