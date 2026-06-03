import Link from 'next/link'
import { formatKrw } from '@/components/common/MoneyText'

type Row = {
  id: string
  email: string
  display_name: string | null
  topup_code: string
  role: string
  created_at: Date
  wallet: { balance_krw: number } | null
  _count: { generations: number }
}

export function UserTable({ items }: { items: Row[] }) {
  if (items.length === 0) {
    return <p className="text-[var(--text-dim)] text-sm py-8 text-center">사용자가 없습니다.</p>
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-[var(--text-muted)] text-left">
        <tr className="border-b border-[var(--border)]">
          <th className="py-2">이름</th>
          <th>이메일</th>
          <th className="text-right">잔액</th>
          <th>가입일</th>
          <th className="text-right">생성수</th>
          <th>코드</th>
        </tr>
      </thead>
      <tbody>
        {items.map((u) => (
          <tr key={u.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-surface)]">
            <td className="py-2">
              <Link href={`/admin/users/${u.id}`} className="text-[var(--accent)] hover:underline">
                {u.display_name ?? '(이름 없음)'}
                {u.role === 'ADMIN' && (
                  <span className="ml-1 text-xs text-[var(--warning)]">ADMIN</span>
                )}
              </Link>
            </td>
            <td className="text-[var(--text-muted)]">{u.email}</td>
            <td className="text-right font-mono">
              {u.wallet ? formatKrw(u.wallet.balance_krw) : '—'}
            </td>
            <td className="font-mono text-xs">{new Date(u.created_at).toLocaleDateString('ko-KR')}</td>
            <td className="text-right font-mono">{u._count.generations}</td>
            <td className="font-mono text-xs">{u.topup_code}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
