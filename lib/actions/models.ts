'use server'

import { prisma } from '@/lib/db/prisma'
import { getCurrentFxRate } from '@/lib/fx/service'
import { lowestBilledUsd } from '@/lib/models/catalog-pricing'

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

// 패밀리 목록 (활성 모델이 1개 이상인 family 우선, 그 외도 노출하되 '준비 중')
export async function listFamilies() {
  const models = await prisma.model.findMany({
    orderBy: [{ family: 'asc' }, { id: 'asc' }],
  })
  const fxRate = await getCurrentFxRate()
  const byFamily = new Map<
    string,
    { family: string; total: number; active: number; minUsd: number | null }
  >()
  for (const m of models) {
    const e = byFamily.get(m.family) ?? { family: m.family, total: 0, active: 0, minUsd: null }
    e.total++
    if (m.is_active) {
      e.active++
      const u = lowestBilledUsd(m)
      if (e.minUsd === null || u < e.minUsd) e.minUsd = u
    }
    byFamily.set(m.family, e)
  }
  return { families: [...byFamily.values()].filter((f) => f.family), fxRate }
}

export async function listModelsByFamily(family: string) {
  const models = await prisma.model.findMany({
    where: { family },
    orderBy: [{ is_active: 'desc' }, { modality: 'asc' }, { id: 'asc' }],
  })
  const fxRate = await getCurrentFxRate()
  return { models, fxRate }
}
