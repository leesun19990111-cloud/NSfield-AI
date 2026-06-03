import Link from 'next/link'
import { listAdminActions } from '@/lib/actions/admin-audit'
import { AuditTable } from '@/components/admin/AuditTable'

const actionOptions = [
  'approve_topup',
  'reject_topup',
  'adjust_balance',
  'update_model',
  'toggle_model',
  'force_refund',
  'fx_refresh',
]

const actionLabel: Record<string, string> = {
  approve_topup: '충전 승인',
  reject_topup: '충전 거절',
  adjust_balance: '잔액 조정',
  update_model: '모델 수정',
  toggle_model: '모델 토글',
  force_refund: '강제 환불',
  fx_refresh: '환율 갱신',
}

function buildQuery(base: Record<string, string | undefined>, extra: Record<string, string>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...base, ...extra })) {
    if (v) sp.set(k, v)
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; cursor?: string }>
}) {
  const { action, cursor } = await searchParams
  const { items, nextCursor } = await listAdminActions({ action, cursor })

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">감사 로그</h1>

      <form method="get" className="flex flex-wrap gap-2 items-end">
        <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
          액션
          <select
            name="action"
            defaultValue={action ?? ''}
            className="px-3 py-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-sm"
          >
            <option value="">전체</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>{actionLabel[a]}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="px-3 py-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm"
        >
          필터
        </button>
        <Link
          href="/admin/audit"
          className="px-3 py-2 rounded-md border border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          초기화
        </Link>
      </form>

      <AuditTable items={items} />

      {nextCursor && (
        <div className="flex justify-center">
          <Link
            href={`/admin/audit${buildQuery({ action }, { cursor: nextCursor })}`}
            className="px-4 py-2 rounded-md border border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            더 보기
          </Link>
        </div>
      )}
    </div>
  )
}
