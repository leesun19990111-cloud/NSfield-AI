import { z } from 'zod'

export const imageGenerateSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().trim().min(1).max(2000),
  count: z.coerce.number().int().min(1).max(4).default(1),
})

export type ImageGenerateInput = z.infer<typeof imageGenerateSchema>
