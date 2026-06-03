'use server'

import { requireAdmin } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { recordAdminAction } from '@/lib/audit/record'
import { refreshFxRate } from '@/lib/fx/service'
import { revalidatePath } from 'next/cache'

export type AdminActionResult = { ok: true; rate?: number } | { ok: false; message: string }

export async function listFxRates(limit = 50) {
  await requireAdmin()
  return prisma.fxRate.findMany({
    where: { pair: 'USDKRW' },
    orderBy: { fetched_at: 'desc' },
    take: limit,
  })
}

export async function triggerFxRefresh(): Promise<AdminActionResult> {
  const admin = await requireAdmin()
  try {
    const rate = await refreshFxRate()
    await recordAdminAction({
      adminId: admin.id,
      action: 'fx_refresh',
      targetType: 'fx_rate',
      after: { rate },
    })
    revalidatePath('/admin/fx-rates')
    return { ok: true, rate }
  } catch (e) {
    console.error('[triggerFxRefresh] failed:', e)
    return { ok: false, message: '환율 갱신에 실패했습니다. (외부 API 확인)' }
  }
}
