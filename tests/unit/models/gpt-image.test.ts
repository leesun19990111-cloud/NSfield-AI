import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const fixture = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../fixtures/openai/image-response.json'), 'utf8'),
)

import { gptImageAdapter } from '@/lib/models/image/gpt-image'

describe('gptImageAdapter', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    vi.restoreAllMocks()
  })

  it('OpenAI 응답을 GeneratedImage로 파싱', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => fixture,
    })) as unknown as typeof fetch)

    const res = await gptImageAdapter.generate({ prompt: '고양이', count: 1 })
    expect(res.images).toHaveLength(1)
    expect(res.images[0]!.b64).toBe(fixture.data[0].b64_json)
    expect(res.images[0]!.contentType).toBe('image/png')
    expect(res.cost_usd_raw).toBeGreaterThan(0)
  })

  it('API 비정상 응답이면 AdapterError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 400, text: async () => 'bad request',
    })) as unknown as typeof fetch)

    await expect(gptImageAdapter.generate({ prompt: 'x' })).rejects.toMatchObject({ code: 'OPENAI_ERROR' })
  })
})
