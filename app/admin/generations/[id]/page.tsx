import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getGenerationAdmin, isGenerationRefunded } from '@/lib/actions/admin-generations'
import { ForceRefundButton } from '@/components/admin/ForceRefundButton'
import { MoneyText, formatKrw } from '@/components/common/MoneyText'

const genStatusLabel: Record<string, string> = {
  PENDING: '대기', RUNNING: '진행', SUCCEEDED: '완료', FAILED: '실패', CANCELED: '취소',
}

function fmt(d: Date | null): string {
  return d ? new Date(d).toLocaleString('ko-KR') : '—'
}

export default async function AdminGenerationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const gen = await getGenerationAdmin(id)
  if (!gen) notFound()
  const alreadyRefunded = await isGenerationRefunded(id)
  const canRefund = gen.charged_krw != null && gen.charged_krw > 0

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="space-y-1">
          <Link href="/admin/generations" className="text-xs text-[var(--text-dim)] hover:text-[var(--text-muted)]">
            ← 생성 모니터
          </Link>
          <h1 className="text-xl font-bold">{gen.model_id}</h1>
          <div className="text-sm text-[var(--text-muted)]">
            {gen.user.display_name ?? gen.user.email}
            <span className="text-[var(--text-dim)] ml-3">{gen.user.email}</span>
          </div>
          <div className="text-sm">
            <span className="mr-3">종류 {gen.kind}</span>
            <span>상태 {genStatusLabel[gen.status] ?? gen.status}</span>
          </div>
        </div>
        {canRefund && (
          <ForceRefundButton
            genId={gen.id}
            charged_krw={gen.charged_krw!}
            alreadyRefunded={alreadyRefunded}
          />
        )}
      </div>

      <section className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] p-4">
        <h2 className="text-sm font-semibold mb-3 text-[var(--text-muted)]">비용</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="text-xs text-[var(--text-dim)]">원가 (USD)</dt>
            <dd className="font-mono">{gen.cost_usd_raw != null ? `$${Number(gen.cost_usd_raw).toFixed(4)}` : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-dim)]">표기 (USD)</dt>
            <dd className="font-mono">{gen.cost_usd_billed != null ? `$${Number(gen.cost_usd_billed).toFixed(4)}` : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-dim)]">환율 (KRW/USD)</dt>
            <dd className="font-mono">{gen.fx_rate != null ? Number(gen.fx_rate).toLocaleString('ko-KR') : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-dim)]">차감 금액</dt>
            <dd>
              {gen.charged_krw != null ? (
                <MoneyText krw={gen.charged_krw} usd={gen.cost_usd_billed != null ? Number(gen.cost_usd_billed) : undefined} />
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>
        {alreadyRefunded && (
          <p className="mt-3 text-xs text-[var(--warning)]">이 생성은 이미 환불되었습니다 ({formatKrw(gen.charged_krw ?? 0)}).</p>
        )}
      </section>

      <section className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] p-4">
        <h2 className="text-sm font-semibold mb-3 text-[var(--text-muted)]">타임라인</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs text-[var(--text-dim)]">생성</dt>
            <dd className="font-mono text-xs">{fmt(gen.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-dim)]">시작</dt>
            <dd className="font-mono text-xs">{fmt(gen.started_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-dim)]">완료</dt>
            <dd className="font-mono text-xs">{fmt(gen.finished_at)}</dd>
          </div>
        </dl>
        {gen.external_job_id && (
          <div className="mt-3 text-xs">
            <span className="text-[var(--text-dim)]">외부 작업 ID </span>
            <span className="font-mono">{gen.external_job_id}</span>
          </div>
        )}
        {gen.failed_reason && (
          <div className="mt-3 text-xs text-[var(--danger)]">실패 사유: {gen.failed_reason}</div>
        )}
      </section>

      <section className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] p-4">
        <h2 className="text-sm font-semibold mb-3 text-[var(--text-muted)]">프롬프트</h2>
        <p className="text-sm whitespace-pre-wrap break-words">{gen.prompt}</p>
      </section>

      {gen.result_urls.length > 0 && (
        <section className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold mb-3 text-[var(--text-muted)]">결과 ({gen.result_urls.length})</h2>
          <ul className="space-y-1 text-sm">
            {gen.result_urls.map((url, i) => (
              <li key={i}>
                <a href={url} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline break-all font-mono text-xs">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {gen.result_meta_json != null && (
        <details className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] p-4">
          <summary className="text-sm font-semibold text-[var(--text-muted)] cursor-pointer">외부 응답 (result_meta_json)</summary>
          <pre className="mt-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words">
            {JSON.stringify(gen.result_meta_json, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}
