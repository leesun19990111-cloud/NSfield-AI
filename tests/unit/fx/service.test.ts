import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({
  prisma: { fxRate: { findFirst: vi.fn(), create: vi.fn() } },
}))
vi.mock('@/lib/fx/provider', () => ({ fetchUsdKrw: vi.fn() }))

import { prisma } from '@/lib/db/prisma'
import { fetchUsdKrw } from '@/lib/fx/provider'
import { getCurrentFxRate } from '@/lib/fx/service'

const findFirst = prisma.fxRate.findFirst as unknown as ReturnType<typeof vi.fn>
const create = prisma.fxRate.create as unknown as ReturnType<typeof vi.fn>
const fetchMock = fetchUsdKrw as unknown as ReturnType<typeof vi.fn>

describe('getCurrentFxRate', () => {
  beforeEach(() => {
    findFirst.mockReset(); create.mockReset(); fetchMock.mockReset()
  })

  it('1시간 이내 캐시가 있으면 그것을 반환', async () => {
    findFirst.mockResolvedValue({ rate: 1380, fetched_at: new Date() })
    const r = await getCurrentFxRate()
    expect(r).toBe(1380)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('캐시 없으면 외부 호출 후 저장', async () => {
    findFirst.mockResolvedValue(null)
    fetchMock.mockResolvedValue(1400)
    create.mockResolvedValue({})
    const r = await getCurrentFxRate()
    expect(r).toBe(1400)
    expect(create).toHaveBeenCalled()
  })

  it('캐시가 1시간보다 오래되면 외부 호출', async () => {
    findFirst.mockResolvedValue({ rate: 1300, fetched_at: new Date(Date.now() - 2 * 60 * 60 * 1000) })
    fetchMock.mockResolvedValue(1420)
    create.mockResolvedValue({})
    const r = await getCurrentFxRate()
    expect(r).toBe(1420)
  })
})
