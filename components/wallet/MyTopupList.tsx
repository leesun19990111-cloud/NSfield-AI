import { formatKrw } from '@/components/common/MoneyText'

type Topup = {
  id: string; amount_krw: number; status: string
  created_at: Date; reject_reason: string | null
}

const statusLabel: Record<string, string> = {
  PENDING: '대기 중 ⏳', APPROVED: '승인됨 ✅', REJECTED: '거절됨 ❌',
}

export function MyTopupList({ items }: { items: Topup[] }) {
  if (items.length === 0) return <p className="text-[var(--text-dim)] text-sm">충전 요청 내역이 없습니다.</p>
  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t.id} className="flex items-center justify-between text-sm border-b border-[var(--border)] py-2">
          <span className="font-mono text-xs">{new Date(t.created_at).toLocaleString('ko-KR')}</span>
          <span className="font-mono">{formatKrw(t.amount_krw)}</span>
          <span>
            {statusLabel[t.status] ?? t.status}
            {t.status === 'REJECTED' && t.reject_reason && (
              <span className="text-[var(--text-dim)] ml-2">({t.reject_reason})</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
