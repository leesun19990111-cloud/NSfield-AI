'use server'

import { prisma } from '@/lib/db/prisma'
import { getCurrentFxRate } from '@/lib/fx/service'

export async function listActiveModels() {
  const models = await prisma.model.findMany({
    where: { is_active: true },
    orderBy: { id: 'asc' },
  })
  const fxRate = await getCurrentFxRate()
  return { models, fxRate }
}

export async function getModelDetail(id: string) {
  const model = await prisma.model.findUnique({ where: { id } })
  if (!model) return null
  const fxRate = await getCurrentFxRate()
  return { model, fxRate }
}
