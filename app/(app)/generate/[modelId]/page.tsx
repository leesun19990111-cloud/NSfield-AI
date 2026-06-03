import { notFound, redirect } from 'next/navigation'
import { getModelDetail } from '@/lib/actions/models'
import { ImageStudio } from '@/components/generate/ImageStudio'

export const maxDuration = 60

export default async function GeneratePage({ params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params
  const data = await getModelDetail(modelId)
  if (!data || !data.model.is_active) notFound()
  if (data.model.kind !== 'IMAGE') redirect('/models') // 영상은 Plan 3
  return (
    <ImageStudio modelId={data.model.id} modelName={data.model.display_name} fxRate={data.fxRate} />
  )
}
