'use server'

import { requireUser } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { topupRequestSchema, type TopupRequestInput } from '@/lib/validation/topup'
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit/token-bucket'
import { revalidatePath } from 'next/cache'

export type ActionResult = { ok: true } | { ok: false; message: string }

export async function createTopupRequest(input: TopupRequestInput): Promise<ActionResult> {
  const user = await requireUser()
  if (user.role !== 'ADMIN') {
    const ok = await consumeRateLimit(user.id, 'topup:hour', RATE_LIMITS.topup.perHour, 3600)
    if (!ok) return { ok: false, message: '충전 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
  }
  const parsed = topupRequestSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: '입력값을 확인해주세요. (금액 1,000~1,000,000원)' }
  }
  const d = parsed.data
  await prisma.topupRequest.create({
    data: {
      user_id: user.id,
      amount_krw: d.amount_krw,
      depositor_name: d.depositor_name,
      transferred_at: new Date(d.transferred_at),
      note: d.note || null,
      status: 'PENDING',
    },
  })
  revalidatePath('/wallet/topup')
  return { ok: true }
}

export async function listMyTopups() {
  const user = await requireUser()
  return prisma.topupRequest.findMany({
    where: { user_id: user.id },
    orderBy: { created_at: 'desc' },
    take: 20,
  })
}
