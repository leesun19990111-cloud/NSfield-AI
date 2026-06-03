import { describe, it, expect, vi, afterEach } from 'vitest'
import { getImageAdapter, getVideoAdapter } from '@/lib/models/registry'

describe('registry', () => {
  it('nanobanana-2-t2i 이미지 어댑터 반환(config 기반)', () => {
    expect(getImageAdapter('nanobanana-2-t2i')?.id).toBe('nanobanana-2-t2i')
  })
  it('gpt-image-2.0 어댑터 반환(OpenAI)', () => {
    expect(getImageAdapter('gpt-image-2.0')?.id).toBe('gpt-image-2.0')
  })
  it('veo3.1-t2v 영상 어댑터 반환(config 기반)', () => {
    expect(getVideoAdapter('veo3.1-t2v')?.id).toBe('veo3.1-t2v')
  })
  it('seedance-2-i2v 영상 어댑터 반환(config 기반)', () => {
    expect(getVideoAdapter('seedance-2-i2v')?.id).toBe('seedance-2-i2v')
  })
  it('mock-image 어댑터 반환(비-production)', () => {
    expect(getImageAdapter('mock-image')?.id).toBe('mock-image')
  })
  it('mock-video 영상 어댑터 반환(비-production)', () => {
    expect(getVideoAdapter('mock-video')?.id).toBe('mock-video')
  })
  it('미등록 이미지 모델은 null', () => {
    expect(getImageAdapter('nope')).toBeNull()
  })
  it('미등록 영상 모델은 null', () => {
    expect(getVideoAdapter('nope')).toBeNull()
  })
})

describe('registry production gating', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })
  it('production에서는 mock 어댑터가 제외되고 실제 어댑터는 유지된다', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const reg = await import('@/lib/models/registry')
    expect(reg.getImageAdapter('mock-image')).toBeNull()
    expect(reg.getVideoAdapter('mock-video')).toBeNull()
    // 실제 어댑터는 여전히 등록
    expect(reg.getImageAdapter('nanobanana-2-t2i')?.id).toBe('nanobanana-2-t2i')
    expect(reg.getVideoAdapter('veo3.1-t2v')?.id).toBe('veo3.1-t2v')
  })
})
