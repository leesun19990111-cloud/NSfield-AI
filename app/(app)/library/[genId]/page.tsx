import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getMyGeneration } from '@/lib/actions/library'
import { getSessionUser } from '@/lib/auth/session'
import { ResultViewer } from '@/components/library/ResultViewer'
import { GenerationLiveStatus } from '@/components/library/GenerationLiveStatus'
import { MoneyText } from '@/components/common/MoneyText'

export default async function GenerationDetailPage({ params }: { params: Promise<{ genId: string }> }) {
  const { genId } = await params
  const data = await getMyGeneration(genId)
  if (!data) notFound()
  const { gen, signedUrls } = data
  const user = await getSessionUser()
  return (
    <div className="space-y-4">
      {user && <GenerationLiveStatus userId={user.id} />}
      <Link href="/library" className="text-sm text-[var(--text-muted)]">← 라이브러리</Link>
      <div className="grid md:grid-cols-2 gap-6">
        <ResultViewer urls={signedUrls} status={gen.status} />
        <div className="space-y-3 text-sm">
          <div className="font-semibold">{gen.model_id} · {gen.kind === 'IMAGE' ? '이미지' : '영상'}</div>
          <div>상태: {gen.status}</div>
          {gen.charged_krw != null && (
            <div>차감: <MoneyText krw={gen.charged_krw} usd={gen.cost_usd_billed ? Number(gen.cost_usd_billed) : undefined} primary="krw" /></div>
          )}
          <div className="text-[var(--text-muted)]">프롬프트</div>
          <p className="text-[var(--text-primary)]">{gen.prompt}</p>
          {gen.expires_at && <div className="text-xs text-[var(--text-dim)]">만료: {new Date(gen.expires_at).toLocaleDateString('ko-KR')}</div>}
        </div>
      </div>
    </div>
  )
}
