import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Client } from 'pg'

const userId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const adminId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeef'
const walletId = 'w-' + userId
const genId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01'
const CHARGED = 690

// 인증만 모킹 (prisma/audit는 실제 DB 사용)
vi.mock('@/lib/auth/guards', () => ({
  requireAdmin: vi.fn(async () => ({
    id: adminId, email: 'refund-admin@x.com', role: 'ADMIN', display_name: null, topup_code: 'REFA',
  })),
  requireUser: vi.fn(),
}))

// Vitest 환경엔 Next 요청 컨텍스트가 없어 revalidatePath 부수효과만 모킹
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { forceRefund } from '@/lib/actions/admin-generations'

const pg = new Client({ connectionString: process.env.DIRECT_URL })

beforeAll(async () => {
  await pg.connect()
  await pg.query(
    `insert into users(id,email,topup_code,role) values ($1,$2,'REFU','USER'),($3,$4,'REFA','ADMIN')
     on conflict (id) do nothing`,
    [userId, `ref_${Date.now()}@x.com`, adminId, `refa_${Date.now()}@x.com`],
  )
  await pg.query(
    `insert into wallets(id,user_id,balance_krw,updated_at) values ($1,$2,0,now())
     on conflict (id) do update set balance_krw=0`,
    [walletId, userId],
  )
  await pg.query(
    `insert into generations(id,user_id,model_id,kind,prompt,params_json,status,charged_krw,created_at,finished_at)
     values ($1,$2,'mock-image','IMAGE','강제 환불 테스트','{}'::jsonb,'SUCCEEDED',$3,now(),now())
     on conflict (id) do update set status='SUCCEEDED', charged_krw=$3`,
    [genId, userId, CHARGED],
  )
})

afterAll(async () => {
  await pg.query(`delete from admin_actions where admin_id=$1 or target_id=$2`, [adminId, genId])
  await pg.query(`delete from wallet_transactions where wallet_id=$1`, [walletId])
  await pg.query(`delete from generations where id=$1`, [genId])
  await pg.query(`delete from wallets where id=$1`, [walletId])
  await pg.query(`delete from users where id in ($1,$2)`, [userId, adminId])
  await pg.end()
  vi.restoreAllMocks()
})

describe('forceRefund (real DB)', () => {
  it('REFUND 시 잔액 +charged + 원장 기록 + 감사로그, 재시도 시 중복 방지', async () => {
    const before = await pg.query(`select balance_krw from wallets where id=$1`, [walletId])
    const startBalance = before.rows[0].balance_krw

    // 1차 환불 → 성공
    const res = await forceRefund(genId, '테스트 환불')
    expect(res.ok).toBe(true)

    const after = await pg.query(`select balance_krw from wallets where id=$1`, [walletId])
    expect(after.rows[0].balance_krw).toBe(startBalance + CHARGED)

    const tx = await pg.query(
      `select amount_krw, balance_after from wallet_transactions
       where wallet_id=$1 and type='REFUND' and ref_type='generation' and ref_id=$2`,
      [walletId, genId],
    )
    expect(tx.rows).toHaveLength(1)
    expect(tx.rows[0].amount_krw).toBe(CHARGED)

    const a = await pg.query(
      `select count(*)::int as n from admin_actions
       where admin_id=$1 and action='force_refund' and target_id=$2`,
      [adminId, genId],
    )
    expect(a.rows[0].n).toBeGreaterThanOrEqual(1)

    // 2차 환불 → 중복 방지 거부, 잔액 불변
    const res2 = await forceRefund(genId, '테스트 환불 재시도')
    expect(res2.ok).toBe(false)
    if (!res2.ok) expect(res2.message).toContain('이미 환불')

    const after2 = await pg.query(`select balance_krw from wallets where id=$1`, [walletId])
    expect(after2.rows[0].balance_krw).toBe(startBalance + CHARGED)

    // REFUND 원장은 여전히 1건만
    const tx2 = await pg.query(
      `select count(*)::int as n from wallet_transactions
       where wallet_id=$1 and type='REFUND' and ref_type='generation' and ref_id=$2`,
      [walletId, genId],
    )
    expect(tx2.rows[0].n).toBe(1)
  })
})
