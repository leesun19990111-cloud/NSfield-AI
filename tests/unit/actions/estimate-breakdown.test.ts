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

  it('per_second: generate_audio=true면 오디오 단가가 breakdown·견적에 반영', async () => {
    findUnique.mockResolvedValue({
      id: 'veo3.1-t2v',
      kind: 'VIDEO',
      display_name: 'Veo 3.1',
      provider: 'google',
      is_active: true,
      margin_pct: 10,
      pricing_json: {
        kind: 'per_second',
        usd_per_unit: 0.2,
        usd_per_unit_audio: 0.4,
        options: { allowed_durations_sec: [4, 6, 8], polling_interval_sec: 60 },
      },
    })
    config.mockReturnValue({ id: 'veo3.1-t2v', durationParam: 'duration' })

    const res = await estimateGeneration({
      modelId: 'veo3.1-t2v', prompt: '바다', duration: 8, generate_audio: true,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.breakdown.kind).toBe('per_second')
    expect(res.breakdown.unitUsd).toBe(0.4) // 오디오 단가
    expect(res.breakdown.units).toBe(8)
    expect(res.breakdown.baseUsd).toBeCloseTo(3.2, 6)
    expect(res.breakdown.billedUsd).toBeCloseTo(3.52, 6)
    expect(res.billedUsd).toBe(res.breakdown.billedUsd)
  })

  it('per_second: generate_audio 미지정이면 기본 단가', async () => {
    findUnique.mockResolvedValue({
      id: 'veo3.1-t2v',
      kind: 'VIDEO',
      display_name: 'Veo 3.1',
      provider: 'google',
      is_active: true,
      margin_pct: 10,
      pricing_json: {
        kind: 'per_second',
        usd_per_unit: 0.2,
        usd_per_unit_audio: 0.4,
        options: { allowed_durations_sec: [4, 6, 8], polling_interval_sec: 60 },
      },
    })
    config.mockReturnValue({ id: 'veo3.1-t2v', durationParam: 'duration' })

    const res = await estimateGeneration({ modelId: 'veo3.1-t2v', prompt: '바다', duration: 8 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.breakdown.unitUsd).toBe(0.2) // 기본 단가
    expect(res.breakdown.baseUsd).toBeCloseTo(1.6, 6)
    expect(res.breakdown.billedUsd).toBeCloseTo(1.76, 6)
  })

  it('per_video_token: resolution/ratio가 호출부→pricing까지 전달되어 견적에 반영', async () => {
    findUnique.mockResolvedValue({
      id: 'seedance-2-i2v',
      kind: 'VIDEO',
      display_name: 'Seedance',
      provider: 'bytedance',
      is_active: true,
      margin_pct: 10,
      pricing_json: {
        kind: 'per_video_token',
        usd_per_1k_tokens: 0.0112,
        fps: 24,
        options: { allowed_durations_sec: [4, 5, 6, 7, 8], polling_interval_sec: 60 },
      },
    })
    config.mockReturnValue({ id: 'seedance-2-i2v', durationParam: 'duration' })

    // 1080p는 720p보다 비싸야 한다 (resolution이 실제 전달된다는 증거)
    const hi = await estimateGeneration({
      modelId: 'seedance-2-i2v', prompt: '바다', duration: 8, resolution: '1080p', ratio: '16:9',
    })
    expect(hi.ok).toBe(true)
    if (!hi.ok) return
    expect(hi.breakdown.kind).toBe('per_video_token')
    expect(hi.breakdown.units).toBe(8)
    expect(hi.breakdown.unitLabel).toBe('초')
    expect(hi.breakdown.baseUsd).toBeCloseTo(4.35456, 4) // 2073600×192/1024/1000×0.0112
    expect(hi.breakdown.unitUsd).toBeCloseTo(0.54432, 5) // baseUsd/8 = 유효 초당 단가
    expect(hi.billedUsd).toBe(hi.breakdown.billedUsd)

    const lo = await estimateGeneration({
      modelId: 'seedance-2-i2v', prompt: '바다', duration: 8, resolution: '720p', ratio: '16:9',
    })
    if (!lo.ok) return
    expect(lo.breakdown.baseUsd).toBeCloseTo(1.93536, 4)
    expect(lo.breakdown.baseUsd).toBeLessThan(hi.breakdown.baseUsd)
  })

  it('per_image_tiered: resolution + 검색토글이 호출부→pricing까지 전달', async () => {
    findUnique.mockResolvedValue({
      id: 'nanobanana-2-t2i',
      kind: 'IMAGE',
      display_name: 'Nano Banana 2',
      provider: 'google',
      is_active: true,
      margin_pct: 10,
      pricing_json: {
        kind: 'per_image_tiered',
        resolution_usd: { '1k': 0.08, '2k': 0.12, '4k': 0.16 },
        surcharges: { enable_web_search: 0.014, enable_image_search: 0.014 },
      },
    })
    config.mockReturnValue({ id: 'nanobanana-2-t2i' })

    const res = await estimateGeneration({
      modelId: 'nanobanana-2-t2i', prompt: '고양이', resolution: '2k', enable_web_search: true,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.breakdown.kind).toBe('per_image_tiered')
    expect(res.breakdown.unitLabel).toBe('장')
    expect(res.breakdown.baseUsd).toBeCloseTo(0.134, 6) // 0.12 + 0.014(웹검색)
    expect(res.breakdown.billedUsd).toBeCloseTo(0.1474, 6)
    expect(res.billedUsd).toBe(res.breakdown.billedUsd)

    const plain = await estimateGeneration({ modelId: 'nanobanana-2-t2i', prompt: '고양이', resolution: '1k' })
    if (!plain.ok) return
    expect(plain.breakdown.baseUsd).toBeCloseTo(0.08, 6)
    expect(plain.breakdown.baseUsd).toBeLessThan(res.breakdown.baseUsd)
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
