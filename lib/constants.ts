export const ALLOWED_DURATIONS_SEC = [3, 5, 10, 15, 30, 60] as const
export type DurationSec = (typeof ALLOWED_DURATIONS_SEC)[number]

export const FX_PAIR = 'USDKRW'
export const FX_MAX_AGE_MS = 60 * 60 * 1000 // 1시간
