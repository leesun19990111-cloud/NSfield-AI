import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { makeAtlasImageAdapter, makeAtlasVideoAdapter } from '@/lib/models/atlas/adapters'
import { getModelConfig } from '@/lib/models/catalog/registry'
import type { ModelConfig } from '@/lib/models/catalog/types'

function cfg(id: string): ModelConfig {
  const c = getModelConfig(id)
  if (!c) throw new Error(`config not found: ${id}`)
  return c
}

const B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('makeAtlasImageAdapter', () => {
  beforeEach(() => {
    process.env.ATLASCLOUD_API_KEY = 'test-key'
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('submit + poll(completed) → data: URL을 추가 다운로드 없이 base64로 반환한다', async () => {
    const fetchMock = vi
      .fn()
      // submit
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 'img-1' } }) } as Response)
      // poll completed
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { status: 'completed', outputs: [`data:image/png;base64,${B64}`] } }),
      } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const adapter = makeAtlasImageAdapter(cfg('nanobanana-2-t2i'))
    const res = await adapter.generate({ prompt: '고양이' })

    expect(res.images).toHaveLength(1)
    expect(res.images[0]!.b64).toBe(B64)
    expect(res.images[0]!.contentType).toBe('image/png')
    expect(res.cost_usd_raw).toBe(0)
    expect(res.meta).toMatchObject({ atlas_model: 'google/nano-banana-2/text-to-image', prediction_id: 'img-1' })
    // submit + poll = 2회 (data: URL은 추가 fetch 없음)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('poll(failed) → ATLASCLOUD_FAILED', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 'img-2' } }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: 'failed', error: '실패함' } }) } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const adapter = makeAtlasImageAdapter(cfg('nanobanana-2-t2i'))
    await expect(adapter.generate({ prompt: 'x' })).rejects.toMatchObject({ code: 'ATLASCLOUD_FAILED' })
  })
})

describe('makeAtlasVideoAdapter', () => {
  beforeEach(() => {
    process.env.ATLASCLOUD_API_KEY = 'test-key'
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('start → externalJobId 반환', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'vid-1' } }) } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const adapter = makeAtlasVideoAdapter(cfg('veo3.1-t2v'))
    const r = await adapter.start({ prompt: 'x' })
    expect(r.externalJobId).toBe('vid-1')
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.atlascloud.ai/api/v1/model/generateVideo')
  })

  it('poll completed → succeeded {videoUrl}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { status: 'completed', outputs: ['https://cdn/v.mp4'] } }),
    } as Response))

    const adapter = makeAtlasVideoAdapter(cfg('veo3.1-t2v'))
    const r = await adapter.poll('vid-1')
    expect(r.status).toBe('succeeded')
    if (r.status === 'succeeded') {
      expect(r.videoUrl).toBe('https://cdn/v.mp4')
      expect(r.cost_usd_raw).toBe(0)
      expect(r.meta).toMatchObject({ atlas_model: 'google/veo3.1/text-to-video' })
    }
  })

  it('poll failed → failed {reason}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { status: 'failed', error: '영상 실패' } }),
    } as Response))

    const adapter = makeAtlasVideoAdapter(cfg('veo3.1-t2v'))
    const r = await adapter.poll('vid-1')
    expect(r).toEqual({ status: 'failed', reason: '영상 실패' })
  })

  it('poll processing → running', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { status: 'processing' } }),
    } as Response))

    const adapter = makeAtlasVideoAdapter(cfg('veo3.1-t2v'))
    const r = await adapter.poll('vid-1')
    expect(r.status).toBe('running')
  })
})
