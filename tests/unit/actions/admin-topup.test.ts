import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/guards', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $executeRaw: vi.fn(),
    topupRequest: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/audit/record', () => ({ recordAdminAction: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requireAdmin } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { recordAdminAction } from '@/lib/audit/record'
import { approveTopup, rejectTopup } from '@/lib/actions/admin-topup'

const reqAdmin = requireAdmin as unknown as ReturnType<typeof vi.fn>
const execRaw = prisma.$executeRaw as unknown as ReturnType<typeof vi.fn>
const findUnique = prisma.topupRequest.findUnique as unknown as ReturnType<typeof vi.fn>
const update = prisma.topupRequest.update as unknown as ReturnType<typeof vi.fn>
const audit = recordAdminAction as unknown as ReturnType<typeof vi.fn>

describe('admin-topup', () => {
  beforeEach(() => {
    reqAdmin.mockReset(); execRaw.mockReset(); findUnique.mockReset(); update.mockReset(); audit.mockReset()
  })

  it('approveTopup: apply_topup 호출 + 감사 기록', async () => {
    reqAdmin.mockResolvedValue({ id: 'admin1' })
    findUnique.mockResolvedValue({ id: 'r1', amount_krw: 50000, status: 'PENDING', user_id: 'u1' })
    execRaw.mockResolvedValue(1)
    const res = await approveTopup('r1')
    expect(res.ok).toBe(true)
    expect(execRaw).toHaveBeenCalled()
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'approve_topup' }))
  })

  it('rejectTopup: 사유와 함께 거절 + 감사 기록', async () => {
    reqAdmin.mockResolvedValue({ id: 'admin1' })
    findUnique.mockResolvedValue({ id: 'r1', status: 'PENDING', user_id: 'u1' })
    update.mockResolvedValue({})
    const res = await rejectTopup('r1', '입금 확인 안 됨')
    expect(res.ok).toBe(true)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'REJECTED', reject_reason: '입금 확인 안 됨' }),
    }))
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'reject_topup' }))
  })
})
