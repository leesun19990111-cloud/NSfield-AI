import Link from 'next/link'
import { getSessionUser } from '@/lib/auth/session'
import { listMyTopups } from '@/lib/actions/topup'
import { TopupForm } from '@/components/wallet/TopupForm'
import { MyTopupList } from '@/components/wallet/MyTopupList'

export default async function TopupPage() {
  const user = await getSessionUser()
  const topups = await listMyTopups()
  const bankName = process.env.NEXT_PUBLIC_BANK_NAME ?? '은행 미설정'
  const bankAccount = process.env.NEXT_PUBLIC_BANK_ACCOUNT ?? '000-0000-0000-00'
  const bankHolder = process.env.NEXT_PUBLIC_BANK_HOLDER ?? '예금주 미설정'
  return (
    <div className="max-w-lg space-y-6">
      <Link href="/wallet" className="text-sm text-[var(--text-muted)]">← 지갑</Link>
      <h1 className="text-xl font-bold">충전하기</h1>

      <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] p-5 text-sm space-y-1">
        <div className="font-semibold mb-2">1) 아래 계좌로 입금해주세요</div>
        <div>은행: {bankName}</div>
        <div>계좌: {bankAccount}</div>
        <div>예금주: {bankHolder}</div>
        <p className="text-[var(--text-dim)] mt-3">
          ⓘ 입금자명 뒤에 식별 코드 <span className="font-mono text-[var(--accent)]">{user!.topup_code}</span> 를
          붙이면 처리가 빨라집니다.
        </p>
      </div>

      <div>
        <div className="font-semibold text-sm mb-3">2) 입금 정보 입력</div>
        <TopupForm topupCode={user!.topup_code} />
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-3">내 충전 요청 내역</h2>
        <MyTopupList items={topups} />
      </div>
    </div>
  )
}
