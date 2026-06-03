'use server'

import { requireAdmin } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'

export async function listAdminActions(filters: { action?: string; cursor?: string } = {}) {
  await requireAdmin()
  const where = filters.action ? { action: filters.action } : {}
  const take = 50
  const items = await prisma.adminAction.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  })
  const hasMore = items.length > take
  return {
    items: hasMore ? items.slice(0, take) : items,
    nextCursor: hasMore ? items[take - 1]!.id : null,
  }
}
