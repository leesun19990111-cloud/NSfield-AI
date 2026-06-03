import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/session', () => ({
  getSessionUser: vi.fn(),
}))

import { getSessionUser } from '@/lib/auth/session'
import { requireUser, requireAdmin } from '@/lib/auth/guards'

const mockGet = getSessionUser as unknown as ReturnType<typeof vi.fn>

describe('guards', () => {
  beforeEach(() => mockGet.mockReset())

  it('requireUser: 세션 없으면 UNAUTHENTICATED', async () => {
    mockGet.mockResolvedValue(null)
    await expect(requireUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('requireAdmin: USER면 FORBIDDEN', async () => {
    mockGet.mockResolvedValue({ id: '1', email: 'a@b.c', role: 'USER', display_name: null, topup_code: 'AAAA' })
    await expect(requireAdmin()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('requireAdmin: ADMIN이면 통과', async () => {
    const admin = { id: '1', email: 'a@b.c', role: 'ADMIN' as const, display_name: null, topup_code: 'AAAA' }
    mockGet.mockResolvedValue(admin)
    await expect(requireAdmin()).resolves.toEqual(admin)
  })
})
