import { describe, it, expect } from 'vitest'
import { videoGenerateSchema } from '@/lib/validation/generation'

describe('videoGenerateSchema', () => {
  it('정상: 허용 길이 5초', () => {
    expect(videoGenerateSchema.safeParse({ modelId: 'veo3', prompt: '바다', duration_sec: 5 }).success).toBe(true)
  })
  it('허용 외 길이(7초) 거부', () => {
    expect(videoGenerateSchema.safeParse({ modelId: 'veo3', prompt: '바다', duration_sec: 7 }).success).toBe(false)
  })
  it('빈 프롬프트 거부', () => {
    expect(videoGenerateSchema.safeParse({ modelId: 'veo3', prompt: '', duration_sec: 5 }).success).toBe(false)
  })
})
