'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTopupRequest } from '@/lib/actions/topup'

export function TopupForm({ topupCode }: { topupCode: string }) {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [name, setName] = useState('')
  const [at, setAt] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setMsg(null)
    const res = await createTopupRequest({
      amount_krw: Number(amount), depositor_name: name, transferred_at: at, note,
    })
    setLoading(false)
    if (res.ok) {
      setMsg({ ok: true, text: '관리자 확인 후 잔액에 반영됩니다.' })
      setAmount(''); setName(''); setAt(''); setNote('')
      router.refresh()
    } else {
      setMsg({ ok: false, text: res.message })
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="number" required placeholder="입금 금액 (₩)" value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)]" />
      <input type="text" required placeholder={`입금자명 (예: 홍길동${topupCode})`} value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)]" />
      <input type="datetime-local" required value={at}
        onChange={(e) => setAt(e.target.value)}
        className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)]" />
      <input type="text" placeholder="메모 (선택)" value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)]" />
      {msg && <p className={msg.ok ? 'text-[var(--success)] text-sm' : 'text-[var(--danger)] text-sm'}>{msg.text}</p>}
      <button type="submit" disabled={loading}
        className="w-full py-2.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50">
        {loading ? '제출 중…' : '충전 요청 제출'}
      </button>
    </form>
  )
}
