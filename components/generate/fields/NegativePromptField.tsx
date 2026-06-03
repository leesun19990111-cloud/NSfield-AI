'use client'

type Props = {
  value: string
  onChange: (v: string) => void
  label?: string
}

export function NegativePromptField({ value, onChange, label = '네거티브 프롬프트' }: Props) {
  const v = value ?? ''
  return (
    <div className="space-y-1">
      <label className="text-sm text-[var(--text-muted)]">{label}</label>
      <textarea
        value={v}
        onChange={(e) => onChange(e.target.value)}
        maxLength={2000}
        placeholder="제외할 요소를 설명하세요 (선택)"
        className="w-full h-20 px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)] text-[var(--text-primary)]"
      />
    </div>
  )
}
