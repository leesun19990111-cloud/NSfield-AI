import { z } from 'zod'

export const topupRequestSchema = z.object({
  amount_krw: z.coerce.number().int().min(1000).max(1000000),
  depositor_name: z.string().trim().min(1).max(50),
  transferred_at: z.string().min(1).refine((s) => {
    const t = new Date(s).getTime()
    return Number.isFinite(t) && t <= Date.now()
  }, { message: '유효한 입금 일시를 입력하세요 (미래 불가).' }),
  note: z.string().max(200).optional().or(z.literal('')),
})

export type TopupRequestInput = z.infer<typeof topupRequestSchema>
