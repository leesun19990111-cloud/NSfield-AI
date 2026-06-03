'use client'

type Option = { value: string; label: string }

type Props = {
  label: string
  options: Option[]
  value: string | undefined
  onChange: (v: string) => void
}

// 옵션 수가 적으면 버튼 그룹, 많으면 <select>
export function SelectField({ label, options, value, onChange }: Props) {
  const useButtons = options.length <= 6
  return (
    <div className="space-y-1">
      <label className="text-sm text-[var(--text-muted)]">{label}</label>
      {useButtons ? (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const active = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange(o.value)}
                className={[
                  'px-3 py-1.5 rounded-md border text-sm',
                  active
                    ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--text-primary)]'
                    : 'border-[var(--border)] bg-[var(--bg-surface-2)] hover:border-[var(--accent)]',
                ].join(' ')}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      ) : (
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)] text-[var(--text-primary)]"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
