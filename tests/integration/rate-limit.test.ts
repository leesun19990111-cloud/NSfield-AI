import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'

const pg = new Client({ connectionString: process.env.DIRECT_URL })
const uId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

beforeAll(async () => {
  await pg.connect()
  await pg.query('delete from rate_limits where user_id = $1', [uId])
})
afterAll(async () => {
  await pg.query('delete from rate_limits where user_id = $1', [uId])
  await pg.end()
})

async function consume(action: string, limit: number, windowSec: number): Promise<boolean> {
  const r = await pg.query('select rate_limit_consume($1,$2,$3,$4) as ok', [uId, action, limit, windowSec])
  return r.rows[0].ok
}

describe('rate_limit_consume (real DB)', () => {
  it('limit=3, window=60: 처음 3회 true, 4회째 false', async () => {
    expect(await consume('test_action', 3, 60)).toBe(true)
    expect(await consume('test_action', 3, 60)).toBe(true)
    expect(await consume('test_action', 3, 60)).toBe(true)
    expect(await consume('test_action', 3, 60)).toBe(false)
  })

  it('다른 action 키는 독립적으로 카운트', async () => {
    expect(await consume('test_action_b', 3, 60)).toBe(true)
  })
})
