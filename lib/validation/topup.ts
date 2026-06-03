import { z } from 'zod'

export const topupRequestSchema = z.object({
  amount_krw: z.coerce.number().int().min(1000).max(1000000),
  depositor_name: z.string().trim().min(1).max(50),
  transferred_at: z.string().min(1),
  note: z.string().max(200).optional().or(z.literal('')),
})

export type TopupRequestInput = z.infer<typeof topupRequestSchema>
