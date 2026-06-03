'use client'

import { useEffect, useState } from 'react'
import { listMyImageResultsForInput } from '@/lib/actions/library'

type Item = { id: string; prompt: string; url: string | null; created_at: Date }

type Props = {
  open: boolean
  onClose: () => void
  onPick: (url: string) => void
}

// 내 라이브러리(SUCCEEDED 이미지)에서 입력 이미지를 선택하는 모달
export function LibraryPickModal({ open, onClose, onPick }: Props) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await listMyImageResultsForInput(30)
        if (!cancelled) setItems(res as Item[])
      } catch {
        if (!cancelled) setError('라이브러리를 불러오지 못했습니다.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">내 라이브러리에서 선택</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-dim)] hover:text-[var(--text-primary)] text-sm"
          >
            닫기
          </button>
        </div>
        {loading && <p className="text-sm text-[var(--text-dim)]">불러오는 중…</p>}
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="text-sm text-[var(--text-dim)]">재사용할 수 있는 이미지가 없습니다.</p>
        )}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {items.map((it) =>
            it.url ? (
              <button
                key={it.id}
                type="button"
                title={it.prompt}
                onClick={() => {
                  onPick(it.url as string)
                  onClose()
                }}
                className="aspect-square overflow-hidden rounded-md border border-[var(--border)] hover:border-[var(--accent)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt={it.prompt} className="w-full h-full object-cover" />
              </button>
            ) : null,
          )}
        </div>
      </div>
    </div>
  )
}
