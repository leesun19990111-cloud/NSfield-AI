export type ModelKind = 'IMAGE' | 'VIDEO'

export type GenerationParams = {
  prompt: string
  count?: number
  duration_sec?: number
  [key: string]: unknown
}

export type PricingJson =
  | { kind: 'per_image'; usd_per_unit: number; options?: Record<string, unknown> }
  | { kind: 'per_token'; usd_per_unit: number; options?: Record<string, unknown> }
  | { kind: 'per_second'; usd_per_unit: number; options: { allowed_durations_sec: number[]; polling_interval_sec: number } }
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
