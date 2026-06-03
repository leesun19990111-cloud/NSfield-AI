import { notFound } from 'next/navigation'
import { getModelDetail } from '@/lib/actions/models'
import { ImageStudio } from '@/components/generate/ImageStudio'
import { VideoStudio } from '@/components/generate/VideoStudio'
import { ALLOWED_DURATIONS_SEC } from '@/lib/constants'

export const maxDuration = 60

export default async function GeneratePage({ params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params
  const data = await getModelDetail(modelId)
  if (!data || !data.model.is_active) notFound()
  if (data.model.kind === 'IMAGE') {
    return <ImageStudio modelId={data.model.id} modelName={data.model.display_name} fxRate={data.fxRate} />
  }
  // VIDEO
  const pj = data.model.pricing_json as { options?: { allowed_durations_sec?: number[] } } | null
  const allowed = pj?.options?.allowed_durations_sec ?? []
  return (
    <VideoStudio
      modelId={data.model.id}
      modelName={data.model.display_name}
      fxRate={data.fxRate}
      allowedDurations={allowed}
      allDurations={[...ALLOWED_DURATIONS_SEC]}
    />
  )
}
