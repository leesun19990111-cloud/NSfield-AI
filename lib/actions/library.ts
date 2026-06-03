'use server'

import { requireUser } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { getSignedUrl } from '@/lib/storage/signed-url'

export async function listMyGenerations() {
  const user = await requireUser()
  return prisma.generation.findMany({
    where: { user_id: user.id },
    orderBy: { created_at: 'desc' },
    take: 60,
  })
}

export async function getMyGeneration(id: string) {
  const user = await requireUser()
  const gen = await prisma.generation.findUnique({ where: { id } })
  if (!gen || gen.user_id !== user.id) return null
  let signedUrls: string[] = []
  if (gen.result_urls.length > 0) {
    const urls = await Promise.all(gen.result_urls.map((p) => getSignedUrl(p, 3600)))
    signedUrls = urls.filter((u): u is string => !!u)
  }
  return { gen, signedUrls }
}

// 입력 이미지로 재사용할 내 SUCCEEDED 이미지 생성물 목록 (서명 URL 포함)
export async function listMyImageResultsForInput(limit = 30) {
  const user = await requireUser()
  const gens = await prisma.generation.findMany({
    where: { user_id: user.id, kind: 'IMAGE', status: 'SUCCEEDED', NOT: { result_urls: { isEmpty: true } } },
    orderBy: { created_at: 'desc' },
    take: limit,
    select: { id: true, prompt: true, result_urls: true, created_at: true },
  })
  // 각 결과의 첫 이미지 서명 URL
  const items = await Promise.all(
    gens.map(async (g) => ({
      id: g.id,
      prompt: g.prompt,
      created_at: g.created_at,
      url: g.result_urls[0] ? await getSignedUrl(g.result_urls[0], 3600) : null,
    })),
  )
  return items.filter((i) => i.url)
}
