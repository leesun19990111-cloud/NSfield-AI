import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildRequestBody, atlasPoll, atlasSubmit } from '@/lib/models/atlas/client'
import { getModelConfig } from '@/lib/models/catalog/registry'
import type { ModelConfig } from '@/lib/models/catalog/types'

function cfg(id: string): ModelConfig {
  const c = getModelConfig(id)
  if (!c) throw new Error(`config not found: ${id}`)
  return c
}

describe('buildRequestBody (실제 레지스트리 config 사용)', () => {
  it('veo3.1-t2v: 입력 param을 그대로 매핑하고 model을 포함한다', () => {
    const body = buildRequestBody(cfg('veo3.1-t2v'), {
      prompt: 'x',
      aspect_ratio: '16:9',
      duration: 8,
      generate_audio: true,
    })
    expect(body).toEqual({
      model: 'google/veo3.1/text-to-video',
      prompt: 'x',
      aspect_ratio: '16:9',
      duration: 8,
      generate_audio: true,
    })
  })

  it('seedance-2-i2v: image/ratio를 매핑하고 aspect_ratio는 없다', () => {
    const body = buildRequestBody(cfg('seedance-2-i2v'), {
      prompt: 'p',
      image: 'url',
      ratio: 'adaptive',
      duration: 5,
    })
    expect(body.model).toBe('bytedance/seedance-2.0/image-to-video')
    expect(body.image).toBe('url')
    expect(body.ratio).toBe('adaptive')
    expect(body.duration).toBe(5)
    expect(body).not.toHaveProperty('aspect_ratio')
  })

  it('nanobanana-2-ref2i: images[]와 video_clips[]를 매핑한다', () => {
    const body = buildRequestBody(cfg('nanobanana-2-ref2i'), {
      prompt: 'p',
      images: ['a', 'b'],
      video_clips: [{ url: 'v', start: 0, ends: 0, fps: 1 }],
    })
    expect(body.model).toBe('google/nano-banana-2/reference-to-image')
    expect(body.prompt).toBe('p')
    expect(body.images).toEqual(['a', 'b'])
    expect(body.video_clips).toEqual([{ url: 'v', start: 0, ends: 0, fps: 1 }])
  })

  it('undefined/null/빈 문자열/빈 배열 입력은 생략한다(모델 기본값 사용)', () => {
    const body = buildRequestBody(cfg('veo3.1-t2v'), {
      prompt: 'x',
      aspect_ratio: undefined,
      duration: null,
      resolution: '',
      generate_audio: true,
      negative_prompt: '',
      seed: undefined,
    })
    expect(body).toEqual({ model: 'google/veo3.1/text-to-video', prompt: 'x', generate_audio: true })
  })

  it('config에 없는 입력 키는 무시한다', () => {
    const body = buildRequestBody(cfg('veo3.1-t2v'), { prompt: 'x', bogus: 'nope' })
    expect(body).not.toHaveProperty('bogus')
  })
})

describe('atlasSubmit', () => {
  beforeEach(() => {
    process.env.ATLASCLOUD_API_KEY = 'test-key'
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('VIDEO 모델은 generateVideo로 POST하고 buildRequestBody 바디를 보내며 id를 반환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 'p1' } }),
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const id = await atlasSubmit(cfg('veo3.1-t2v'), { prompt: 'x', aspect_ratio: '16:9' })
    expect(id).toBe('p1')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.atlascloud.ai/api/v1/model/generateVideo')
    expect((init as RequestInit).method).toBe('POST')
    const sentBody = JSON.parse((init as RequestInit).body as string)
    expect(sentBody).toEqual({ model: 'google/veo3.1/text-to-video', prompt: 'x', aspect_ratio: '16:9' })
  })

  it('IMAGE 모델은 generateImage로 POST한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, message: 'ok', data: { id: 'img1' } }),
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const id = await atlasSubmit(cfg('nanobanana-2-t2i'), { prompt: 'x' })
    expect(id).toBe('img1')
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.atlascloud.ai/api/v1/model/generateImage')
  })

  it('id가 없으면 ATLASCLOUD_NO_JOB을 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) } as Response))
    await expect(atlasSubmit(cfg('veo3.1-t2v'), { prompt: 'x' })).rejects.toMatchObject({ code: 'ATLASCLOUD_NO_JOB' })
  })

  it('!ok면 ATLASCLOUD_ERROR를 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response))
    await expect(atlasSubmit(cfg('veo3.1-t2v'), { prompt: 'x' })).rejects.toMatchObject({ code: 'ATLASCLOUD_ERROR' })
  })

  it('키 미설정이면 ATLASCLOUD_NO_KEY를 던진다', async () => {
    delete process.env.ATLASCLOUD_API_KEY
    await expect(atlasSubmit(cfg('veo3.1-t2v'), { prompt: 'x' })).rejects.toMatchObject({ code: 'ATLASCLOUD_NO_KEY' })
  })
})

describe('atlasPoll 응답 파싱', () => {
  beforeEach(() => {
    process.env.ATLASCLOUD_API_KEY = 'test-key'
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mockPoll(json: unknown, ok = true, status = 200) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, status, json: async () => json } as Response))
  }

  it('completed + outputs → succeeded {url}', async () => {
    mockPoll({ data: { status: 'completed', outputs: ['u'] } })
    const r = await atlasPoll('p1')
    expect(r.status).toBe('succeeded')
    if (r.status === 'succeeded') expect(r.url).toBe('u')
  })

  it('succeeded(별칭) + outputs → succeeded {url}', async () => {
    mockPoll({ data: { status: 'succeeded', outputs: ['u2'] } })
    const r = await atlasPoll('p1')
    expect(r.status).toBe('succeeded')
    if (r.status === 'succeeded') expect(r.url).toBe('u2')
  })

  it('failed + error → failed {reason}', async () => {
    mockPoll({ data: { status: 'failed', error: 'e' } })
    const r = await atlasPoll('p1')
    expect(r).toEqual({ status: 'failed', reason: 'e' })
  })

  it('processing → running', async () => {
    mockPoll({ data: { status: 'processing' } })
    expect((await atlasPoll('p1')).status).toBe('running')
  })

  it('created → running', async () => {
    mockPoll({ data: { status: 'created' } })
    expect((await atlasPoll('p1')).status).toBe('running')
  })

  it('wrapped {code,message,data} 형태도 동일하게 파싱한다', async () => {
    mockPoll({ code: 0, message: 'ok', data: { status: 'completed', outputs: ['wrapped'] } })
    const r = await atlasPoll('p1')
    expect(r.status).toBe('succeeded')
    if (r.status === 'succeeded') expect(r.url).toBe('wrapped')
  })

  it('completed인데 outputs가 없으면 failed', async () => {
    mockPoll({ data: { status: 'completed', outputs: [] } })
    expect((await atlasPoll('p1')).status).toBe('failed')
  })

  it('!ok면 ATLASCLOUD_ERROR를 던진다', async () => {
    mockPoll({}, false, 503)
    await expect(atlasPoll('p1')).rejects.toMatchObject({ code: 'ATLASCLOUD_ERROR' })
  })
})
