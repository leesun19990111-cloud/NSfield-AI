import { describe, it, expect } from 'vitest'
import {
  MODEL_CONFIGS,
  getModelConfig,
  listConfigs,
  listActiveConfigs,
} from '@/lib/models/catalog/registry'
import type { FieldType } from '@/lib/models/catalog/types'

// param이 필수인 필드 종류
const PARAM_FIELDS = ['select', 'int', 'toggle', 'image', 'images', 'video_clip'] as const

function hasNonEmptyParam(f: FieldType): boolean {
  if (PARAM_FIELDS.includes(f.kind as (typeof PARAM_FIELDS)[number])) {
    const param = (f as { param?: unknown }).param
    return typeof param === 'string' && param.length > 0
  }
  return true
}

describe('catalog registry', () => {
  it('모든 config의 id가 유일하다', () => {
    const ids = MODEL_CONFIGS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('활성 config는 atlasModel이 비어있지 않다 (gpt-image-2.0 제외: OpenAI, AtlasCloud 모델 문자열 없음)', () => {
    for (const c of listActiveConfigs()) {
      if (c.id === 'gpt-image-2.0') continue
      expect(c.atlasModel.length).toBeGreaterThan(0)
    }
  })

  it('모든 config는 prompt 필드를 가진다', () => {
    for (const c of MODEL_CONFIGS) {
      expect(c.fields.some((f) => f.kind === 'prompt')).toBe(true)
    }
  })

  it('param 기반 필드는 비어있지 않은 문자열 param을 가진다', () => {
    for (const c of MODEL_CONFIGS) {
      const all = [...c.fields, ...(c.advancedFields ?? [])]
      for (const f of all) {
        expect(hasNonEmptyParam(f)).toBe(true)
      }
    }
  })

  it('getModelConfig는 id로 조회하고 없는 id는 undefined', () => {
    expect(getModelConfig('nanobanana-2-t2i')?.id).toBe('nanobanana-2-t2i')
    expect(getModelConfig('gpt-image-2.0')?.id).toBe('gpt-image-2.0')
    expect(getModelConfig('does-not-exist')).toBeUndefined()
  })

  it('listConfigs는 전체, listActiveConfigs는 활성 모델만 반환', () => {
    expect(listConfigs().length).toBe(MODEL_CONFIGS.length)
    const active = listActiveConfigs()
    const ids = active.map((c) => c.id).sort()
    // owner 확정 단가 적용 → production 18종 전부 활성(mock 2종만 비활성).
    expect(ids).toEqual([
      'gpt-image-2.0',
      'kling-v3-pro-i2v',
      'kling-v3-pro-t2v',
      'kling-v3-std-i2v',
      'kling-v3-std-t2v',
      'nanobanana-2-ref2i',
      'nanobanana-2-t2i',
      'nanobanana-pro-t2i',
      'seedance-2-i2v',
      'seedance-2-ref2v',
      'seedance-2-t2v',
      'seedream-v4-t2i',
      'seedream-v4.5-t2i',
      'veo3.1-fast-i2v',
      'veo3.1-fast-t2v',
      'veo3.1-i2v',
      'veo3.1-ref2v',
      'veo3.1-t2v',
    ])
    // 모든 활성 config는 비어있지 않은 atlasModel (gpt-image-2.0 제외: OpenAI)
    for (const c of active) {
      if (c.id === 'gpt-image-2.0') continue
      expect(c.atlasModel.length).toBeGreaterThan(0)
    }
  })
})
