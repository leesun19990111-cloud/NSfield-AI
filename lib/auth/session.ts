import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'

export type SessionUser = {
  id: string
  email: string
  role: 'USER' | 'ADMIN'
  display_name: string | null
  topup_code: string
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!dbUser) return null

  return {
    id: dbUser.id,
    email: dbUser.email,
    role: dbUser.role,
    display_name: dbUser.display_name,
    topup_code: dbUser.topup_code,
  }
}
