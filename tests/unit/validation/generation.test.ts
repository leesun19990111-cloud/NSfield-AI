import { describe, it, expect } from 'vitest'
import { imageGenerateSchema } from '@/lib/validation/generation'

describe('imageGenerateSchema', () => {
  it('정상: 프롬프트 1~2000자', () => {
    expect(imageGenerateSchema.safeParse({ modelId: 'gpt-image-2.0', prompt: '고양이', count: 1 }).success).toBe(true)
  })
  it('빈 프롬프트 거부', () => {
    expect(imageGenerateSchema.safeParse({ modelId: 'gpt-image-2.0', prompt: '' }).success).toBe(false)
  })
  it('2000자 초과 거부', () => {
    expect(imageGenerateSchema.safeParse({ modelId: 'gpt-image-2.0', prompt: 'a'.repeat(2001) }).success).toBe(false)
  })
})
