import { listActiveModels } from '@/lib/actions/models'
import { lowestBilledUsd } from '@/lib/models/catalog-pricing'
import { ModelCard } from '@/components/models/ModelCard'

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>
}) {
  const { kind } = await searchParams
  const { models, fxRate } = await listActiveModels()
  const filtered =
    kind === 'image'
      ? models.filter((m) => m.kind === 'IMAGE')
      : kind === 'video'
        ? models.filter((m) => m.kind === 'VIDEO')
        : models
  const images = filtered.filter((m) => m.kind === 'IMAGE')
  const videos = filtered.filter((m) => m.kind === 'VIDEO')
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">모델</h1>
        <div className="text-xs text-[var(--text-dim)]">
          현재 환율 1USD = {fxRate.toLocaleString('ko-KR')}₩
        </div>
      </div>
      {images.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3 text-[var(--text-muted)]">이미지</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((m) => (
              <ModelCard key={m.id} model={m} fxRate={fxRate} lowestUsd={lowestBilledUsd(m)} />
            ))}
          </div>
        </section>
      )}
      {videos.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3 text-[var(--text-muted)]">영상</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {videos.map((m) => (
              <ModelCard key={m.id} model={m} fxRate={fxRate} lowestUsd={lowestBilledUsd(m)} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
