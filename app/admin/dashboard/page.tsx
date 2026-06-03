import Link from 'next/link'
import { getDashboardStats } from '@/lib/actions/admin-dashboard'
import { KpiCard } from '@/components/admin/KpiCard'
import { formatKrw } from '@/components/common/MoneyText'

export default async function AdminDashboardPage() {
  const s = await getDashboardStats()
  const maxDaily = Math.max(1, ...s.daily.map((d) => d.revenueKrw))
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">대시보드</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="오늘 매출" value={formatKrw(s.todayRevenueKrw)} />
        <KpiCard label="이번달 매출" value={formatKrw(s.monthRevenueKrw)} />
        <KpiCard label="대기 충전" value={`${s.pendingTopups}건`} sub={<Link href="/admin/topups" className="text-[var(--accent)]">보기</Link>} />
        <KpiCard label="진행 영상" value={`${s.runningVideos}건`} />
      </div>

      {(s.stuckVideos > 0 || s.topupsMissingCode > 0) && (
        <div className="rounded-xl border border-[var(--warning)] bg-[var(--bg-surface)] p-4 space-y-1">
          <div className="font-semibold text-[var(--warning)]">⚠ 주의 필요</div>
          {s.stuckVideos > 0 && <div className="text-sm">30분 초과 진행 중 영상 {s.stuckVideos}건 <Link href="/admin/generations?status=RUNNING" className="text-[var(--accent)]">확인</Link></div>}
          {s.topupsMissingCode > 0 && <div className="text-sm">식별코드 누락 충전 요청 {s.topupsMissingCode}건 <Link href="/admin/topups" className="text-[var(--accent)]">확인</Link></div>}
        </div>
      )}

      <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] p-4">
        <div className="text-sm font-semibold mb-3 text-[var(--text-muted)]">최근 7일 매출</div>
        <div className="flex items-end gap-2 h-32">
          {s.daily.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1">
              <div className="w-full bg-[var(--accent)] rounded-t" style={{ height: `${(d.revenueKrw / maxDaily) * 100}%` }} title={formatKrw(d.revenueKrw)} />
              <div className="text-[10px] text-[var(--text-dim)]">{d.date.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
