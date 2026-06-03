import { describe, it, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)
let createdUserId: string | null = null

afterAll(async () => {
  // 테스트 유저 정리: auth.users 삭제 + public.users 정리
  if (createdUserId) {
    await admin.auth.admin.deleteUser(createdUserId)
    const cleanup = new Client({ connectionString: process.env.DIRECT_URL })
    await cleanup.connect()
    try {
      await cleanup.query('delete from wallets where user_id=$1', [createdUserId])
      await cleanup.query('delete from users where id=$1', [createdUserId])
    } finally {
      await cleanup.end()
    }
  }
})

describe('on_auth_user_created trigger (real DB)', () => {
  it('새 auth 유저 생성 시 users + wallet + topup_code 자동 생성', async () => {
    const email = `trigger_${Date.now()}@example.com`
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: 'Test1234!',
      email_confirm: true,
    })
    expect(error).toBeNull()
    createdUserId = data.user!.id

    const pg = new Client({ connectionString: process.env.DIRECT_URL })
    await pg.connect()
    try {
      const u = await pg.query(
        'select id, email, topup_code, display_name from users where id=$1',
        [createdUserId],
      )
      expect(u.rowCount).toBe(1)
      expect(u.rows[0].email).toBe(email)
      expect(u.rows[0].topup_code).toMatch(/^[A-Z0-9]{4}$/)

      const w = await pg.query('select balance_krw from wallets where user_id=$1', [createdUserId])
      expect(w.rowCount).toBe(1)
      expect(w.rows[0].balance_krw).toBe(0)
    } finally {
      await pg.end()
    }
  })
})
