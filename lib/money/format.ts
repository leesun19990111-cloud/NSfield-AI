export function usdToKrw(usd: number, fxRate: number): number {
  return Math.round(usd * fxRate)
}

export function roundCeilUsd(usd: number, decimals: number): number {
  const f = 10 ** decimals
  // toFixed(6) absorbs binary FP error (e.g. 0.04*1.1 = 0.044000000000000004)
  // so genuinely-exact values like 0.044 do not ceil up to 0.0441.
  return Math.ceil(Number((usd * f).toFixed(6))) / f
}
