import Link from 'next/link'
import { listAllModels } from '@/lib/actions/admin-models'

const kindLabel: Record<string, string> = { IMAGE: '이미지', VIDEO: '영상' }

function pricingPattern(pricing: unknown): string {
  const p = pricing as { kind?: string } | null
  return p?.kind ?? '—'
}

export default async function AdminModelsPage() {
  const items = await listAllModels()
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">모델</h1>
      {items.length === 0 ? (
        <p className="text-[var(--text-dim)] text-sm py-8 text-center">모델이 없습니다.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-[var(--text-muted)] text-left">
            <tr className="border-b border-[var(--border)]">
              <th className="py-2">모델</th>
              <th>종류</th>
              <th>provider</th>
              <th className="text-right">마진</th>
              <th>활성</th>
              <th>가격패턴</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-surface)]">
                <td className="py-2">
                  <Link href={`/admin/models/${m.id}`} className="text-[var(--accent)] hover:underline">
                    {m.display_name}
                  </Link>
                  <div className="text-xs text-[var(--text-dim)] font-mono">{m.id}</div>
                </td>
                <td>{kindLabel[m.kind] ?? m.kind}</td>
                <td className="text-[var(--text-muted)]">{m.provider}</td>
                <td className="text-right font-mono">{Number(m.margin_pct)}%</td>
                <td>
                  {m.is_active ? (
                    <span className="text-xs text-[var(--success,#22c55e)]">활성</span>
                  ) : (
                    <span className="text-xs text-[var(--text-dim)]">비활성</span>
                  )}
                </td>
                <td className="font-mono text-xs">{pricingPattern(m.pricing_json)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
