import type { AdminAction } from '@/lib/generated/prisma'

const actionLabel: Record<string, string> = {
  approve_topup: '충전 승인',
  reject_topup: '충전 거절',
  adjust_balance: '잔액 조정',
  update_model: '모델 수정',
  toggle_model: '모델 토글',
  force_refund: '강제 환불',
  fx_refresh: '환율 갱신',
}

function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return '—'
  return JSON.stringify(value, null, 2)
}

export function AuditTable({ items }: { items: AdminAction[] }) {
  if (items.length === 0) {
    return <p className="text-[var(--text-dim)] text-sm py-12 text-center">감사 로그가 없습니다.</p>
  }

  return (
    <table className="w-full text-sm">
      <thead className="text-[var(--text-muted)] text-left">
        <tr className="border-b border-[var(--border)]">
          <th className="py-2">시각</th>
          <th>관리자</th>
          <th>액션</th>
          <th>대상</th>
          <th>사유</th>
        </tr>
      </thead>
      <tbody>
        {items.map((a) => (
          <tr key={a.id} className="border-b border-[var(--border)] align-top">
            <td className="py-2 font-mono text-xs whitespace-nowrap">
              {new Date(a.created_at).toLocaleString('ko-KR')}
            </td>
            <td className="font-mono text-xs text-[var(--text-muted)]">{a.admin_id}</td>
            <td>{actionLabel[a.action] ?? a.action}</td>
            <td className="font-mono text-xs text-[var(--text-muted)]">
              {a.target_type ? (
                <>
                  {a.target_type}
                  {a.target_id ? <span className="text-[var(--text-dim)]"> / {a.target_id}</span> : null}
                </>
              ) : (
                '—'
              )}
            </td>
            <td className="text-[var(--text-muted)]">
              <div>{a.reason ?? '—'}</div>
              {(a.before_json != null || a.after_json != null) && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-[var(--accent)]">변경 내용</summary>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-1 text-xs text-[var(--text-dim)]">before</div>
                      <pre className="overflow-x-auto rounded-md bg-[var(--bg-surface)] border border-[var(--border)] p-2 text-xs">
                        {prettyJson(a.before_json)}
                      </pre>
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-[var(--text-dim)]">after</div>
                      <pre className="overflow-x-auto rounded-md bg-[var(--bg-surface)] border border-[var(--border)] p-2 text-xs">
                        {prettyJson(a.after_json)}
                      </pre>
                    </div>
                  </div>
                </details>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
