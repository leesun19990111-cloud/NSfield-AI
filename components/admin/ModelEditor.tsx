'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateModel } from '@/lib/actions/admin-models'
import { estimateRawUsd, estimateBilledUsd } from '@/lib/models/pricing'
import { formatUsdPrecise, formatKrw } from '@/components/common/MoneyText'
import { usdToKrw } from '@/lib/money/format'
import type { ModelMeta, PricingJson } from '@/lib/models/types'

type EditorModel = {
  id: string
  kind: string
  provider: string
  display_name: string
  is_active: boolean
  margin_pct: number
  pricing_json: unknown
}

type SimRow = { label: string; baseUsd: number; billedUsd: number }

function buildSimRows(
  meta: ModelMeta,
): { rows: SimRow[]; error: string | null } {
  const p = meta.pricing_json
  try {
    if (p.kind === 'per_image') {
      const params = { prompt: 'x', count: 1 }
      return {
        rows: [
          {
            label: '이미지 1장',
            baseUsd: estimateRawUsd(meta, params),
            billedUsd: estimateBilledUsd(meta, params),
          },
        ],
        error: null,
      }
    }
    if (p.kind === 'per_token') {
      const params = { prompt: 'x', tokens: 1 }
      return {
        rows: [
          {
            label: '토큰 1개',
            baseUsd: estimateRawUsd(meta, params),
            billedUsd: estimateBilledUsd(meta, params),
          },
        ],
        error: null,
      }
    }
    // per_second / per_video_fixed: one row per allowed duration
    const durations = p.options.allowed_durations_sec
    const rows = durations.map((d) => {
      const params = { prompt: 'x', duration_sec: d }
      return {
        label: `${d}초`,
        baseUsd: estimateRawUsd(meta, params),
        billedUsd: estimateBilledUsd(meta, params),
      }
    })
    return { rows, error: null }
  } catch {
    return { rows: [], error: '가격 규칙으로 청구액을 계산할 수 없습니다.' }
  }
}

// JSON 파싱 없이 기본 단가를 한눈에 보여주기 위한 힌트 (per_video_fixed는 tiers라 단가 없음)
function detectBaseRate(p: PricingJson): { kind: string; usdPerUnit: number | null } {
  if (p.kind === 'per_video_fixed') return { kind: p.kind, usdPerUnit: null }
  return { kind: p.kind, usdPerUnit: p.usd_per_unit }
}

export function ModelEditor({ model, fxRate }: { model: EditorModel; fxRate: number }) {
  const router = useRouter()
  const [displayName, setDisplayName] = useState(model.display_name)
  const [isActive, setIsActive] = useState(model.is_active)
  const [marginPct, setMarginPct] = useState(String(model.margin_pct))
  const [pricingText, setPricingText] = useState(
    JSON.stringify(model.pricing_json, null, 2),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  // Live simulator — parse current textarea + margin, run the SAME pricing engine.
  const sim = useMemo(() => {
    let parsedPricing: PricingJson
    try {
      parsedPricing = JSON.parse(pricingText) as PricingJson
    } catch {
      return { rows: [] as SimRow[], error: 'JSON 형식이 올바르지 않습니다.' }
    }
    const margin = Number(marginPct)
    if (!Number.isFinite(margin)) {
      return { rows: [] as SimRow[], error: '마진을 숫자로 입력하세요.' }
    }
    const meta: ModelMeta = {
      id: model.id,
      kind: model.kind === 'VIDEO' ? 'VIDEO' : 'IMAGE',
      display_name: displayName,
      provider: model.provider,
      is_active: isActive,
      margin_pct: margin,
      pricing_json: parsedPricing,
    }
    return buildSimRows(meta)
  }, [pricingText, marginPct, model.id, model.kind, model.provider, displayName, isActive])

  // JSON 파싱 없이 기본 단가(kind + usd_per_unit) 힌트
  const baseRate = useMemo(() => {
    try {
      return detectBaseRate(JSON.parse(pricingText) as PricingJson)
    } catch {
      return null
    }
  }, [pricingText])

  const marginNum = Number(marginPct) || 0

  async function onSave() {
    setError(null)
    setOk(false)
    let pricing_json: unknown
    try {
      pricing_json = JSON.parse(pricingText)
    } catch {
      setError('가격 규칙 JSON 형식이 올바르지 않습니다.')
      return
    }
    setBusy(true)
    const res = await updateModel(model.id, {
      display_name: displayName.trim(),
      is_active: isActive,
      margin_pct: Number(marginPct),
      // server re-validates with zod; pass through the parsed object
      pricing_json: pricing_json as never,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.message)
      return
    }
    setOk(true)
    router.refresh()
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm text-[var(--text-muted)]">표시 이름</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-[var(--bg)] border border-[var(--border)] text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="is_active"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <label htmlFor="is_active" className="text-sm">활성</label>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-[var(--text-muted)]">마진 (%)</label>
          <input
            type="number"
            inputMode="decimal"
            value={marginPct}
            onChange={(e) => setMarginPct(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-[var(--bg)] border border-[var(--border)] text-sm font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-[var(--text-muted)]">가격 규칙 (JSON)</label>
          {baseRate && (
            <p className="text-xs text-[var(--text-dim)] font-mono">
              kind: {baseRate.kind}
              {baseRate.usdPerUnit !== null
                ? ` · usd_per_unit ${formatUsdPrecise(baseRate.usdPerUnit)}`
                : ' · tiers (구간별 고정가)'}
            </p>
          )}
          <textarea
            value={pricingText}
            onChange={(e) => setPricingText(e.target.value)}
            rows={14}
            spellCheck={false}
            className="w-full px-3 py-2 rounded-md bg-[var(--bg)] border border-[var(--border)] text-xs font-mono"
          />
        </div>

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        {ok && <p className="text-sm text-[var(--success,#22c55e)]">저장되었습니다.</p>}

        <button
          disabled={busy}
          onClick={onSave}
          className="px-4 py-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm disabled:opacity-50"
        >
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>

      <div className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] p-4 space-y-3 h-fit">
        <div className="text-sm font-semibold text-[var(--text-muted)]">
          가격 시뮬레이터
        </div>
        <div className="text-xs text-[var(--text-dim)] space-y-0.5">
          <p>사용자 청구가 = AtlasCloud 원가 × (1 + 마진%). 아래는 Generate 버튼에 표기될 값과 동일합니다.</p>
          <p>마진 {marginNum}% · 환율 1 USD ≈ {formatKrw(fxRate)}</p>
        </div>
        {sim.error ? (
          <p className="text-sm text-[var(--danger)]">{sim.error}</p>
        ) : sim.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-dim)]">표시할 항목이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[var(--text-muted)] text-left">
              <tr className="border-b border-[var(--border)]">
                <th className="py-1.5">단위</th>
                <th className="text-right">원가</th>
                <th className="text-right">사용자가</th>
                <th className="text-right">≈ ₩</th>
              </tr>
            </thead>
            <tbody>
              {sim.rows.map((r) => (
                <tr key={r.label} className="border-b border-[var(--border)]">
                  <td className="py-1.5">{r.label}</td>
                  <td className="text-right font-mono text-[var(--text-dim)]">
                    {formatUsdPrecise(r.baseUsd)}
                  </td>
                  <td className="text-right font-mono">
                    {formatUsdPrecise(r.billedUsd)}
                  </td>
                  <td className="text-right font-mono text-[var(--text-dim)]">
                    {formatKrw(usdToKrw(r.billedUsd, fxRate))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
