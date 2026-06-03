import { listPendingTopups } from '@/lib/actions/admin-topup'
import { TopupQueue } from '@/components/admin/TopupQueue'

export default async function AdminTopupsPage() {
  const items = await listPendingTopups()
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">충전 요청</h1>
      <div>
        <h2 className="text-sm font-semibold mb-3 text-[var(--text-muted)]">대기 중 ({items.length})</h2>
        <TopupQueue items={items} />
      </div>
    </div>
  )
}
