'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FieldType } from '@/lib/models/catalog/types'
import { estimateGeneration, createGeneration } from '@/lib/actions/generation'
import type { EstimateBreakdown } from '@/lib/actions/generation'
import { formatKrw, formatUsd } from '@/components/common/MoneyText'
import { customForms } from './customForms'
import { PromptField } from './fields/PromptField'
import { NegativePromptField } from './fields/NegativePromptField'
import { SelectField } from './fields/SelectField'
import { IntField } from './fields/IntField'
import { ToggleField } from './fields/ToggleField'
import { ImageInputField } from './fields/ImageInputField'
import { ImagesInputField } from './fields/ImagesInputField'
import { VideoClipField } from './fields/VideoClipField'

export type GeneratorConfig = {
  id: string
  displayName: string
  output: 'IMAGE' | 'VIDEO'
  fields: FieldType[]
  advancedFields: FieldType[]
  durationParam?: string
  customForm?: string
}

type Props = { config: GeneratorConfig; fxRate: number }

// 필드 기본값으로 inputs 초기 시드
function seedDefaults(fields: FieldType[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    switch (f.kind) {
      case 'prompt':
        out.prompt = ''
        break
      case 'select':
        if (f.default !== undefined) out[f.param] = f.default
        break
      case 'int':
        if (f.default !== undefined) out[f.param] = f.default
        break
      case 'toggle':
        if (f.default !== undefined) out[f.param] = f.default
        break
      default:
        break
    }
  }
  return out
}

// 클라이언트 필수값 검증 (서버에서 재검증됨)
function isComplete(fields: FieldType[], inputs: Record<string, unknown>): boolean {
  for (const f of fields) {
    if (f.kind === 'prompt') {
      if (f.required !== false && !String(inputs.prompt ?? '').trim()) return false
    } else if (f.kind === 'image' && f.required) {
      if (!inputs[f.param]) return false
    } else if (f.kind === 'video_clip' && f.required) {
      const v = inputs[f.param] as { url?: string }[] | undefined
      if (!v?.[0]?.url) return false
    }
  }
  return true
}

export function DynamicGenerator({ config, fxRate }: Props) {
  // 이스케이프 해치: 등록된 전용 폼이 있으면 그것을 사용
  const Custom = config.customForm ? customForms[config.customForm] : undefined
  if (Custom) return <Custom modelId={config.id} fxRate={fxRate} />

  return <GenericForm config={config} fxRate={fxRate} />
}

function GenericForm({ config }: Props) {
  const router = useRouter()
  const allFields = [...config.fields, ...config.advancedFields]
  const [inputs, setInputs] = useState<Record<string, unknown>>(() => seedDefaults(allFields))
  const [est, setEst] = useState<
    { billedUsd: number; krw: number; fxRate: number; breakdown: EstimateBreakdown } | null
  >(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const isVideo = config.output === 'VIDEO'

  function setParam(param: string, value: unknown) {
    setInputs((prev) => ({ ...prev, [param]: value }))
  }

  const runEstimate = useCallback(
    async (cur: Record<string, unknown>) => {
      const prompt = String(cur.prompt ?? '')
      if (!prompt.trim()) {
        setEst(null)
        return
      }
      const durationExtra =
        config.durationParam && cur[config.durationParam] !== undefined
          ? { duration_sec: Number(cur[config.durationParam]) }
          : {}
      const res = await estimateGeneration({ modelId: config.id, prompt, ...durationExtra })
      if (res.ok) {
        setEst({ billedUsd: res.billedUsd, krw: res.krw, fxRate: res.fxRate, breakdown: res.breakdown })
        setError(null)
      } else {
        setEst(null)
      }
    },
    [config.id, config.durationParam],
  )

  // 입력 변경 후 다음 틱에 견적을 갱신 (effect 본문 내 동기 setState 회피)
  function scheduleEstimate(next: Record<string, unknown>) {
    queueMicrotask(() => void runEstimate(next))
  }

  // select/int 변경 시 재견적 (prompt는 onBlur로 트리거)
  const estDeps = [
    config.durationParam ? inputs[config.durationParam] : undefined,
    ...allFields
      .filter((f) => f.kind === 'select' || f.kind === 'int')
      .map((f) => inputs[(f as { param: string }).param]),
  ]
  useEffect(() => {
    scheduleEstimate(inputs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, estDeps)

  async function onGenerate() {
    setLoading(true)
    setError(null)
    const res = await createGeneration(config.id, inputs)
    setLoading(false)
    if (res.ok) {
      router.push(`/library/${res.generationId}`)
    } else {
      setError(res.message)
    }
  }

  function renderField(f: FieldType, key: number) {
    switch (f.kind) {
      case 'prompt':
        return (
          <PromptField
            key={key}
            value={inputs.prompt as string}
            onChange={(v) => setParam('prompt', v)}
            onBlur={() => scheduleEstimate(inputs)}
            required={f.required !== false}
          />
        )
      case 'negative_prompt':
        return (
          <NegativePromptField
            key={key}
            value={inputs.negative_prompt as string}
            onChange={(v) => setParam('negative_prompt', v)}
          />
        )
      case 'select':
        return (
          <SelectField
            key={key}
            label={f.label}
            options={f.options}
            value={inputs[f.param] as string | undefined}
            onChange={(v) => setParam(f.param, v)}
          />
        )
      case 'int':
        return (
          <IntField
            key={key}
            label={f.label}
            options={f.options}
            min={f.min}
            max={f.max}
            value={inputs[f.param] as number | undefined}
            onChange={(v) => setParam(f.param, v)}
          />
        )
      case 'toggle':
        return (
          <ToggleField
            key={key}
            label={f.label}
            value={inputs[f.param] as boolean | undefined}
            onChange={(v) => setParam(f.param, v)}
          />
        )
      case 'image':
        return (
          <ImageInputField
            key={key}
            label={f.label}
            required={f.required}
            value={inputs[f.param] as string | undefined}
            onChange={(v) => setParam(f.param, v)}
          />
        )
      case 'images':
        return (
          <ImagesInputField
            key={key}
            label={f.label}
            max={f.max}
            value={inputs[f.param] as string[] | undefined}
            onChange={(v) => setParam(f.param, v)}
          />
        )
      case 'video_clip':
        return (
          <VideoClipField
            key={key}
            label={f.label}
            required={f.required}
            value={inputs[f.param] as { url: string; start: number; ends: number; fps: number }[] | undefined}
            onChange={(v) => setParam(f.param, v)}
          />
        )
      default:
        return null
    }
  }

  const complete = isComplete(allFields, inputs)

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">{config.displayName}</h1>

        {config.fields.map((f, i) => renderField(f, i))}

        {config.advancedFields.length > 0 && (
          <div className="rounded-md border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-[var(--text-muted)]"
            >
              <span>고급 설정</span>
              <span className="text-[var(--text-dim)]">{advancedOpen ? '▲' : '▼'}</span>
            </button>
            {advancedOpen && (
              <div className="space-y-4 px-3 pb-3">
                {config.advancedFields.map((f, i) => renderField(f, 1000 + i))}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-[var(--danger)] text-sm">{error}</p>}

        <button
          onClick={onGenerate}
          disabled={loading || !complete}
          className="w-full py-2.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--text-primary)]"
        >
          {loading
            ? isVideo
              ? '작업 등록 중…'
              : '생성 중… (최대 30초)'
            : est
              ? `✨ 생성하기 — ${formatKrw(est.krw)}`
              : '✨ 생성하기'}
        </button>

        {est && (
          <div className="space-y-0.5 text-xs text-[var(--text-dim)]">
            <p>
              {config.displayName} · {formatUsd(est.breakdown.unitUsd)}/{est.breakdown.unitLabel} ×{' '}
              {est.breakdown.units}
              {est.breakdown.unitLabel} + 마진 {est.breakdown.marginPct}% ={' '}
              {formatUsd(est.breakdown.billedUsd)} ≈ {formatKrw(est.krw)}
            </p>
            <p>
              현재 환율 1USD = {est.fxRate.toLocaleString('ko-KR')}₩ · 생성 후 차감됩니다
            </p>
          </div>
        )}

        {isVideo && (
          <p className="text-xs text-[var(--text-dim)]">
            영상은 생성에 시간이 걸립니다. 등록 후 라이브러리에서 완료를 확인하세요(자동 갱신).
          </p>
        )}
      </div>

      <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] min-h-[300px] flex items-center justify-center text-[var(--text-dim)] text-sm">
        {loading
          ? isVideo
            ? '영상 작업을 등록하고 있습니다…'
            : '이미지를 생성하고 있습니다…'
          : isVideo
            ? '등록 후 라이브러리에서 결과를 확인합니다'
            : '생성 결과가 여기에 표시됩니다'}
      </div>
    </div>
  )
}
