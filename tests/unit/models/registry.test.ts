import { describe, it, expect, vi, afterEach } from 'vitest'
import { getImageAdapter, getVideoAdapter } from '@/lib/models/registry'

describe('registry', () => {
  it('gpt-image-2.0 어댑터 반환', () => {
    expect(getImageAdapter('gpt-image-2.0')?.id).toBe('gpt-image-2.0')
  })
  it('mock-image 어댑터 반환', () => {
    expect(getImageAdapter('mock-image')?.id).toBe('mock-image')
  })
  it('미등록 모델은 null', () => {
    expect(getImageAdapter('nope')).toBeNull()
  })
  it('seedream-4.5 이미지 어댑터 반환', () => {
    expect(getImageAdapter('seedream-4.5')?.id).toBe('seedream-4.5')
  })
  it('nanobanana-pro 이미지 어댑터 반환', () => {
    expect(getImageAdapter('nanobanana-pro')?.id).toBe('nanobanana-pro')
  })
  it('veo3 영상 어댑터 반환', () => {
    expect(getVideoAdapter('veo3')?.id).toBe('veo3')
  })
  it('mock-video 영상 어댑터 반환(비-production)', () => {
    expect(getVideoAdapter('mock-video')?.id).toBe('mock-video')
  })
  it('미등록 영상 모델은 null', () => {
    expect(getVideoAdapter('nope')).toBeNull()
  })
})

describe('registry production gating', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
  it('production에서는 mock 어댑터가 제외됨', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const reg = await import('@/lib/models/registry')
    expect(reg.getImageAdapter('mock-image')).toBeNull()
    expect(reg.getVideoAdapter('mock-video')).toBeNull()
    // 실제 어댑터는 여전히 등록
    expect(reg.getImageAdapter('gpt-image-2.0')?.id).toBe('gpt-image-2.0')
    expect(reg.getVideoAdapter('veo3')?.id).toBe('veo3')
  })
})
