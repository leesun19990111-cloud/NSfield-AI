import { describe, it, expect } from 'vitest'
import { getImageAdapter } from '@/lib/models/registry'

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
})
