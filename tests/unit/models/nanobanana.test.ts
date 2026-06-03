import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nanobanana20Adapter } from '@/lib/models/image/nanobanana'

const B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('nanobanana20Adapter (AtlasCloud)', () => {
  beforeEach(() => {
    process.env.ATLASCLOUD_API_KEY = 'test-key'
    vi.restoreAllMocks()
  })

  it('submit→poll(completed)에서 base64 이미지 파싱', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 'pred-1' } }) }) // submit
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { status: 'completed', outputs: [B64] } }),
      }) // poll
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
    const res = await nanobanana20Adapter.generate({ prompt: '고양이' })
    expect(res.images).toHaveLength(1)
    expect(res.images[0]!.b64).toBe(B64)
    expect(res.images[0]!.contentType).toBe('image/png')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('data: 프리픽스가 있으면 제거', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 'p' } }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { status: 'succeeded', outputs: [`data:image/png;base64,${B64}`] } }),
      })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
    const res = await nanobanana20Adapter.generate({ prompt: 'x' })
    expect(res.images[0]!.b64).toBe(B64)
  })

  it('status failed면 AdapterError', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 'p' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: 'failed', error: 'nsfw' } }) })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
    await expect(nanobanana20Adapter.generate({ prompt: 'x' })).rejects.toMatchObject({
      code: 'ATLASCLOUD_FAILED',
    })
  })

  it('키 없으면 ATLASCLOUD_NO_KEY', async () => {
    delete process.env.ATLASCLOUD_API_KEY
    await expect(nanobanana20Adapter.generate({ prompt: 'x' })).rejects.toMatchObject({
      code: 'ATLASCLOUD_NO_KEY',
    })
  })
})
