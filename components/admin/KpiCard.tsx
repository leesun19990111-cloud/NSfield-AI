import type { ReactNode } from 'react'
export function KpiCard({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] p-4">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="text-2xl font-bold font-mono mt-1">{value}</div>
      {sub && <div className="text-xs text-[var(--text-dim)] mt-1">{sub}</div>}
    </div>
  )
}
