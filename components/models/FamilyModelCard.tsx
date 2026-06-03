import Link from 'next/link'
import { MoneyText } from '@/components/common/MoneyText'
import { modalityLabel } from '@/lib/models/labels'

export function FamilyModelCard({
  model,
  fxRate,
  lowestUsd,
}: {
  model: {
    id: string
    kind: string
    modality: string
    display_name: string
    is_active: boolean
  }
  fxRate: number
  lowestUsd: number
}) {
  const krw = Math.round(lowestUsd * fxRate)
  return (
    <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-[var(--text-dim)]">{modalityLabel(model.modality)}</div>
        {!model.is_active && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-surface-2)] text-[var(--text-dim)]">
            준비 중
          </span>
        )}
      </div>
      <div className="font-semibold">{model.display_name}</div>
      <div className="text-sm">
        {model.kind === 'IMAGE' ? '1장' : '최저'}{' '}
        <MoneyText usd={lowestUsd} krw={krw} primary="usd" />~
      </div>
      {model.is_active ? (
        <Link
          href={`/generate/${model.id}`}
          className="mt-2 text-center px-3 py-1.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm"
        >
          생성하기
        </Link>
      ) : (
        <span className="mt-2 text-center px-3 py-1.5 rounded-md bg-[var(--bg-surface-2)] text-[var(--text-dim)] text-sm cursor-not-allowed">
          준비 중
        </span>
      )}
    </div>
  )
}
