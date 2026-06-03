import Link from 'next/link'
import { formatKrw } from '@/components/common/MoneyText'

type Gen = {
  id: string; kind: string; status: string; charged_krw: number | null
  created_at: Date; expires_at: Date | null; result_urls: string[]
}

const statusLabel: Record<string, string> = {
  PENDING: '대기', RUNNING: '생성 중', SUCCEEDED: '완료', FAILED: '실패', CANCELED: '취소',
}

export function GenerationGrid({ items }: { items: Gen[] }) {
  if (items.length === 0) {
    return <p className="text-[var(--text-dim)] text-sm py-12 text-center">아직 생성한 결과가 없습니다. 모델에서 첫 이미지를 만들어보세요.</p>
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((g) => {
        const expired = !!g.expires_at && new Date(g.expires_at) < new Date()
        return (
          <Link key={g.id} href={`/library/${g.id}`}
            className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] p-3 hover:border-[var(--accent)]">
            <div className="aspect-square rounded bg-[var(--bg-surface-2)] mb-2 flex items-center justify-center text-xs text-[var(--text-dim)]">
              {expired ? '만료됨' : g.status === 'SUCCEEDED' ? '이미지' : statusLabel[g.status] ?? g.status}
            </div>
            <div className="text-xs flex justify-between">
              <span>{statusLabel[g.status] ?? g.status}</span>
              <span className="font-mono">{g.charged_krw ? formatKrw(g.charged_krw) : '-'}</span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
