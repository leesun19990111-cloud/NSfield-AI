import { prisma } from '@/lib/db/prisma'
import { deleteGenerationObjects } from '@/lib/storage/upload'

export async function cleanupExpiredGenerations(): Promise<{ processed: number; deletedObjects: number }> {
  const expired = await prisma.generation.findMany({
    where: {
      expires_at: { lt: new Date() },
      result_urls: { isEmpty: false },
    },
    take: 500,
    select: { id: true, result_urls: true, input_image_url: true },
  })

  let deletedObjects = 0
  for (const gen of expired) {
    const paths = [...gen.result_urls, ...(gen.input_image_url ? [gen.input_image_url] : [])]
    try {
      await deleteGenerationObjects(paths)
      deletedObjects += paths.length
    } catch (e) {
      console.error('[cleanup] storage delete failed (continuing):', gen.id, e)
      // 메타데이터 정리는 진행 (Storage TTL 폴리시가 잔여 객체 처리)
    }
    // 메타데이터(prompt/cost/charged_krw)는 보존, 파일 참조만 비움.
    // updateMany 사용: 조회~갱신 사이에 행이 삭제돼도 예외 없이 no-op (멱등/경합 안전).
    await prisma.generation.updateMany({
      where: { id: gen.id },
      data: { result_urls: [], input_image_url: null },
    })
  }
  return { processed: expired.length, deletedObjects }
}
