'use client'

type Props = {
  label: string
  value: boolean | undefined
  onChange: (v: boolean) => void
}

export function ToggleField({ label, value, onChange }: Props) {
  const on = !!value
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={[
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          on ? 'bg-[var(--accent)]' : 'bg-[var(--bg-surface-2)] border border-[var(--border)]',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
            on ? 'translate-x-6' : 'translate-x-1',
          ].join(' ')}
        />
      </button>
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
    </label>
  )
}
