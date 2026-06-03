import { listFxRates } from '@/lib/actions/admin-fx'
import { FxRefreshButton } from '@/components/admin/FxRefreshButton'

export default async function AdminFxRatesPage() {
  const rates = await listFxRates()
  const latest = rates[0]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">환율 (USD/KRW)</h1>
        <FxRefreshButton />
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-6">
        {latest ? (
          <>
            <div className="text-2xl font-bold">
              1 USD = {Number(latest.rate).toLocaleString('ko-KR')}₩
            </div>
            <div className="mt-1 text-sm text-[var(--text-muted)]">
              {new Date(latest.fetched_at).toLocaleString('ko-KR')} · {latest.source}
            </div>
          </>
        ) : (
          <p className="text-[var(--text-dim)] text-sm">환율 이력이 없습니다.</p>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-muted)]">갱신 이력</h2>
        {rates.length === 0 ? (
          <p className="text-[var(--text-dim)] text-sm py-8 text-center">이력이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[var(--text-muted)] text-left">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2">시각</th>
                <th className="text-right">환율</th>
                <th>출처</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-surface)]">
                  <td className="py-2 font-mono text-xs">
                    {new Date(r.fetched_at).toLocaleString('ko-KR')}
                  </td>
                  <td className="text-right font-mono">
                    {Number(r.rate).toLocaleString('ko-KR')}₩
                  </td>
                  <td className="text-[var(--text-muted)]">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
