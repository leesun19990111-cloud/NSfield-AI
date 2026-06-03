import { describe, it, expect } from 'vitest'
import { buildInputSchema } from '@/lib/validation/dynamic'
import { getModelConfig } from '@/lib/models/catalog/registry'

function schemaFor(id: string) {
  const config = getModelConfig(id)
  if (!config) throw new Error(`config not found: ${id}`)
  return buildInputSchema(config)
}

describe('buildInputSchema — veo3.1-t2v (text-to-video)', () => {
  const schema = schemaFor('veo3.1-t2v')

  it('유효 입력 통과', () => {
    expect(
      schema.safeParse({ prompt: 'x', aspect_ratio: '16:9', duration: 8, generate_audio: true }).success,
    ).toBe(true)
  })
  it('prompt 누락 시 실패', () => {
    expect(schema.safeParse({ aspect_ratio: '16:9', duration: 8 }).success).toBe(false)
  })
  it('duration 7(허용 외 [4,6,8]) 실패', () => {
    expect(schema.safeParse({ prompt: 'x', duration: 7 }).success).toBe(false)
  })
  it('aspect_ratio 1:1(옵션 외) 실패', () => {
    expect(schema.safeParse({ prompt: 'x', aspect_ratio: '1:1' }).success).toBe(false)
  })
})

describe('buildInputSchema — seedance-2-i2v (required image)', () => {
  const schema = schemaFor('seedance-2-i2v')

  it('required image 누락 시 실패', () => {
    expect(schema.safeParse({ prompt: 'x', duration: 5 }).success).toBe(false)
  })
  it('image 포함 시 통과', () => {
    expect(schema.safeParse({ prompt: 'x', image: 'data:..', duration: 5 }).success).toBe(true)
  })
})

describe('buildInputSchema — nanobanana-2-ref2i (required video_clips)', () => {
  const schema = schemaFor('nanobanana-2-ref2i')

  it('required video_clips 누락 시 실패', () => {
    expect(schema.safeParse({ prompt: 'x' }).success).toBe(false)
  })
  it('clip 1개 포함 시 통과', () => {
    expect(schema.safeParse({ prompt: 'x', video_clips: [{ url: 'u' }] }).success).toBe(true)
  })
})
