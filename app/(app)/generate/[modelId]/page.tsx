import { notFound } from 'next/navigation'
import { getModelConfig } from '@/lib/models/catalog/registry'
import { getModelDetail } from '@/lib/actions/models'
import { DynamicGenerator } from '@/components/generate/DynamicGenerator'

export const maxDuration = 60

export default async function GeneratePage({ params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params
  const config = getModelConfig(modelId)
  const data = await getModelDetail(modelId)
  if (!config || !data || !data.model.is_active) notFound()
  // config의 직렬화 가능한 부분만 전달 (함수 없음 — 전부 데이터라 OK)
  return (
    <DynamicGenerator
      config={{
        id: config.id,
        displayName: config.displayName,
        output: config.output,
        fields: config.fields,
        advancedFields: config.advancedFields ?? [],
        durationParam: config.durationParam,
        customForm: config.customForm,
      }}
      fxRate={data.fxRate}
    />
  )
}
