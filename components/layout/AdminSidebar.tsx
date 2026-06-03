import Link from 'next/link'

const items = [
  { href: '/admin/dashboard', label: '대시보드' },
  { href: '/admin/topups', label: '충전' },
  { href: '/admin/users', label: '사용자' },
  { href: '/admin/models', label: '모델' },
  { href: '/admin/generations', label: '생성내역' },
  { href: '/admin/fx-rates', label: '환율' },
  { href: '/admin/audit', label: '감사로그' },
]

export function AdminSidebar({ pendingTopups }: { pendingTopups: number }) {
  return (
    <aside className="w-48 shrink-0 border-r border-[var(--border)] min-h-screen p-4">
      <div className="font-bold mb-6">NS Admin</div>
      <nav className="space-y-1">
        {items.map((it) => (
          <Link key={it.href} href={it.href}
            className="flex items-center justify-between px-3 py-2 rounded-md text-sm text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]">
            <span>{it.label}</span>
            {it.href === '/admin/topups' && pendingTopups > 0 && (
              <span className="text-xs bg-[var(--warning)] text-black rounded-full px-1.5">{pendingTopups}</span>
            )}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
