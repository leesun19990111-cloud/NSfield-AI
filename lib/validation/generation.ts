import { z } from 'zod'
import { ALLOWED_DURATIONS_SEC } from '@/lib/constants'

export const imageGenerateSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().trim().min(1).max(2000),
  count: z.coerce.number().int().min(1).max(4).default(1),
})

export type ImageGenerateInput = z.infer<typeof imageGenerateSchema>

export const videoGenerateSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().trim().min(1).max(2000),
  duration_sec: z.coerce.number().int().refine((d) => (ALLOWED_DURATIONS_SEC as readonly number[]).includes(d), {
    message: '지원하지 않는 길이입니다.',
  }),
})

export type VideoGenerateInput = z.infer<typeof videoGenerateSchema>
