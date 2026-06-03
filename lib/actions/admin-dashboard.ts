'use server'
import { requireAdmin } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'

export type DashboardStats = {
  todayRevenueKrw: number
  monthRevenueKrw: number
  pendingTopups: number
  runningVideos: number
  stuckVideos: number          // RUNNING video, started_at > 30분 전
  topupsMissingCode: number    // PENDING, depositor_name에 사용자 topup_code 미포함
  daily: { date: string; revenueKrw: number }[]  // 최근 7일
}

export async function getDashboardStats(): Promise<DashboardStats> {
  await requireAdmin()
  const now = new Date()
  const KST = 9 * 60 * 60 * 1000
  const nowKstParts = new Date(now.getTime() + KST)
  const todayStart = new Date(Date.UTC(nowKstParts.getUTCFullYear(), nowKstParts.getUTCMonth(), nowKstParts.getUTCDate()) - KST)
  const monthStart = new Date(Date.UTC(nowKstParts.getUTCFullYear(), nowKstParts.getUTCMonth(), 1) - KST)
  const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000)
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000)

  // 매출 = CHARGE 차감액의 절대값 합
  const charges = await prisma.walletTransaction.findMany({
    where: { type: 'CHARGE', created_at: { gte: weekStart } },
    select: { amount_krw: true, created_at: true },
  })
  const sumAbs = (rows: { amount_krw: number }[]) => rows.reduce((s, r) => s + Math.abs(r.amount_krw), 0)
  const todayRevenueKrw = sumAbs(charges.filter((c) => c.created_at >= todayStart))

  // month: 별도 조회(weekStart보다 이전일 수 있으므로)
  const monthCharges = await prisma.walletTransaction.findMany({
    where: { type: 'CHARGE', created_at: { gte: monthStart } },
    select: { amount_krw: true },
  })
  const monthRevenueKrw = sumAbs(monthCharges)

  const [pendingTopups, runningVideos, stuckVideos] = await Promise.all([
    prisma.topupRequest.count({ where: { status: 'PENDING' } }),
    prisma.generation.count({ where: { status: 'RUNNING', kind: 'VIDEO' } }),
    prisma.generation.count({ where: { status: 'RUNNING', kind: 'VIDEO', started_at: { lt: thirtyMinAgo } } }),
  ])

  // 식별코드 누락 PENDING 충전
  const pendings = await prisma.topupRequest.findMany({
    where: { status: 'PENDING' },
    select: { depositor_name: true, user: { select: { topup_code: true } } },
  })
  const topupsMissingCode = pendings.filter((p) => !p.depositor_name.includes(p.user.topup_code)).length

  // 7일 일별 매출
  const dayMap = new Map<string, number>()
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000)
    dayMap.set(new Date(d.getTime() + KST).toISOString().slice(0, 10), 0)
  }
  for (const c of charges) {
    const key = new Date(c.created_at.getTime() + KST).toISOString().slice(0, 10)
    if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + Math.abs(c.amount_krw))
  }
  const daily = [...dayMap.entries()].map(([date, revenueKrw]) => ({ date, revenueKrw }))

  return { todayRevenueKrw, monthRevenueKrw, pendingTopups, runningVideos, stuckVideos, topupsMissingCode, daily }
}
