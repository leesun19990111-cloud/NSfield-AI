'use client'

type Props = {
  label: string
  options?: number[]
  min?: number
  max?: number
  value: number | undefined
  onChange: (v: number) => void
}

export function IntField({ label, options, min, max, value, onChange }: Props) {
  return (
    <div className="space-y-1">
      <label className="text-sm text-[var(--text-muted)]">{label}</label>
      {options && options.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {options.map((n) => {
            const active = n === value
            return (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                className={[
                  'px-3 py-1.5 rounded-md border text-sm',
                  active
                    ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--text-primary)]'
                    : 'border-[var(--border)] bg-[var(--bg-surface-2)] hover:border-[var(--accent)]',
                ].join(' ')}
              >
                {n}
              </button>
            )
          })}
        </div>
      ) : (
        <input
          type="number"
          value={value ?? ''}
          min={min}
          max={max}
          onChange={(e) => {
            const n = e.target.value === '' ? NaN : Number(e.target.value)
            if (!Number.isNaN(n)) onChange(n)
          }}
          className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)] text-[var(--text-primary)]"
        />
      )}
    </div>
  )
}
