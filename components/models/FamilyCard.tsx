import Link from 'next/link'
import { MoneyText } from '@/components/common/MoneyText'
import { familyLabel } from '@/lib/models/labels'

export function FamilyCard({
  family,
  active,
  minUsd,
  fxRate,
}: {
  family: string
  active: number
  minUsd: number | null
  fxRate: number
}) {
  const ready = active > 0
  return (
    <Link
      href={`/models/${family}`}
      className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] p-5 flex flex-col gap-3 hover:border-[var(--accent)] transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="font-semibold text-lg">{familyLabel(family)}</div>
        {!ready && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-surface-2)] text-[var(--text-dim)]">
            준비 중
          </span>
        )}
      </div>
      <div className="text-sm text-[var(--text-muted)]">{active}개 모델</div>
      {ready && minUsd !== null && (
        <div className="text-sm">
          최저{' '}
          <MoneyText usd={minUsd} krw={Math.round(minUsd * fxRate)} primary="usd" />~
        </div>
      )}
    </Link>
  )
}
