import Link from 'next/link'
import { listAllGenerations } from '@/lib/actions/admin-generations'
import { listAllModels } from '@/lib/actions/admin-models'
import { formatKrw } from '@/components/common/MoneyText'

const genStatusLabel: Record<string, string> = {
  PENDING: '대기', RUNNING: '진행', SUCCEEDED: '완료', FAILED: '실패', CANCELED: '취소',
}
const statusOptions = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED']
const kindOptions = ['IMAGE', 'VIDEO']

function buildQuery(base: Record<string, string | undefined>, extra: Record<string, string>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...base, ...extra })) {
    if (v) sp.set(k, v)
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export default async function AdminGenerationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string; model?: string; q?: string; cursor?: string }>
}) {
  const { status, kind, model, q, cursor } = await searchParams
  const [{ items, nextCursor }, models] = await Promise.all([
    listAllGenerations({ status, kind, modelId: model, userQuery: q, cursor }),
    listAllModels(),
  ])

  const baseFilters = { status, kind, model, q }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">생성 모니터</h1>

      <form method="get" className="flex flex-wrap gap-2 items-end">
        <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
          상태
          <select
            name="status"
            defaultValue={status ?? ''}
            className="px-3 py-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-sm"
          >
            <option value="">전체</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{genStatusLabel[s]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
          종류
          <select
            name="kind"
            defaultValue={kind ?? ''}
            className="px-3 py-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-sm"
          >
            <option value="">전체</option>
            {kindOptions.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
          모델
          <select
            name="model"
            defaultValue={model ?? ''}
            className="px-3 py-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-sm"
          >
            <option value="">전체</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)] flex-1 min-w-48">
          사용자
          <input
            type="text"
            name="q"
            defaultValue={q ?? ''}
            placeholder="이메일 / 이름 검색"
            className="px-3 py-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-sm"
          />
        </label>
        <button
          type="submit"
          className="px-3 py-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm"
        >
          필터
        </button>
        <Link
          href="/admin/generations"
          className="px-3 py-2 rounded-md border border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          초기화
        </Link>
      </form>

      {items.length === 0 ? (
        <p className="text-[var(--text-dim)] text-sm py-12 text-center">생성 내역이 없습니다.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-[var(--text-muted)] text-left">
            <tr className="border-b border-[var(--border)]">
              <th className="py-2">일시</th>
              <th>사용자</th>
              <th>모델</th>
              <th>종류</th>
              <th>상태</th>
              <th className="text-right">차감</th>
              <th className="text-right">원가</th>
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-surface)]">
                <td className="py-2 font-mono text-xs">
                  <Link href={`/admin/generations/${g.id}`} className="hover:text-[var(--accent)]">
                    {new Date(g.created_at).toLocaleString('ko-KR')}
                  </Link>
                </td>
                <td className="text-[var(--text-muted)]">
                  {g.user.display_name ?? g.user.email}
                </td>
                <td className="font-mono text-xs">{g.model_id}</td>
                <td>{g.kind}</td>
                <td>{genStatusLabel[g.status] ?? g.status}</td>
                <td className="text-right font-mono">
                  {g.charged_krw != null ? formatKrw(g.charged_krw) : '—'}
                </td>
                <td className="text-right font-mono text-[var(--text-dim)]">
                  {g.cost_usd_raw != null ? `$${Number(g.cost_usd_raw).toFixed(4)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {nextCursor && (
        <div className="flex justify-center">
          <Link
            href={`/admin/generations${buildQuery(baseFilters, { cursor: nextCursor })}`}
            className="px-4 py-2 rounded-md border border-[var(--border)] text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            더 보기
          </Link>
        </div>
      )}
    </div>
  )
}
