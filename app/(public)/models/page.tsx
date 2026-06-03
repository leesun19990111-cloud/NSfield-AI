import { listFamilies } from '@/lib/actions/models'
import { FamilyCard } from '@/components/models/FamilyCard'

export const dynamic = 'force-dynamic'

export default async function ModelsPage() {
  const { families, fxRate } = await listFamilies()
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">모델</h1>
        <div className="text-xs text-[var(--text-dim)]">
          현재 환율 1USD = {fxRate.toLocaleString('ko-KR')}₩
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {families.map((f) => (
          <FamilyCard
            key={f.family}
            family={f.family}
            active={f.active}
            minUsd={f.minUsd}
            fxRate={fxRate}
          />
        ))}
      </div>
    </div>
  )
}
