'use client'

type Clip = { url: string; start: number; ends: number; fps: number }

type Props = {
  label: string
  required?: boolean
  value: Clip[] | undefined
  onChange: (clips: Clip[]) => void
}

const EMPTY: Clip = { url: '', start: 0, ends: 0, fps: 1 }

// 단일 비디오 클립을 길이 1 배열로 다룬다: [{ url, start, ends, fps }]
export function VideoClipField({ label, required, value, onChange }: Props) {
  const clip = value?.[0] ?? EMPTY

  function patch(p: Partial<Clip>) {
    onChange([{ ...clip, ...p }])
  }

  const numField = (key: 'start' | 'ends' | 'fps', name: string) => (
    <div className="space-y-1">
      <label className="text-xs text-[var(--text-dim)]">{name}</label>
      <input
        type="number"
        value={clip[key]}
        min={0}
        onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<Clip>)}
        className="w-full px-2 py-1.5 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)] text-[var(--text-primary)] text-sm"
      />
    </div>
  )

  return (
    <div className="space-y-2">
      <label className="text-sm text-[var(--text-muted)]">
        {label}
        {required && <span className="text-[var(--danger)] ml-0.5">*</span>}
      </label>
      <input
        type="text"
        value={clip.url}
        placeholder="비디오 URL"
        onChange={(e) => patch({ url: e.target.value })}
        className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)] text-[var(--text-primary)] text-sm"
      />
      <div className="grid grid-cols-3 gap-2">
        {numField('start', '시작(s)')}
        {numField('ends', '종료(s)')}
        {numField('fps', 'FPS')}
      </div>
    </div>
  )
}
