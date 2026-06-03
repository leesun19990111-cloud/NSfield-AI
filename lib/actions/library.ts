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
