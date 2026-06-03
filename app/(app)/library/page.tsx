import { listMyGenerations } from '@/lib/actions/library'
import { getSessionUser } from '@/lib/auth/session'
import { GenerationGrid } from '@/components/library/GenerationGrid'
import { GenerationLiveStatus } from '@/components/library/GenerationLiveStatus'

export default async function LibraryPage() {
  const items = await listMyGenerations()
  const user = await getSessionUser()
  return (
    <div className="space-y-6">
      {user && <GenerationLiveStatus userId={user.id} />}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">라이브러리</h1>
        <span className="text-xs text-[var(--text-dim)]">생성물은 30일 후 자동 삭제됩니다</span>
      </div>
      <GenerationGrid items={items} />
    </div>
  )
}
