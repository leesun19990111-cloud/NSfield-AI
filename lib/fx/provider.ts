import { fetchWithTimeout } from '@/lib/http/fetch'

// exchangerate.host: GET /latest?base=USD&symbols=KRW
export async function fetchUsdKrw(): Promise<number> {
  const base = process.env.EXCHANGE_RATE_API_URL ?? 'https://api.exchangerate.host'
  const res = await fetchWithTimeout(`${base}/latest?base=USD&symbols=KRW`)
  if (!res.ok) throw new Error('FX_FETCH_FAILED')
  const json = (await res.json()) as { rates?: { KRW?: number } }
  const rate = json.rates?.KRW
  if (!rate || rate <= 0) throw new Error('FX_INVALID')
  return rate
}
