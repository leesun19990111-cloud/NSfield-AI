import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'

const client = new Client({ connectionString: process.env.DIRECT_URL })

beforeAll(async () => {
  await client.connect()
})
afterAll(async () => {
  await client.end()
})

describe('wallet_apply_tx (real DB, rolled back)', () => {
  it('충전/차감/음수차단 불변식', async () => {
    await client.query('BEGIN')
    try {
      const userId = '11111111-1111-1111-1111-111111111111'
      const walletId = '22222222-2222-2222-2222-222222222222'
      await client.query(
        `insert into users(id, email, topup_code) values ($1,$2,$3)`,
        [userId, `t_${Date.now()}@x.com`, 'TST1'],
      )
      await client.query(
        `insert into wallets(id, user_id, balance_krw, updated_at) values ($1,$2,0,now())`,
        [walletId, userId],
      )

      // 1) TOPUP +30000 → 30000
      await client.query(
        `select wallet_apply_tx($1,'TOPUP',30000,'topup_request',null,null)`,
        [walletId],
      )
      let bal = await client.query(`select balance_krw from wallets where id=$1`, [walletId])
      expect(bal.rows[0].balance_krw).toBe(30000)

      // 2) CHARGE -690 → 29310
      await client.query(
        `select wallet_apply_tx($1,'CHARGE',-690,'generation',null,null)`,
        [walletId],
      )
      bal = await client.query(`select balance_krw from wallets where id=$1`, [walletId])
      expect(bal.rows[0].balance_krw).toBe(29310)

      // 3) over-draw → INSUFFICIENT_BALANCE
      await expect(
        client.query(`select wallet_apply_tx($1,'CHARGE',-99999,'generation',null,null)`, [walletId]),
      ).rejects.toThrow(/INSUFFICIENT_BALANCE/)
    } finally {
      await client.query('ROLLBACK')
    }
  })
})
