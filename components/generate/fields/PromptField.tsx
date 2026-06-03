'use client'

type Props = {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  label?: string
  required?: boolean
}

export function PromptField({ value, onChange, onBlur, label = '프롬프트', required }: Props) {
  const v = value ?? ''
  return (
    <div className="space-y-1">
      <label className="text-sm text-[var(--text-muted)]">
        {label}
        {required && <span className="text-[var(--danger)] ml-0.5">*</span>}
      </label>
      <textarea
        value={v}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        maxLength={2000}
        placeholder="생성할 내용을 설명하세요"
        className="w-full h-40 px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)] text-[var(--text-primary)]"
      />
      <div className="text-xs text-[var(--text-dim)] text-right">{v.length}/2000</div>
    </div>
  )
}
