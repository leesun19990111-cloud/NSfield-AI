import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Client } from 'pg'

const userId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const adminId = 'deadbeef-dddd-dddd-dddd-dddddddddddd'
const walletId = 'w-' + userId

// 인증만 모킹 (prisma/audit는 실제 DB 사용)
vi.mock('@/lib/auth/guards', () => ({
  requireAdmin: vi.fn(async () => ({
    id: adminId, email: 'adj-admin@x.com', role: 'ADMIN', display_name: null, topup_code: 'ADJA',
  })),
  requireUser: vi.fn(),
}))

// Vitest 환경엔 Next 요청 컨텍스트가 없어 revalidatePath 부수효과만 모킹
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { adjustBalance } from '@/lib/actions/admin-users'

const pg = new Client({ connectionString: process.env.DIRECT_URL })

beforeAll(async () => {
  await pg.connect()
  await pg.query(
    `insert into users(id,email,topup_code,role) values ($1,$2,'ADJU','USER'),($3,$4,'ADJA','ADMIN')
     on conflict (id) do nothing`,
    [userId, `adj_${Date.now()}@x.com`, adminId, `adja_${Date.now()}@x.com`],
  )
  await pg.query(
    `insert into wallets(id,user_id,balance_krw,updated_at) values ($1,$2,1000,now())
     on conflict (id) do update set balance_krw=1000`,
    [walletId, userId],
  )
})

afterAll(async () => {
  await pg.query(`delete from admin_actions where admin_id=$1 or target_id=$2`, [adminId, userId])
  await pg.query(`delete from wallet_transactions where wallet_id=$1`, [walletId])
  await pg.query(`delete from wallets where id=$1`, [walletId])
  await pg.query(`delete from users where id in ($1,$2)`, [userId, adminId])
  await pg.end()
  vi.restoreAllMocks()
})

describe('adjustBalance (real DB)', () => {
  it('ADJUSTMENT +5000 시 잔액 6000 + 원장 기록 + 감사로그', async () => {
    const res = await adjustBalance(userId, 5000, '보정')
    expect(res.ok).toBe(true)

    const w = await pg.query(`select balance_krw from wallets where id=$1`, [walletId])
    expect(w.rows[0].balance_krw).toBe(6000)

    const tx = await pg.query(
      `select amount_krw, balance_after from wallet_transactions
       where wallet_id=$1 and type='ADJUSTMENT' order by created_at desc limit 1`,
      [walletId],
    )
    expect(tx.rows[0].amount_krw).toBe(5000)
    expect(tx.rows[0].balance_after).toBe(6000)

    const a = await pg.query(
      `select count(*)::int as n from admin_actions
       where admin_id=$1 and action='adjust_balance' and target_id=$2`,
      [adminId, userId],
    )
    expect(a.rows[0].n).toBeGreaterThanOrEqual(1)
  })

  it('금액 0이면 거부 (잔액 불변)', async () => {
    const res = await adjustBalance(userId, 0, 'x')
    expect(res.ok).toBe(false)
    const w = await pg.query(`select balance_krw from wallets where id=$1`, [walletId])
    expect(w.rows[0].balance_krw).toBe(6000)
  })

  it('사유 누락이면 거부', async () => {
    const res = await adjustBalance(userId, 1000, '   ')
    expect(res.ok).toBe(false)
  })
})
