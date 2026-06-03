'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adjustBalance } from '@/lib/actions/admin-users'
import { formatKrw } from '@/components/common/MoneyText'

export function BalanceAdjustDialog({ userId }: { userId: string }) {
  const router = useRouter()
  const [sign, setSign] = useState<'add' | 'sub'>('add')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = Number(amount)
  const valid = Number.isInteger(parsed) && parsed > 0 && reason.trim().length > 0

  async function onSubmit() {
    setError(null)
    if (!valid) {
      setError('0보다 큰 정수 금액과 사유를 입력하세요.')
      return
    }
    const signedAmount = sign === 'add' ? parsed : -parsed
    const label = sign === 'add' ? '추가' : '차감'
    if (!confirm(`잔액을 ${formatKrw(parsed)} ${label}하시겠습니까?`)) return
    setBusy(true)
    const res = await adjustBalance(userId, signedAmount, reason.trim())
    setBusy(false)
    if (!res.ok) {
      setError(res.message)
      return
    }
    setAmount('')
    setReason('')
    router.refresh()
  }

  return (
    <div className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] p-4 space-y-3">
      <div className="text-sm font-semibold text-[var(--text-muted)]">잔액 조정</div>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="adjust-sign" checked={sign === 'add'} onChange={() => setSign('add')} />
          추가
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="adjust-sign" checked={sign === 'sub'} onChange={() => setSign('sub')} />
          차감
        </label>
      </div>
      <input
        type="number"
        inputMode="numeric"
        placeholder="금액 (원)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full px-3 py-2 rounded-md bg-[var(--bg)] border border-[var(--border)] text-sm"
      />
      <input
        type="text"
        placeholder="사유 (예: 누락 환불 보정)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full px-3 py-2 rounded-md bg-[var(--bg)] border border-[var(--border)] text-sm"
      />
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <button
        disabled={busy || !valid}
        onClick={onSubmit}
        className="px-3 py-1.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm disabled:opacity-50"
      >
        {busy ? '처리 중…' : '적용'}
      </button>
    </div>
  )
}
