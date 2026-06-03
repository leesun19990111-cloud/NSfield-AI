import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/guards', () => ({ requireUser: vi.fn() }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    model: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/fx/service', () => ({ getCurrentFxRate: vi.fn() }))
// getModelConfig만 모킹. 나머지 export(listConfigs 등)는 registry.ts가 사용하므로 원본 유지.
vi.mock('@/lib/models/catalog/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/models/catalog/registry')>()
  return { ...actual, getModelConfig: vi.fn() }
})

import { requireUser } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { getCurrentFxRate } from '@/lib/fx/service'
import { getModelConfig } from '@/lib/models/catalog/registry'
import { estimateGeneration } from '@/lib/actions/generation'

const reqUser = requireUser as unknown as ReturnType<typeof vi.fn>
const findUnique = prisma.model.findUnique as unknown as ReturnType<typeof vi.fn>
const fx = getCurrentFxRate as unknown as ReturnType<typeof vi.fn>
const config = getModelConfig as unknown as ReturnType<typeof vi.fn>

describe('estimateGeneration breakdown', () => {
  beforeEach(() => {
    reqUser.mockReset()
    findUnique.mockReset()
    fx.mockReset()
    config.mockReset()
    reqUser.mockResolvedValue({ id: 'u1', role: 'USER' })
    fx.mockResolvedValue(1380)
  })

  it('per_second: 단가·초·마진 분해 (duration 10초)', async () => {
    findUnique.mockResolvedValue({
      id: 'mock-video',
      kind: 'VIDEO',
      display_name: 'Mock Video',
      provider: 'mock',
      is_active: true,
      margin_pct: 10,
      pricing_json: {
        kind: 'per_second',
        usd_per_unit: 0.096,
        options: { allowed_durations_sec: [5, 10], polling_interval_sec: 5 },
      },
    })
    config.mockReturnValue({ id: 'mock-video', durationParam: 'duration' })

    const res = await estimateGeneration({ modelId: 'mock-video', prompt: '바다', duration: 10 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.breakdown.kind).toBe('per_second')
    expect(res.breakdown.unitUsd).toBe(0.096)
    expect(res.breakdown.units).toBe(10)
    expect(res.breakdown.unitLabel).toBe('초')
    expect(res.breakdown.marginPct).toBe(10)
    expect(res.breakdown.baseUsd).toBeCloseTo(0.96, 6)
    expect(res.breakdown.billedUsd).toBeCloseTo(1.056, 6)
    // billedUsd는 실제 차감과 동일해야 함
    expect(res.billedUsd).toBe(res.breakdown.billedUsd)
  })

  it('per_image: 단가·장·마진 분해 (count 1)', async () => {
    findUnique.mockResolvedValue({
      id: 'mock-image',
      kind: 'IMAGE',
      display_name: 'Mock Image',
      provider: 'mock',
      is_active: true,
      margin_pct: 10,
      pricing_json: { kind: 'per_image', usd_per_unit: 0.013 },
    })
    config.mockReturnValue({ id: 'mock-image' })

    const res = await estimateGeneration({ modelId: 'mock-image', prompt: '고양이' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.breakdown.kind).toBe('per_image')
    expect(res.breakdown.unitUsd).toBe(0.013)
    expect(res.breakdown.units).toBe(1)
    expect(res.breakdown.unitLabel).toBe('장')
    expect(res.breakdown.marginPct).toBe(10)
    expect(res.breakdown.baseUsd).toBeCloseTo(0.013, 6)
    expect(res.breakdown.billedUsd).toBeCloseTo(0.0143, 6)
    expect(res.billedUsd).toBe(res.breakdown.billedUsd)
  })
})
