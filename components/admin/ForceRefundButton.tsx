'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { forceRefund } from '@/lib/actions/admin-generations'
import { formatKrw } from '@/components/common/MoneyText'

export function ForceRefundButton({
  genId,
  charged_krw,
  alreadyRefunded,
}: {
  genId: string
  charged_krw: number
  alreadyRefunded: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  if (alreadyRefunded) {
    return (
      <button
        disabled
        className="px-3 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-sm text-[var(--text-dim)] cursor-not-allowed"
      >
        환불됨
      </button>
    )
  }

  async function onClick() {
    const reason = prompt(`이 생성을 ${formatKrw(charged_krw)} 강제 환불합니다. 사유를 입력하세요.`)
    if (reason === null) return
    if (!reason.trim()) {
      alert('환불 사유를 입력하세요.')
      return
    }
    setBusy(true)
    const res = await forceRefund(genId, reason.trim())
    setBusy(false)
    if (!res.ok) {
      alert(res.message)
      return
    }
    router.refresh()
  }

  return (
    <button
      disabled={busy}
      onClick={onClick}
      className="px-3 py-1.5 rounded-md bg-[var(--danger)] hover:opacity-90 text-sm text-white disabled:opacity-50"
    >
      {busy ? '처리 중…' : `강제 환불 (${formatKrw(charged_krw)})`}
    </button>
  )
}
