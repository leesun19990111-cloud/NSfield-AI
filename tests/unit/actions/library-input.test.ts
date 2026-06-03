import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/guards', () => ({ requireUser: vi.fn() }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    generation: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/storage/signed-url', () => ({ getSignedUrl: vi.fn() }))

import { requireUser } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { getSignedUrl } from '@/lib/storage/signed-url'
import { listMyImageResultsForInput } from '@/lib/actions/library'

const reqUser = requireUser as unknown as ReturnType<typeof vi.fn>
const findMany = prisma.generation.findMany as unknown as ReturnType<typeof vi.fn>
const signed = getSignedUrl as unknown as ReturnType<typeof vi.fn>

describe('listMyImageResultsForInput', () => {
  beforeEach(() => {
    reqUser.mockReset()
    findMany.mockReset()
    signed.mockReset()
  })

  it('내 SUCCEEDED 이미지 중 서명 URL이 있는 항목만 최신순 형태로 반환', async () => {
    reqUser.mockResolvedValue({ id: 'u1' })
    const d1 = new Date('2026-06-03T00:00:00Z')
    const d2 = new Date('2026-06-01T00:00:00Z')
    findMany.mockResolvedValue([
      { id: 'g1', prompt: 'p1', result_urls: ['gens/a.png'], created_at: d1 },
      { id: 'g2', prompt: 'p2', result_urls: ['gens/b.png'], created_at: d2 },
    ])
    // g1 -> 서명 URL 성공, g2 -> null (서명 실패 -> 결과에서 제외)
    signed.mockResolvedValueOnce('https://signed/a').mockResolvedValueOnce(null)

    const items = await listMyImageResultsForInput()

    // 본인 + IMAGE + SUCCEEDED + 비어있지 않은 result_urls 조건으로 조회
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'u1', kind: 'IMAGE', status: 'SUCCEEDED', NOT: { result_urls: { isEmpty: true } } },
        orderBy: { created_at: 'desc' },
        take: 30,
      }),
    )
    // URL 없는 항목은 필터링되어 g1만 남음
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({ id: 'g1', prompt: 'p1', created_at: d1, url: 'https://signed/a' })
    expect(signed).toHaveBeenCalledWith('gens/a.png', 3600)
  })

  it('limit 인자를 take로 전달', async () => {
    reqUser.mockResolvedValue({ id: 'u1' })
    findMany.mockResolvedValue([])
    await listMyImageResultsForInput(5)
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }))
  })
})
