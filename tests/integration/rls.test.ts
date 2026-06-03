import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'

const pg = new Client({ connectionString: process.env.DIRECT_URL })

beforeAll(async () => {
  await pg.connect()
})
afterAll(async () => {
  await pg.end()
})

describe('RLS 정책', () => {
  it('모든 대상 테이블에 RLS가 활성화되어 있다', async () => {
    const tables = [
      'users',
      'wallets',
      'wallet_transactions',
      'topup_requests',
      'generations',
      'models',
      'fx_rates',
      'admin_actions',
    ]
    const res = await pg.query(
      `select c.relname, c.relrowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1) and c.relkind = 'r'`,
      [tables],
    )
    expect(res.rowCount).toBe(tables.length)
    for (const row of res.rows) {
      expect(row.relrowsecurity, `${row.relname} RLS 활성화`).toBe(true)
    }
  })

  it('기대한 모든 정책이 존재한다', async () => {
    const expected: Record<string, string[]> = {
      users: ['users_self_select', 'users_self_update'],
      wallets: ['wallets_self_select'],
      wallet_transactions: ['wtx_self_select'],
      topup_requests: ['topup_self_select', 'topup_self_insert'],
      generations: ['gen_self_select', 'gen_self_insert'],
      models: ['models_read', 'models_admin_write'],
      fx_rates: ['fx_read', 'fx_admin_write'],
      admin_actions: ['admin_actions_admin'],
    }
    const res = await pg.query(
      `select tablename, policyname from pg_policies where schemaname = 'public'`,
    )
    const found = new Map<string, Set<string>>()
    for (const r of res.rows) {
      if (!found.has(r.tablename)) found.set(r.tablename, new Set())
      found.get(r.tablename)!.add(r.policyname)
    }
    for (const [table, policies] of Object.entries(expected)) {
      for (const p of policies) {
        expect(found.get(table)?.has(p), `${table}.${p} 정책 존재`).toBe(true)
      }
    }
  })

  it('is_admin() 헬퍼가 SECURITY DEFINER로 존재한다', async () => {
    const res = await pg.query(
      `select prosecdef from pg_proc where proname = 'is_admin'`,
    )
    expect(res.rowCount).toBeGreaterThanOrEqual(1)
    expect(res.rows[0].prosecdef).toBe(true)
  })

  it('authenticated 역할 + JWT claims로 사용자는 자기 wallet만 SELECT 가능 (교차 격리 강제)', async () => {
    await pg.query('BEGIN')
    try {
      const uA = '33333333-3333-3333-3333-333333333333'
      const uB = '44444444-4444-4444-4444-444444444444'
      const ts = Date.now()
      await pg.query(
        `insert into users(id,email,topup_code) values ($1,$2,$3),($4,$5,$6)`,
        [uA, `rlsa_${ts}@x.com`, `R${ts % 1000}A`, uB, `rlsb_${ts}@x.com`, `R${ts % 1000}B`],
      )
      await pg.query(
        `insert into wallets(id,user_id,balance_krw,updated_at)
         values ($1,$2,100,now()),($3,$4,200,now())`,
        ['w-' + uA, uA, 'w-' + uB, uB],
      )

      // 유저 A의 JWT claims + authenticated 역할로 전환
      await pg.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: uA, role: 'authenticated' }),
      ])
      await pg.query(`set local role authenticated`)

      const rows = await pg.query('select user_id from wallets')

      // RLS가 유저 A의 wallet만 반환해야 한다
      expect(rows.rows.every((r) => r.user_id === uA)).toBe(true)
      expect(rows.rowCount).toBe(1)

      await pg.query(`reset role`)
    } finally {
      await pg.query('ROLLBACK')
    }
  })

  it('authenticated 역할로 models는 모두 읽기 가능, fx_rates도 읽기 가능', async () => {
    await pg.query('BEGIN')
    try {
      const uA = '33333333-3333-3333-3333-333333333333'
      await pg.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: uA, role: 'authenticated' }),
      ])
      await pg.query(`set local role authenticated`)
      // 정책이 select using(true)이므로 권한 오류 없이 쿼리가 성공해야 한다
      await expect(pg.query('select count(*) from models')).resolves.toBeTruthy()
      await expect(pg.query('select count(*) from fx_rates')).resolves.toBeTruthy()
      await pg.query(`reset role`)
    } finally {
      await pg.query('ROLLBACK')
    }
  })
})
