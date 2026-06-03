import { prisma } from '@/lib/db/prisma'
import { createAdminClient } from '@/lib/supabase/admin'

// 핵심 테이블을 JSON으로 백업. 날짜는 호출자가 주입(테스트 결정성). 결과물 result_urls 등 대용량은 제외, 메타만.
export async function runBackup(dateStr: string): Promise<{ path: string; counts: Record<string, number> }> {
  const [wallets, walletTransactions, topupRequests, generations, adminActions] = await Promise.all([
    prisma.wallet.findMany(),
    prisma.walletTransaction.findMany(),
    prisma.topupRequest.findMany(),
    // generation은 메타만(프롬프트/비용/상태). result_urls는 제외해 용량 절약.
    prisma.generation.findMany({
      select: { id: true, user_id: true, model_id: true, kind: true, status: true, prompt: true,
        cost_usd_raw: true, cost_usd_billed: true, margin_pct: true, fx_rate: true, charged_krw: true,
        created_at: true, finished_at: true, expires_at: true },
    }),
    prisma.adminAction.findMany(),
  ])

  const payload = {
    backed_up_at: dateStr,
    counts: {
      wallets: wallets.length, wallet_transactions: walletTransactions.length,
      topup_requests: topupRequests.length, generations: generations.length, admin_actions: adminActions.length,
    },
    data: { wallets, walletTransactions, topupRequests, generations, adminActions },
  }

  const supabase = createAdminClient()
  const path = `backups/${dateStr}.json`
  // Decimal/Date 직렬화: JSON.stringify가 Date는 ISO로, Prisma Decimal은 toJSON 보유
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  const { error } = await supabase.storage.from('generations').upload(path, body, { contentType: 'application/json', upsert: true })
  if (error) throw new Error('BACKUP_UPLOAD_FAILED: ' + error.message)

  return { path, counts: payload.counts }
}
