export type ModelKind = 'IMAGE' | 'VIDEO'

export type GenerationParams = {
  prompt: string
  count?: number
  duration_sec?: number
  generate_audio?: boolean
  [key: string]: unknown
}

export type PricingJson =
  | { kind: 'per_image'; usd_per_unit: number; options?: Record<string, unknown> }
  | { kind: 'per_token'; usd_per_unit: number; options?: Record<string, unknown> }
  | {
      kind: 'per_second'
      usd_per_unit: number
      // 오디오 생성(generate_audio=true) 시 적용할 초당 단가. 미선언이면 오디오 여부와 무관하게 usd_per_unit 사용.
      usd_per_unit_audio?: number
      options: { allowed_durations_sec: number[]; polling_interval_sec: number }
    }
  | { kind: 'per_video_fixed'; tiers: Record<string, number>; options: { allowed_durations_sec: number[]; polling_interval_sec: number } }

export type ModelMeta = {
  id: string
  kind: ModelKind
  display_name: string
  provider: string
  is_active: boolean
  margin_pct: number
  pricing_json: PricingJson
}
