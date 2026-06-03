'use client'

import { useRef, useState } from 'react'
import { uploadInputImage } from '@/lib/client/upload'
import { LibraryPickModal } from './LibraryPickModal'

type Props = {
  label: string
  max: number
  value: string[] | undefined
  onChange: (urls: string[]) => void
}

export function ImagesInputField({ label, max, value, onChange }: Props) {
  const urls = value ?? []
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [libOpen, setLibOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function add(url: string) {
    if (urls.length >= max) return
    onChange([...urls, url])
  }

  function removeAt(i: number) {
    onChange(urls.filter((_, idx) => idx !== i))
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const slots = max - urls.length
      const picked = Array.from(files).slice(0, Math.max(0, slots))
      const uploaded: string[] = []
      for (const f of picked) {
        uploaded.push(await uploadInputImage(f))
      }
      onChange([...urls, ...uploaded])
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 실패')
    } finally {
      setUploading(false)
    }
  }

  const canAdd = urls.length < max

  return (
    <div className="space-y-1">
      <label className="text-sm text-[var(--text-muted)]">
        {label} <span className="text-[var(--text-dim)]">({urls.length}/{max})</span>
      </label>

      <div className="flex flex-wrap gap-2">
        {urls.map((u, i) => (
          <div key={`${u}-${i}`} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={`${label} ${i + 1}`} className="h-24 w-24 rounded-md border border-[var(--border)] object-cover" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute top-0.5 right-0.5 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-white hover:bg-[var(--danger)]"
            >
              ✕
            </button>
          </div>
        ))}
        {canAdd && (
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              void handleFiles(e.dataTransfer.files)
            }}
            className="h-24 w-24 flex items-center justify-center rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-surface-2)] cursor-pointer hover:border-[var(--accent)] text-xs text-[var(--text-dim)] text-center px-1"
          >
            {uploading ? '업로드 중…' : '+ 추가'}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {canAdd && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setLibOpen(true)}
            className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] underline"
          >
            내 라이브러리에서 선택
          </button>
        </div>
      )}
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}

      <LibraryPickModal open={libOpen} onClose={() => setLibOpen(false)} onPick={(url) => add(url)} />
    </div>
  )
}
