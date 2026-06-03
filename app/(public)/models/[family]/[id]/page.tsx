import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getModelDetail } from '@/lib/actions/models'
import { lowestBilledUsd } from '@/lib/models/catalog-pricing'
import { MoneyText } from '@/components/common/MoneyText'

export const dynamic = 'force-dynamic'

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<{ family: string; id: string }>
}) {
  const { family, id } = await params
  const data = await getModelDetail(id)
  if (!data) notFound()
  const { model, fxRate } = data
  const lowUsd = lowestBilledUsd(model)
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
      <Link href={`/models/${family}`} className="text-sm text-[var(--text-muted)]">
        ← 모델
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{model.display_name}</h1>
          <div className="text-sm text-[var(--text-dim)]">
            {model.provider} · {model.kind === 'IMAGE' ? '이미지 모델' : '영상 모델'}
          </div>
        </div>
        <Link
          href={`/generate/${model.id}`}
          className="px-4 py-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm"
        >
          생성하기
        </Link>
      </div>
      <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] p-5 text-sm">
        <div className="text-[var(--text-muted)] mb-2">
          가격 (마진 포함 · 1USD={fxRate.toLocaleString('ko-KR')}₩)
        </div>
        <div>
          {model.kind === 'IMAGE' ? '이미지 1장' : '최저'}{' '}
          <MoneyText usd={lowUsd} krw={Math.round(lowUsd * fxRate)} primary="usd" />
        </div>
      </div>
    </div>
  )
}
