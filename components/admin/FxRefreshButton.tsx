'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { triggerFxRefresh } from '@/lib/actions/admin-fx'

export function FxRefreshButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function onClick() {
    setBusy(true)
    const res = await triggerFxRefresh()
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
      className="px-4 py-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm disabled:opacity-50"
    >
      {busy ? '갱신 중…' : '지금 갱신'}
    </button>
  )
}
