import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { TopBar } from '@/components/layout/TopBar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/auth/login')
  return (
    <div>
      <TopBar user={user} />
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
