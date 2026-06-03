'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { estimateGeneration, createVideoGeneration } from '@/lib/actions/generation'
import { formatKrw, formatUsd } from '@/components/common/MoneyText'

function label(sec: number) {
  return sec >= 60 ? `${sec / 60}분` : `${sec}초`
}

export function VideoStudio({ modelId, modelName, fxRate, allowedDurations, allDurations }: {
  modelId: string; modelName: string; fxRate: number; allowedDurations: number[]; allDurations: number[]
}) {
  const router = useRouter()
  const firstAllowed = allowedDurations[0] ?? 5
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState<number>(firstAllowed)
  const [est, setEst] = useState<{ usd: number; krw: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onEstimate(nextDuration = duration) {
    if (!prompt.trim()) return
    const res = await estimateGeneration({ modelId, prompt, duration_sec: nextDuration })
    if (res.ok) { setEst({ usd: res.billedUsd, krw: res.krw }); setError(null) }
    else { setEst(null); setError(res.message) }
  }

  async function onGenerate() {
    setLoading(true); setError(null)
    const res = await createVideoGeneration({ modelId, prompt, duration_sec: duration })
    setLoading(false)
    if (res.ok) router.push(`/library/${res.generationId}`)
    else setError(res.message)
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h1 className="text-lg font-bold">{modelName}</h1>
        <textarea
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); setEst(null) }}
          onBlur={() => onEstimate()}
          maxLength={2000}
          placeholder="생성할 영상을 설명하세요"
          className="w-full h-32 px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)]"
        />
        <div>
          <div className="text-sm text-[var(--text-muted)] mb-2">영상 길이</div>
          <div className="flex flex-wrap gap-2">
            {allDurations.map((d) => {
              const supported = allowedDurations.includes(d)
              const active = d === duration
              return (
                <button key={d} type="button" disabled={!supported}
                  title={supported ? '' : `${modelName}은(는) 이 길이를 지원하지 않습니다`}
                  onClick={() => { setDuration(d); setEst(null); onEstimate(d) }}
                  className={[
                    'px-3 py-1.5 rounded-md border text-sm',
                    active ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)] bg-[var(--bg-surface-2)]',
                    !supported ? 'opacity-30 cursor-not-allowed' : 'hover:border-[var(--accent)]',
                  ].join(' ')}>
                  {label(d)}
                </button>
              )
            })}
          </div>
        </div>
        {est && (
          <div className="rounded-md bg-[var(--bg-surface)] border border-[var(--border)] p-3 text-sm">
            예상 차감 <span className="font-mono">{formatUsd(est.usd)}</span> ≈ <span className="font-mono">{formatKrw(est.krw)}</span>
            <div className="text-xs text-[var(--text-dim)] mt-1">현재 환율 1USD={fxRate.toLocaleString('ko-KR')}₩ · 마진 포함</div>
          </div>
        )}
        {error && <p className="text-[var(--danger)] text-sm">{error}</p>}
        <button onClick={onGenerate} disabled={loading || !prompt.trim()}
          className="w-full py-2.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50">
          {loading ? '작업 등록 중…' : '✨ 영상 생성하기'}
        </button>
        <p className="text-xs text-[var(--text-dim)]">영상은 생성에 시간이 걸립니다. 등록 후 라이브러리에서 완료를 확인하세요(자동 갱신).</p>
      </div>
      <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] min-h-[300px] flex items-center justify-center text-[var(--text-dim)] text-sm">
        {loading ? '영상 작업을 등록하고 있습니다…' : '등록 후 라이브러리에서 결과를 확인합니다'}
      </div>
    </div>
  )
}
