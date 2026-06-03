export type Family = 'nanobanana' | 'seedream' | 'veo3.1' | 'seedance' | 'kling' | 'openai'

export type Modality =
  | 'text-to-image'
  | 'reference-to-image'
  | 'text-to-video'
  | 'image-to-video'
  | 'reference-to-video'

export type FieldType =
  | { kind: 'prompt'; required?: boolean }
  | { kind: 'negative_prompt' }
  | {
      kind: 'select'
      param: string
      label: string
      options: { value: string; label: string }[]
      default?: string
    }
  | { kind: 'int'; param: string; label: string; options?: number[]; min?: number; max?: number; default?: number }
  | { kind: 'toggle'; param: string; label: string; default?: boolean }
  | { kind: 'image'; param: string; label: string; required?: boolean }
  | { kind: 'images'; param: string; label: string; max: number }
  | { kind: 'video_clip'; param: string; label: string; required?: boolean }

export type ModelConfig = {
  id: string
  atlasModel: string
  family: Family
  modality: Modality
  output: 'IMAGE' | 'VIDEO'
  displayName: string
  provider: string
  isActive: boolean
  pricing: Record<string, unknown>
  marginPct?: number
  fields: FieldType[]
  advancedFields?: FieldType[]
  customForm?: string
  durationParam?: string
}
