// 견적 차감(chargedKrw) 후 실제 비용(actualKrw)이 확정됐을 때
// 추가로 차감해야 할 KRW. 실제가 견적보다 작으면 0(흡수).
export function computeSettlementKrw(chargedKrw: number, actualKrw: number): number {
  const diff = actualKrw - chargedKrw
  return diff > 0 ? diff : 0
}
