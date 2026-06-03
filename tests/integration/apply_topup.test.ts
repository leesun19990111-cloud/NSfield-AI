import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'

const pg = new Client({ connectionString: process.env.DIRECT_URL })
beforeAll(async () => { await pg.connect() })
afterAll(async () => { await pg.end() })

describe('apply_topup (real DB, rolled back)', () => {
  it('승인 시 PENDING→APPROVED + 잔액 적립, 재승인은 차단', async () => {
    await pg.query('BEGIN')
    try {
      const uId = '55555555-5555-5555-5555-555555555555'
      const aId = '66666666-6666-6666-6666-666666666666'
      const wId = 'w-' + uId
      const rId = 'r-' + uId
      await pg.query(`insert into users(id,email,topup_code,role) values ($1,$2,'TPA1','USER'),($3,$4,'ADM1','ADMIN')`,
        [uId, `tpa_${Date.now()}@x.com`, aId, `adm_${Date.now()}@x.com`])
      await pg.query(`insert into wallets(id,user_id,balance_krw,updated_at) values ($1,$2,0,now())`, [wId, uId])
      await pg.query(`insert into topup_requests(id,user_id,amount_krw,depositor_name,transferred_at,status)
                      values ($1,$2,50000,'A',now(),'PENDING')`, [rId, uId])

      await pg.query(`select apply_topup($1,$2)`, [rId, aId])

      const w = await pg.query(`select balance_krw from wallets where id=$1`, [wId])
      expect(w.rows[0].balance_krw).toBe(50000)
      const r = await pg.query(`select status from topup_requests where id=$1`, [rId])
      expect(r.rows[0].status).toBe('APPROVED')

      // 재승인 차단 (마지막 작업 — 이후 트랜잭션 abort)
      await expect(pg.query(`select apply_topup($1,$2)`, [rId, aId]))
        .rejects.toThrow(/TOPUP_NOT_PENDING/)
    } finally {
      await pg.query('ROLLBACK')
    }
  })
})
