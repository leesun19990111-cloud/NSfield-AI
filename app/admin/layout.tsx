import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'
import { AdminSidebar } from '@/components/layout/AdminSidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/auth/login')
  if (user.role !== 'ADMIN') redirect('/')

  const pending = await prisma.topupRequest.count({ where: { status: 'PENDING' } })

  return (
    <div className="flex">
      <AdminSidebar pendingTopups={pending} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
