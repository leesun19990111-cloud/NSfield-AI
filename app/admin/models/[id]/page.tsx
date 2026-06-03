import { notFound } from 'next/navigation'
import { getModelForEdit } from '@/lib/actions/admin-models'
import { getCurrentFxRate } from '@/lib/fx/service'
import { ModelEditor } from '@/components/admin/ModelEditor'

export default async function AdminModelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [model, fxRate] = await Promise.all([getModelForEdit(id), getCurrentFxRate()])
  if (!model) notFound()

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">{model.display_name}</h1>
        <div className="text-sm text-[var(--text-muted)] font-mono">{model.id}</div>
        <div className="text-sm text-[var(--text-dim)]">
          {model.kind} · {model.provider}
        </div>
      </div>
      <ModelEditor
        model={{
          id: model.id,
          kind: model.kind,
          provider: model.provider,
          display_name: model.display_name,
          is_active: model.is_active,
          margin_pct: Number(model.margin_pct),
          pricing_json: model.pricing_json,
        }}
        fxRate={fxRate}
      />
    </div>
  )
}
