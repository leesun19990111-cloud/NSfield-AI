import Link from 'next/link'
import { BalanceChip } from './BalanceChip'
import type { SessionUser } from '@/lib/auth/session'

export function TopBar({ user }: { user: SessionUser }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg-base)]/80 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <nav className="flex items-center gap-6">
          <Link href="/wallet" className="font-bold">NS Field</Link>
          <Link href="/models" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">모델</Link>
          <Link href="/library" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">라이브러리</Link>
        </nav>
        <div className="flex items-center gap-3">
          <BalanceChip userId={user.id} />
          {user.role === 'ADMIN' && (
            <Link href="/admin" className="text-sm text-[var(--accent)]">관리자</Link>
          )}
          <Link href="/account" className="text-sm">{user.display_name ?? '계정'}</Link>
        </div>
      </div>
    </header>
  )
}
