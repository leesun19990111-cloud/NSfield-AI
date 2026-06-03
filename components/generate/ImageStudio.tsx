'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { estimateGeneration, createImageGeneration } from '@/lib/actions/generation'
import { formatKrw, formatUsd } from '@/components/common/MoneyText'

export function ImageStudio({ modelId, modelName, fxRate }: {
  modelId: string; modelName: string; fxRate: number
}) {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [est, setEst] = useState<{ usd: number; krw: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onEstimate() {
    if (!prompt.trim()) return
    const res = await estimateGeneration({ modelId, prompt, count: 1 })
    if (res.ok) setEst({ usd: res.billedUsd, krw: res.krw })
    else setError(res.message)
  }

  async function onGenerate() {
    setLoading(true); setError(null)
    const res = await createImageGeneration({ modelId, prompt, count: 1 })
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
          onBlur={onEstimate}
          maxLength={2000}
          placeholder="생성할 이미지를 설명하세요"
          className="w-full h-40 px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)]"
        />
        <div className="text-xs text-[var(--text-dim)] text-right">{prompt.length}/2000</div>
        {est && (
          <div className="rounded-md bg-[var(--bg-surface)] border border-[var(--border)] p-3 text-sm">
            예상 차감 <span className="font-mono">{formatUsd(est.usd)}</span> ≈ <span className="font-mono">{formatKrw(est.krw)}</span>
            <div className="text-xs text-[var(--text-dim)] mt-1">현재 환율 1USD={fxRate.toLocaleString('ko-KR')}₩ · 마진 포함</div>
          </div>
        )}
        {error && <p className="text-[var(--danger)] text-sm">{error}</p>}
        <button onClick={onGenerate} disabled={loading || !prompt.trim()}
          className="w-full py-2.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50">
          {loading ? '생성 중… (최대 30초)' : '✨ 생성하기'}
        </button>
      </div>
      <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] min-h-[300px] flex items-center justify-center text-[var(--text-dim)] text-sm">
        {loading ? '이미지를 생성하고 있습니다…' : '생성 결과가 여기에 표시됩니다'}
      </div>
    </div>
  )
}
