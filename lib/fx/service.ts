import { prisma } from '@/lib/db/prisma'
import { fetchUsdKrw } from './provider'
import { FX_PAIR, FX_MAX_AGE_MS } from '@/lib/constants'

export async function getCurrentFxRate(): Promise<number> {
  const latest = await prisma.fxRate.findFirst({
    where: { pair: FX_PAIR },
    orderBy: { fetched_at: 'desc' },
  })

  if (latest && Date.now() - new Date(latest.fetched_at).getTime() < FX_MAX_AGE_MS) {
    return Number(latest.rate)
  }

  const rate = await fetchUsdKrw()
  await prisma.fxRate.create({
    data: { pair: FX_PAIR, rate, source: 'exchangerate.host' },
  })
  return rate
}

export async function refreshFxRate(): Promise<number> {
  const rate = await fetchUsdKrw()
  await prisma.fxRate.create({
    data: { pair: FX_PAIR, rate, source: 'exchangerate.host' },
  })
  return rate
}
