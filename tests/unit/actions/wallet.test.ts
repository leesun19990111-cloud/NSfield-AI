import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/guards', () => ({ requireUser: vi.fn() }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    wallet: { findUnique: vi.fn() },
    walletTransaction: { findMany: vi.fn() },
  },
}))

import { requireUser } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { getMyWallet } from '@/lib/actions/wallet'

const reqUser = requireUser as unknown as ReturnType<typeof vi.fn>
const findUnique = prisma.wallet.findUnique as unknown as ReturnType<typeof vi.fn>

describe('getMyWallet', () => {
  beforeEach(() => { reqUser.mockReset(); findUnique.mockReset() })

  it('내 지갑 잔액을 반환', async () => {
    reqUser.mockResolvedValue({ id: 'u1' })
    findUnique.mockResolvedValue({ id: 'w1', user_id: 'u1', balance_krw: 30000 })
    const w = await getMyWallet()
    expect(w.balance_krw).toBe(30000)
    expect(findUnique).toHaveBeenCalledWith({ where: { user_id: 'u1' } })
  })
})
