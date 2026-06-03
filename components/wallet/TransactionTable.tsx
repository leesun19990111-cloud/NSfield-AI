import { formatKrw } from '@/components/common/MoneyText'

type Tx = {
  id: string; type: string; amount_krw: number; balance_after: number
  memo: string | null; created_at: Date
}

const typeLabel: Record<string, string> = {
  TOPUP: '충전', CHARGE: '차감', REFUND: '환불', ADJUSTMENT: '조정',
}

export function TransactionTable({ items }: { items: Tx[] }) {
  if (items.length === 0) {
    return <p className="text-[var(--text-dim)] text-sm py-8 text-center">거래 내역이 없습니다.</p>
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-[var(--text-muted)] text-left">
        <tr className="border-b border-[var(--border)]">
          <th className="py-2">일시</th><th>유형</th><th className="text-right">금액</th>
          <th className="text-right">잔액</th><th>비고</th>
        </tr>
      </thead>
      <tbody>
        {items.map((t) => (
          <tr key={t.id} className="border-b border-[var(--border)]">
            <td className="py-2 font-mono text-xs">{new Date(t.created_at).toLocaleString('ko-KR')}</td>
            <td>{typeLabel[t.type] ?? t.type}</td>
            <td className={`text-right font-mono ${t.amount_krw < 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
              {t.amount_krw > 0 ? '+' : ''}{formatKrw(t.amount_krw)}
            </td>
            <td className="text-right font-mono">{formatKrw(t.balance_after)}</td>
            <td className="text-[var(--text-muted)]">{t.memo ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
