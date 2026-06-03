'use client'

import { useRef, useState } from 'react'
import { uploadInputImage } from '@/lib/client/upload'
import { LibraryPickModal } from './LibraryPickModal'

type Props = {
  label: string
  required?: boolean
  value: string | undefined
  onChange: (url: string | undefined) => void
}

export function ImageInputField({ label, required, value, onChange }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [libOpen, setLibOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadInputImage(file)
      onChange(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 실패')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-1">
      <label className="text-sm text-[var(--text-muted)]">
        {label}
        {required && <span className="text-[var(--danger)] ml-0.5">*</span>}
      </label>

      {value ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={label}
            className="max-h-40 rounded-md border border-[var(--border)] object-contain"
          />
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="absolute top-1 right-1 px-2 py-0.5 rounded bg-black/70 text-xs text-white hover:bg-[var(--danger)]"
          >
            제거
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void handleFile(e.dataTransfer.files?.[0])
          }}
          className="flex flex-col items-center justify-center gap-1 px-4 py-6 rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-surface-2)] cursor-pointer hover:border-[var(--accent)] text-sm text-[var(--text-dim)]"
        >
          {uploading ? '업로드 중…' : '이미지를 끌어다 놓거나 클릭하여 업로드'}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => setLibOpen(true)}
          className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] underline"
        >
          내 라이브러리에서 선택
        </button>
      </div>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}

      <LibraryPickModal open={libOpen} onClose={() => setLibOpen(false)} onPick={(url) => onChange(url)} />
    </div>
  )
}
