import { notFound } from 'next/navigation'
import Link from 'next/link'
import { listModelsByFamily } from '@/lib/actions/models'
import { lowestBilledUsd } from '@/lib/models/catalog-pricing'
import { familyLabel, modalityLabel } from '@/lib/models/labels'
import { FamilyModelCard } from '@/components/models/FamilyModelCard'

export const dynamic = 'force-dynamic'

export default async function FamilyPage({
  params,
}: {
  params: Promise<{ family: string }>
}) {
  const { family } = await params
  const { models, fxRate } = await listModelsByFamily(family)
  if (models.length === 0) notFound()

  const byModality = new Map<string, typeof models>()
  for (const m of models) {
    const list = byModality.get(m.modality) ?? []
    list.push(m)
    byModality.set(m.modality, list)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/models" className="text-sm text-[var(--text-muted)]">
            ← 모델
          </Link>
          <h1 className="text-xl font-bold mt-1">{familyLabel(family)}</h1>
        </div>
        <div className="text-xs text-[var(--text-dim)]">
          현재 환율 1USD = {fxRate.toLocaleString('ko-KR')}₩
        </div>
      </div>
      {[...byModality.entries()].map(([modality, list]) => (
        <section key={modality}>
          <h2 className="text-sm font-semibold mb-3 text-[var(--text-muted)]">
            {modalityLabel(modality)}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {list.map((m) => (
              <FamilyModelCard
                key={m.id}
                model={m}
                fxRate={fxRate}
                lowestUsd={lowestBilledUsd(m)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
