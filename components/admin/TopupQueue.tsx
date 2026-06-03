'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveTopup, rejectTopup } from '@/lib/actions/admin-topup'
import { formatKrw } from '@/components/common/MoneyText'

type Item = {
  id: string; amount_krw: number; depositor_name: string; transferred_at: Date
  created_at: Date; note: string | null
  user: { email: string; display_name: string | null; topup_code: string }
}

export function TopupQueue({ items }: { items: Item[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function onApprove(id: string) {
    if (!confirm('이 충전 요청을 승인하시겠습니까? 잔액에 즉시 반영됩니다.')) return
    setBusy(id)
    const res = await approveTopup(id)
    setBusy(null)
    if (!res.ok) alert(res.message)
    else router.refresh()
  }

  async function onReject(id: string) {
    const reason = prompt('거절 사유를 입력하세요 (예: 입금 확인 안 됨)')
    if (reason === null) return
    setBusy(id)
    const res = await rejectTopup(id, reason || '사유 없음')
    setBusy(null)
    if (!res.ok) alert(res.message)
    else router.refresh()
  }

  if (items.length === 0) {
    return <p className="text-[var(--text-dim)] text-sm py-8 text-center">대기 중인 충전 요청이 없습니다.</p>
  }

  return (
    <div className="space-y-3">
      {items.map((t) => {
        const codeMatch = t.depositor_name.includes(t.user.topup_code)
        return (
          <div key={t.id} className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">
                  {t.user.display_name ?? t.user.email}
                  <span className="text-[var(--text-dim)] text-sm ml-2">{t.user.email}</span>
                </div>
                <div className="text-sm mt-1">
                  요청액 <span className="font-mono">{formatKrw(t.amount_krw)}</span>
                  {' · 입금자 "'}{t.depositor_name}{'"'}
                  {codeMatch
                    ? <span className="text-[var(--success)] ml-1">식별코드 ✅</span>
                    : <span className="text-[var(--warning)] ml-1">⚠ 식별코드 누락</span>}
                </div>
                <div className="text-xs text-[var(--text-dim)] mt-1">
                  입금 {new Date(t.transferred_at).toLocaleString('ko-KR')}
                  {t.note ? ` · 메모: ${t.note}` : ''}
                </div>
              </div>
              <div className="flex gap-2">
                <button disabled={busy === t.id} onClick={() => onReject(t.id)}
                  className="px-3 py-1.5 rounded-md border border-[var(--border)] text-sm hover:bg-[var(--bg-surface-2)] disabled:opacity-50">
                  거절
                </button>
                <button disabled={busy === t.id} onClick={() => onApprove(t.id)}
                  className="px-3 py-1.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm disabled:opacity-50">
                  승인
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
