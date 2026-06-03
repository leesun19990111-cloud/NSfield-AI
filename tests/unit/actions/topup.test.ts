import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/guards', () => ({ requireUser: vi.fn() }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    topupRequest: { create: vi.fn(), findMany: vi.fn() },
    // rate limit 통과(true) 기본값
    $queryRaw: vi.fn().mockResolvedValue([{ rate_limit_consume: true }]),
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requireUser } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { createTopupRequest } from '@/lib/actions/topup'

const reqUser = requireUser as unknown as ReturnType<typeof vi.fn>
const create = prisma.topupRequest.create as unknown as ReturnType<typeof vi.fn>

describe('createTopupRequest', () => {
  beforeEach(() => { reqUser.mockReset(); create.mockReset() })

  it('유효 입력이면 PENDING 요청 생성', async () => {
    reqUser.mockResolvedValue({ id: 'u1' })
    create.mockResolvedValue({ id: 'r1' })
    const res = await createTopupRequest({
      amount_krw: 30000, depositor_name: '김철수', transferred_at: '2026-05-30T14:00', note: '',
    })
    expect(res.ok).toBe(true)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ user_id: 'u1', amount_krw: 30000, status: 'PENDING' }),
    }))
  })

  it('잘못된 금액이면 실패 반환', async () => {
    reqUser.mockResolvedValue({ id: 'u1' })
    const res = await createTopupRequest({
      amount_krw: 100, depositor_name: '김철수', transferred_at: '2026-05-30T14:00',
    })
    expect(res.ok).toBe(false)
  })
})
