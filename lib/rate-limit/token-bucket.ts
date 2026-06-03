import { prisma } from '@/lib/db/prisma'

export async function consumeRateLimit(userId: string, action: string, limit: number, windowSec: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ rate_limit_consume: boolean }[]>`
    SELECT rate_limit_consume(${userId}::text, ${action}::text, ${limit}::int, ${windowSec}::int)`
  return rows[0]?.rate_limit_consume ?? false
}

// 분/시간 이중 한도 체크. 둘 다 통과해야 허용.
export async function checkDualLimit(
  userId: string, baseAction: string,
  perMin: number, perHour: number,
): Promise<boolean> {
  const okMin = await consumeRateLimit(userId, `${baseAction}:min`, perMin, 60)
  if (!okMin) return false
  const okHour = await consumeRateLimit(userId, `${baseAction}:hour`, perHour, 3600)
  return okHour
}

export const RATE_LIMITS = {
  image_gen: { perMin: 10, perHour: 100 },
  video_gen: { perMin: 3, perHour: 20 },
  topup: { perHour: 5 },
} as const
