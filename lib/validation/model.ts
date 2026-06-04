import { z } from 'zod'

const optionsSchema = z.object({
  allowed_durations_sec: z.array(z.number().int().positive()),
  polling_interval_sec: z.number().int().positive(),
})

export const pricingJsonSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('per_image'),
    usd_per_unit: z.number().nonnegative(),
    options: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    kind: z.literal('per_token'),
    usd_per_unit: z.number().nonnegative(),
    options: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    kind: z.literal('per_image_tiered'),
    resolution_usd: z.record(z.string(), z.number().nonnegative()),
    surcharges: z.record(z.string(), z.number().nonnegative()).optional(),
    options: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    kind: z.literal('per_second'),
    usd_per_unit: z.number().nonnegative(),
    options: optionsSchema,
  }),
  z.object({
    kind: z.literal('per_video_fixed'),
    tiers: z.record(z.string(), z.number().nonnegative()),
    options: optionsSchema,
  }),
  z.object({
    kind: z.literal('per_video_token'),
    usd_per_1k_tokens: z.number().nonnegative(),
    fps: z.number().positive(),
    options: optionsSchema,
  }),
])

export const updateModelSchema = z.object({
  display_name: z.string().trim().min(1).max(100),
  is_active: z.boolean(),
  margin_pct: z.coerce.number().min(0).max(1000),
  pricing_json: pricingJsonSchema,
})

export type UpdateModelInput = z.infer<typeof updateModelSchema>
