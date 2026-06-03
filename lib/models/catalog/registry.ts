import type { FieldType, ModelConfig } from './types'

// 공통 select 옵션 헬퍼 (value=label인 단순 옵션)
const opts = (values: string[]) => values.map((v) => ({ value: v, label: v }))

// ── 활성 모델 fields (API 문서 기준 정확) ──────────────────────────────

const nanobanana2T2iFields: FieldType[] = [
  { kind: 'prompt' },
  { kind: 'select', param: 'aspect_ratio', label: '화면 비율', options: opts(['1:1', '16:9', '9:16', '4:3', '3:4']), default: '1:1' },
  { kind: 'select', param: 'resolution', label: '해상도', options: opts(['1k', '2k', '4k']), default: '1k' },
]
const nanobanana2T2iAdvanced: FieldType[] = [
  { kind: 'select', param: 'thinking_level', label: 'Thinking Level', options: opts(['default', 'minimal', 'high']), default: 'default' },
  { kind: 'toggle', param: 'enable_web_search', label: '웹 검색 사용', default: false },
]

const nanobanana2Ref2iFields: FieldType[] = [
  { kind: 'prompt' },
  { kind: 'video_clip', param: 'video_clips', label: '비디오 클립', required: true },
  { kind: 'images', param: 'images', label: '참조 이미지', max: 10 },
]
const nanobanana2Ref2iAdvanced: FieldType[] = [
  { kind: 'select', param: 'aspect_ratio', label: '화면 비율', options: opts(['1:1', '16:9', '9:16', '4:3', '3:4']), default: '1:1' },
  { kind: 'select', param: 'resolution', label: '해상도', options: opts(['1k', '2k', '4k']), default: '1k' },
  { kind: 'select', param: 'thinking_level', label: 'Thinking Level', options: opts(['default', 'minimal', 'high']), default: 'default' },
]

const veo31T2vFields: FieldType[] = [
  { kind: 'prompt' },
  { kind: 'select', param: 'aspect_ratio', label: '화면 비율', options: opts(['16:9', '9:16']), default: '16:9' },
  { kind: 'int', param: 'duration', label: '길이(초)', options: [4, 6, 8], default: 8 },
  { kind: 'select', param: 'resolution', label: '해상도', options: opts(['720p', '1080p', '4k']), default: '720p' },
  { kind: 'toggle', param: 'generate_audio', label: '오디오 생성', default: true },
]
const veo31T2vAdvanced: FieldType[] = [
  { kind: 'negative_prompt' },
  { kind: 'int', param: 'seed', label: 'Seed' },
]

const seedance2I2vFields: FieldType[] = [
  { kind: 'prompt' },
  { kind: 'image', param: 'image', label: '입력 이미지', required: true },
  { kind: 'select', param: 'ratio', label: '화면 비율', options: opts(['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4']), default: 'adaptive' },
  { kind: 'int', param: 'duration', label: '길이(초)', options: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], default: 5 },
  { kind: 'select', param: 'resolution', label: '해상도', options: opts(['480p', '720p', '1080p']), default: '720p' },
  { kind: 'toggle', param: 'generate_audio', label: '오디오 생성', default: true },
]
const seedance2I2vAdvanced: FieldType[] = [
  { kind: 'image', param: 'last_image', label: '마지막 프레임 이미지' },
  { kind: 'toggle', param: 'return_last_frame', label: '마지막 프레임 반환', default: false },
]

// nano-banana Pro t2i (문서 확정): nano-2와 달리 thinking_level/image_search 없음, aspect_ratio 10종
const nanobananaProT2iFields: FieldType[] = [
  { kind: 'prompt' },
  { kind: 'select', param: 'aspect_ratio', label: '화면 비율', options: opts(['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']), default: '1:1' },
  { kind: 'select', param: 'resolution', label: '해상도', options: opts(['1k', '2k', '4k']), default: '1k' },
]
const nanobananaProT2iAdvanced: FieldType[] = [
  { kind: 'toggle', param: 'enable_web_search', label: '웹 검색 사용', default: false },
]

// Seedream t2i (문서 확정): aspect_ratio/resolution 대신 size(WIDTH*HEIGHT) 단일 파라미터
const SEEDREAM_SIZES = [
  '2048*2048', '2304*1728', '1728*2304', '2848*1600', '1600*2848', '2496*1664', '1664*2496', '3136*1344',
  '4096*4096', '4704*3520', '3520*4704', '5504*3040', '3040*5504', '4992*3328', '3328*4992', '6240*2656',
]
const seedreamT2iFields: FieldType[] = [
  { kind: 'prompt' },
  { kind: 'select', param: 'size', label: '크기', options: SEEDREAM_SIZES.map((s) => ({ value: s, label: s.replace('*', '×') })), default: '2048*2048' },
]

// ── 모달리티별 best-guess 템플릿 (비활성 모델 재사용) ────────────────────

const t2vTemplate: FieldType[] = veo31T2vFields
const t2vTemplateAdvanced: FieldType[] = veo31T2vAdvanced

const i2vTemplate: FieldType[] = seedance2I2vFields
const i2vTemplateAdvanced: FieldType[] = seedance2I2vAdvanced

const ref2vTemplate: FieldType[] = [
  { kind: 'prompt' },
  { kind: 'images', param: 'images', label: '참조 이미지', max: 10 },
  { kind: 'select', param: 'aspect_ratio', label: '화면 비율', options: opts(['16:9', '9:16']), default: '16:9' },
  { kind: 'int', param: 'duration', label: '길이(초)', options: [4, 6, 8], default: 8 },
  { kind: 'select', param: 'resolution', label: '해상도', options: opts(['720p', '1080p']), default: '720p' },
]

// best-guess 영상 가격 placeholder
const guessVideoPricing = (tiers: Record<string, number>, durations: number[]): Record<string, unknown> => ({
  kind: 'per_video_fixed',
  tiers,
  options: { allowed_durations_sec: durations, polling_interval_sec: 60 },
})

export const MODEL_CONFIGS: ModelConfig[] = [
  // ── 활성 4종 (AtlasCloud 문서 확보) ──────────────────────────────────
  {
    id: 'nanobanana-2-t2i',
    atlasModel: 'google/nano-banana-2/text-to-image',
    family: 'nanobanana',
    modality: 'text-to-image',
    output: 'IMAGE',
    displayName: 'Nano Banana 2 (텍스트→이미지)',
    provider: 'google',
    isActive: true,
    pricing: { kind: 'per_image', usd_per_unit: 0.02 },
    fields: nanobanana2T2iFields,
    advancedFields: nanobanana2T2iAdvanced,
  },
  {
    id: 'nanobanana-2-ref2i',
    atlasModel: 'google/nano-banana-2/reference-to-image',
    family: 'nanobanana',
    modality: 'reference-to-image',
    output: 'IMAGE',
    displayName: 'Nano Banana 2 (참조→이미지)',
    provider: 'google',
    isActive: true,
    pricing: { kind: 'per_image', usd_per_unit: 0.03 },
    fields: nanobanana2Ref2iFields,
    advancedFields: nanobanana2Ref2iAdvanced,
  },
  {
    id: 'veo3.1-t2v',
    atlasModel: 'google/veo3.1/text-to-video',
    family: 'veo3.1',
    modality: 'text-to-video',
    output: 'VIDEO',
    displayName: 'Veo 3.1 (텍스트→영상)',
    provider: 'google',
    isActive: true,
    pricing: {
      kind: 'per_video_fixed',
      tiers: { '4': 0.4, '6': 0.6, '8': 0.8 },
      options: { allowed_durations_sec: [4, 6, 8], polling_interval_sec: 60 },
    },
    fields: veo31T2vFields,
    advancedFields: veo31T2vAdvanced,
    durationParam: 'duration',
  },
  {
    id: 'seedance-2-i2v',
    atlasModel: 'bytedance/seedance-2.0/image-to-video',
    family: 'seedance',
    modality: 'image-to-video',
    output: 'VIDEO',
    displayName: 'Seedance 2.0 (이미지→영상)',
    provider: 'bytedance',
    isActive: true,
    pricing: {
      kind: 'per_video_fixed',
      tiers: { '5': 0.4, '10': 0.7, '15': 1.0 },
      options: {
        allowed_durations_sec: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        polling_interval_sec: 60,
      },
    },
    fields: seedance2I2vFields,
    advancedFields: seedance2I2vAdvanced,
    durationParam: 'duration',
  },

  // ── GPT-Image (OpenAI, AtlasCloud 아님 — 기존 어댑터 유지) ────────────
  {
    id: 'gpt-image-2.0',
    atlasModel: '',
    family: 'openai',
    modality: 'text-to-image',
    output: 'IMAGE',
    displayName: 'GPT-Image-2.0',
    provider: 'openai',
    isActive: true,
    pricing: { kind: 'per_image', usd_per_unit: 0.04 },
    fields: [{ kind: 'prompt' }],
  },

  // ── 비활성 13종 (best-guess, owner 확정 TODO) ────────────────────────
  {
    id: 'nanobanana-pro-t2i',
    atlasModel: 'google/nano-banana-pro/text-to-image',
    family: 'nanobanana',
    modality: 'text-to-image',
    output: 'IMAGE',
    displayName: 'Nano Banana Pro (텍스트→이미지)',
    provider: 'google',
    isActive: true,
    pricing: { kind: 'per_image', usd_per_unit: 0.05 },
    fields: nanobananaProT2iFields,
    advancedFields: nanobananaProT2iAdvanced,
  },
  {
    // atlasModel은 v4.5 문서 패턴(`bytedance/seedream-v4.5`, 모달리티 접미사 없음)에서 추론. 콘솔에서 다르면 owner 정정.
    id: 'seedream-v4-t2i',
    atlasModel: 'bytedance/seedream-v4',
    family: 'seedream',
    modality: 'text-to-image',
    output: 'IMAGE',
    displayName: 'Seedream v4 (텍스트→이미지)',
    provider: 'bytedance',
    isActive: true,
    pricing: { kind: 'per_image', usd_per_unit: 0.03 },
    fields: seedreamT2iFields,
  },
  {
    id: 'seedream-v4.5-t2i',
    atlasModel: 'bytedance/seedream-v4.5',
    family: 'seedream',
    modality: 'text-to-image',
    output: 'IMAGE',
    displayName: 'Seedream v4.5 (텍스트→이미지)',
    provider: 'bytedance',
    isActive: true,
    pricing: { kind: 'per_image', usd_per_unit: 0.035 },
    fields: seedreamT2iFields,
  },
  {
    id: 'veo3.1-fast-t2v',
    atlasModel: 'google/veo3.1-fast/text-to-video',
    family: 'veo3.1',
    modality: 'text-to-video',
    output: 'VIDEO',
    displayName: 'Veo 3.1 Fast (텍스트→영상)',
    provider: 'google',
    isActive: false,
    pricing: guessVideoPricing({ '4': 0.2, '6': 0.3, '8': 0.4 }, [4, 6, 8]),
    fields: t2vTemplate,
    advancedFields: t2vTemplateAdvanced,
    durationParam: 'duration',
  },
  {
    id: 'veo3.1-i2v',
    atlasModel: 'google/veo3.1/image-to-video',
    family: 'veo3.1',
    modality: 'image-to-video',
    output: 'VIDEO',
    displayName: 'Veo 3.1 (이미지→영상)',
    provider: 'google',
    isActive: false,
    pricing: guessVideoPricing({ '4': 0.4, '6': 0.6, '8': 0.8 }, [4, 6, 8]),
    fields: i2vTemplate,
    advancedFields: i2vTemplateAdvanced,
    durationParam: 'duration',
  },
  {
    id: 'veo3.1-fast-i2v',
    atlasModel: 'google/veo3.1-fast/image-to-video',
    family: 'veo3.1',
    modality: 'image-to-video',
    output: 'VIDEO',
    displayName: 'Veo 3.1 Fast (이미지→영상)',
    provider: 'google',
    isActive: false,
    pricing: guessVideoPricing({ '4': 0.2, '6': 0.3, '8': 0.4 }, [4, 6, 8]),
    fields: i2vTemplate,
    advancedFields: i2vTemplateAdvanced,
    durationParam: 'duration',
  },
  {
    id: 'veo3.1-ref2v',
    atlasModel: 'google/veo3.1/reference-to-video',
    family: 'veo3.1',
    modality: 'reference-to-video',
    output: 'VIDEO',
    displayName: 'Veo 3.1 (참조→영상)',
    provider: 'google',
    isActive: false,
    pricing: guessVideoPricing({ '4': 0.4, '6': 0.6, '8': 0.8 }, [4, 6, 8]),
    fields: ref2vTemplate,
    advancedFields: t2vTemplateAdvanced,
    durationParam: 'duration',
  },
  {
    id: 'seedance-2-t2v',
    atlasModel: 'bytedance/seedance-2.0/text-to-video',
    family: 'seedance',
    modality: 'text-to-video',
    output: 'VIDEO',
    displayName: 'Seedance 2.0 (텍스트→영상)',
    provider: 'bytedance',
    isActive: false,
    pricing: guessVideoPricing({ '5': 0.4, '10': 0.7, '15': 1.0 }, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
    fields: t2vTemplate,
    advancedFields: t2vTemplateAdvanced,
    durationParam: 'duration',
  },
  {
    id: 'seedance-2-ref2v',
    atlasModel: 'bytedance/seedance-2.0/reference-to-video',
    family: 'seedance',
    modality: 'reference-to-video',
    output: 'VIDEO',
    displayName: 'Seedance 2.0 (참조→영상)',
    provider: 'bytedance',
    isActive: false,
    pricing: guessVideoPricing({ '5': 0.4, '10': 0.7, '15': 1.0 }, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
    fields: ref2vTemplate,
    advancedFields: i2vTemplateAdvanced,
    durationParam: 'duration',
  },
  {
    id: 'kling-v3-std-t2v',
    atlasModel: 'kuaishou/kling-v3.0-std/text-to-video',
    family: 'kling',
    modality: 'text-to-video',
    output: 'VIDEO',
    displayName: 'Kling v3 Std (텍스트→영상)',
    provider: 'kuaishou',
    isActive: false,
    pricing: { kind: 'per_second', usd_per_unit: 0.07, options: { allowed_durations_sec: [5, 10], polling_interval_sec: 60 } },
    fields: t2vTemplate,
    advancedFields: t2vTemplateAdvanced,
    durationParam: 'duration',
  },
  {
    id: 'kling-v3-pro-t2v',
    atlasModel: 'kuaishou/kling-v3.0-pro/text-to-video',
    family: 'kling',
    modality: 'text-to-video',
    output: 'VIDEO',
    displayName: 'Kling v3 Pro (텍스트→영상)',
    provider: 'kuaishou',
    isActive: false,
    pricing: { kind: 'per_second', usd_per_unit: 0.12, options: { allowed_durations_sec: [5, 10], polling_interval_sec: 60 } },
    fields: t2vTemplate,
    advancedFields: t2vTemplateAdvanced,
    durationParam: 'duration',
  },
  {
    id: 'kling-v3-std-i2v',
    atlasModel: 'kuaishou/kling-v3.0-std/image-to-video',
    family: 'kling',
    modality: 'image-to-video',
    output: 'VIDEO',
    displayName: 'Kling v3 Std (이미지→영상)',
    provider: 'kuaishou',
    isActive: false,
    pricing: { kind: 'per_second', usd_per_unit: 0.07, options: { allowed_durations_sec: [5, 10], polling_interval_sec: 60 } },
    fields: i2vTemplate,
    advancedFields: i2vTemplateAdvanced,
    durationParam: 'duration',
  },
  {
    id: 'kling-v3-pro-i2v',
    atlasModel: 'kuaishou/kling-v3.0-pro/image-to-video',
    family: 'kling',
    modality: 'image-to-video',
    output: 'VIDEO',
    displayName: 'Kling v3 Pro (이미지→영상)',
    provider: 'kuaishou',
    isActive: false,
    pricing: { kind: 'per_second', usd_per_unit: 0.12, options: { allowed_durations_sec: [5, 10], polling_interval_sec: 60 } },
    fields: i2vTemplate,
    advancedFields: i2vTemplateAdvanced,
    durationParam: 'duration',
  },

  // ── Mock 모델 (비-production 테스트 전용, 카탈로그 기본 비활성) ─────────
  {
    id: 'mock-image',
    atlasModel: '',
    family: 'mock',
    modality: 'text-to-image',
    output: 'IMAGE',
    displayName: 'Mock Image (테스트)',
    provider: 'mock',
    isActive: false,
    pricing: { kind: 'per_image', usd_per_unit: 0.04 },
    fields: [{ kind: 'prompt' }],
  },
  {
    id: 'mock-video',
    atlasModel: '',
    family: 'mock',
    modality: 'text-to-video',
    output: 'VIDEO',
    displayName: 'Mock Video (테스트)',
    provider: 'mock',
    isActive: false,
    pricing: {
      kind: 'per_video_fixed',
      tiers: { '5': 0.45, '10': 0.82 },
      options: { allowed_durations_sec: [5, 10], polling_interval_sec: 60 },
    },
    fields: [
      { kind: 'prompt' },
      { kind: 'int', param: 'duration', label: '길이(초)', options: [5, 10], default: 5 },
    ],
    durationParam: 'duration',
  },
]

export function getModelConfig(id: string): ModelConfig | undefined {
  return MODEL_CONFIGS.find((c) => c.id === id)
}

export function listConfigs(): ModelConfig[] {
  return MODEL_CONFIGS
}

export function listActiveConfigs(): ModelConfig[] {
  return MODEL_CONFIGS.filter((c) => c.isActive)
}
