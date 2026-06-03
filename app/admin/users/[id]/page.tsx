import { notFound } from 'next/navigation'
import { getUserDetail } from '@/lib/actions/admin-users'
import { BalanceAdjustDialog } from '@/components/admin/BalanceAdjustDialog'
import { TransactionTable } from '@/components/wallet/TransactionTable'
import { formatKrw } from '@/components/common/MoneyText'

const topupStatusLabel: Record<string, string> = {
  PENDING: '대기', APPROVED: '승인', REJECTED: '거절',
}
const genStatusLabel: Record<string, string> = {
  PENDING: '대기', RUNNING: '진행', SUCCEEDED: '완료', FAILED: '실패', CANCELED: '취소',
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = await getUserDetail(id)
  if (!detail) notFound()
  const { user, transactions, generations, topups } = detail

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">
            {user.display_name ?? '(이름 없음)'}
            {user.role === 'ADMIN' && (
              <span className="ml-2 text-xs text-[var(--warning)]">ADMIN</span>
            )}
          </h1>
          <div className="text-sm text-[var(--text-muted)]">{user.email}</div>
          <div className="text-sm">
            잔액{' '}
            <span className="font-mono">
              {user.wallet ? formatKrw(user.wallet.balance_krw) : '지갑 없음'}
            </span>
            <span className="text-[var(--text-dim)] ml-3">식별코드 {user.topup_code}</span>
          </div>
        </div>
        {user.wallet && (
          <div className="w-full max-w-xs">
            <BalanceAdjustDialog userId={user.id} />
          </div>
        )}
      </div>

      <section>
        <h2 className="text-sm font-semibold mb-3 text-[var(--text-muted)]">
          거래 내역 ({transactions.length})
        </h2>
        <TransactionTable items={transactions} />
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3 text-[var(--text-muted)]">
          생성 내역 ({generations.length})
        </h2>
        {generations.length === 0 ? (
          <p className="text-[var(--text-dim)] text-sm py-8 text-center">생성 내역이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[var(--text-muted)] text-left">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2">일시</th>
                <th>종류</th>
                <th>상태</th>
                <th>프롬프트</th>
                <th className="text-right">청구액</th>
              </tr>
            </thead>
            <tbody>
              {generations.map((g) => (
                <tr key={g.id} className="border-b border-[var(--border)]">
                  <td className="py-2 font-mono text-xs">
                    {new Date(g.created_at).toLocaleString('ko-KR')}
                  </td>
                  <td>{g.kind}</td>
                  <td>{genStatusLabel[g.status] ?? g.status}</td>
                  <td className="max-w-xs truncate text-[var(--text-muted)]">{g.prompt}</td>
                  <td className="text-right font-mono">
                    {g.charged_krw != null ? formatKrw(g.charged_krw) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3 text-[var(--text-muted)]">
          충전 요청 ({topups.length})
        </h2>
        {topups.length === 0 ? (
          <p className="text-[var(--text-dim)] text-sm py-8 text-center">충전 요청이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[var(--text-muted)] text-left">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2">일시</th>
                <th className="text-right">금액</th>
                <th>입금자</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {topups.map((t) => (
                <tr key={t.id} className="border-b border-[var(--border)]">
                  <td className="py-2 font-mono text-xs">
                    {new Date(t.created_at).toLocaleString('ko-KR')}
                  </td>
                  <td className="text-right font-mono">{formatKrw(t.amount_krw)}</td>
                  <td className="text-[var(--text-muted)]">{t.depositor_name}</td>
                  <td>{topupStatusLabel[t.status] ?? t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
