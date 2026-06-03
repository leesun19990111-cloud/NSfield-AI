import { listUsers } from '@/lib/actions/admin-users'
import { UserTable } from '@/components/admin/UserTable'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const items = await listUsers(q)
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">사용자</h1>
      <form method="get" className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="이메일 / 이름 / 식별코드 검색"
          className="flex-1 max-w-md px-3 py-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-sm"
        />
        <button
          type="submit"
          className="px-3 py-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm"
        >
          검색
        </button>
      </form>
      <UserTable items={items} />
    </div>
  )
}
