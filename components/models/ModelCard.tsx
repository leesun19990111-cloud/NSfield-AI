import Link from 'next/link'
import { MoneyText } from '@/components/common/MoneyText'

export function ModelCard({
  model,
  fxRate,
  lowestUsd,
}: {
  model: { id: string; kind: string; display_name: string; provider: string; is_active: boolean }
  fxRate: number
  lowestUsd: number
}) {
  const krw = Math.round(lowestUsd * fxRate)
  return (
    <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] p-4 flex flex-col gap-2">
      <div className="text-xs text-[var(--text-dim)] uppercase">
        {model.provider} · {model.kind === 'IMAGE' ? '이미지' : '영상'}
      </div>
      <div className="font-semibold">{model.display_name}</div>
      <div className="text-sm">
        {model.kind === 'IMAGE' ? '1장' : '최저'}{' '}
        <MoneyText usd={lowestUsd} krw={krw} primary="usd" />~
      </div>
      <Link
        href={`/generate/${model.id}`}
        className="mt-2 text-center px-3 py-1.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm"
      >
        생성하기
      </Link>
    </div>
  )
}
