import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({
  prisma: { $queryRaw: vi.fn() },
}))

import { prisma } from '@/lib/db/prisma'
import { checkDualLimit } from '@/lib/rate-limit/token-bucket'

const queryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>

describe('checkDualLimit', () => {
  beforeEach(() => { queryRaw.mockReset() })

  it('분 한도 초과면 false, 시간 한도는 조회하지 않음', async () => {
    queryRaw.mockResolvedValueOnce([{ rate_limit_consume: false }])
    const ok = await checkDualLimit('u1', 'image_gen', 10, 100)
    expect(ok).toBe(false)
    expect(queryRaw).toHaveBeenCalledTimes(1)
  })

  it('분/시간 둘 다 통과하면 true', async () => {
    queryRaw
      .mockResolvedValueOnce([{ rate_limit_consume: true }])
      .mockResolvedValueOnce([{ rate_limit_consume: true }])
    const ok = await checkDualLimit('u1', 'image_gen', 10, 100)
    expect(ok).toBe(true)
    expect(queryRaw).toHaveBeenCalledTimes(2)
  })

  it('분은 통과했지만 시간 한도 초과면 false', async () => {
    queryRaw
      .mockResolvedValueOnce([{ rate_limit_consume: true }])
      .mockResolvedValueOnce([{ rate_limit_consume: false }])
    const ok = await checkDualLimit('u1', 'image_gen', 10, 100)
    expect(ok).toBe(false)
    expect(queryRaw).toHaveBeenCalledTimes(2)
  })
})
