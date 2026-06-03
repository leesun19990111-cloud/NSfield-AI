import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/guards', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    walletTransaction: { findMany: vi.fn() },
    topupRequest: { count: vi.fn(), findMany: vi.fn() },
    generation: { count: vi.fn() },
  },
}))

import { requireAdmin } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { getDashboardStats } from '@/lib/actions/admin-dashboard'

const reqAdmin = requireAdmin as unknown as ReturnType<typeof vi.fn>
const wtFindMany = prisma.walletTransaction.findMany as unknown as ReturnType<typeof vi.fn>
const trCount = prisma.topupRequest.count as unknown as ReturnType<typeof vi.fn>
const trFindMany = prisma.topupRequest.findMany as unknown as ReturnType<typeof vi.fn>
const genCount = prisma.generation.count as unknown as ReturnType<typeof vi.fn>

describe('admin-dashboard', () => {
  beforeEach(() => {
    reqAdmin.mockReset(); wtFindMany.mockReset(); trCount.mockReset(); trFindMany.mockReset(); genCount.mockReset()
    reqAdmin.mockResolvedValue({ id: 'admin1', role: 'ADMIN' })
    trCount.mockResolvedValue(0)
    genCount.mockResolvedValue(0)
    trFindMany.mockResolvedValue([])
  })

  it('매출은 CHARGE 차감액(음수)의 절대값 합으로 계산', async () => {
    const today = new Date()
    // week 조회(첫 호출): 오늘자 CHARGE 두 건 -690, -55
    wtFindMany
      .mockResolvedValueOnce([
        { amount_krw: -690, created_at: today },
        { amount_krw: -55, created_at: today },
      ])
      // month 조회(두번째 호출)
      .mockResolvedValueOnce([
        { amount_krw: -690 },
        { amount_krw: -55 },
        { amount_krw: -1000 },
      ])

    const stats = await getDashboardStats()
    expect(reqAdmin).toHaveBeenCalled()
    expect(stats.todayRevenueKrw).toBe(745)
    expect(stats.monthRevenueKrw).toBe(1745)
  })

  it('topupsMissingCode: depositor_name에 사용자 topup_code가 없는 PENDING만 카운트', async () => {
    wtFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    trFindMany.mockResolvedValue([
      { depositor_name: '홍길동 ABC123', user: { topup_code: 'ABC123' } }, // 포함됨
      { depositor_name: '김철수', user: { topup_code: 'XYZ789' } },        // 누락
      { depositor_name: '이영희 999', user: { topup_code: 'ZZZ000' } },    // 누락
    ])

    const stats = await getDashboardStats()
    expect(stats.topupsMissingCode).toBe(2)
  })
})
