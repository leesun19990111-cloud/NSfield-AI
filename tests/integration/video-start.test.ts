import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Client } from 'pg'

const uId = '88888888-8888-8888-8888-888888888888'
const wId = 'w-' + uId
const fxId = `fx-vid-${Date.now()}`

vi.mock('@/lib/auth/guards', () => ({
  requireUser: vi.fn(async () => ({ id: uId, email: 'v@x.com', role: 'USER', display_name: null, topup_code: 'VIDU' })),
  requireAdmin: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createVideoGeneration } from '@/lib/actions/generation'

const pg = new Client({ connectionString: process.env.DIRECT_URL })

beforeAll(async () => {
  await pg.connect()
  await pg.query(`delete from rate_limits where user_id=$1`, [uId])
  await pg.query(`insert into users(id,email,topup_code,role) values ($1,$2,'VIDU','USER') on conflict (id) do nothing`, [uId, `vid_${Date.now()}@x.com`])
  await pg.query(`insert into wallets(id,user_id,balance_krw,updated_at) values ($1,$2,100000,now()) on conflict (id) do nothing`, [wId, uId])
  await pg.query(`insert into fx_rates(id,pair,rate,source,fetched_at) values ($1,'USDKRW',1380,'test',now())`, [fxId])
  await pg.query(`insert into models(id,kind,display_name,provider,is_active,margin_pct,pricing_json)
    values ('mock-video','VIDEO','Mock Video','mock',true,10,'{"kind":"per_video_fixed","tiers":{"5":0.45,"10":0.82},"options":{"allowed_durations_sec":[5,10],"polling_interval_sec":60}}'::jsonb)
    on conflict (id) do update set is_active=true`)
})
afterAll(async () => {
  await pg.query(`delete from rate_limits where user_id=$1`, [uId])
  await pg.query(`delete from wallet_transactions where wallet_id=$1`, [wId])
  await pg.query(`delete from generations where user_id=$1`, [uId])
  await pg.query(`delete from wallets where id=$1`, [wId])
  await pg.query(`delete from users where id=$1`, [uId])
  await pg.query(`delete from fx_rates where id=$1`, [fxId])
  await pg.query(`delete from models where id='mock-video'`)
  await pg.end(); vi.restoreAllMocks()
})

describe('createVideoGeneration (mock-video, real DB)', () => {
  it('hold 차감 + RUNNING + external_job_id', async () => {
    const before = await pg.query(`select balance_krw from wallets where id=$1`, [wId])
    const res = await createVideoGeneration({ modelId: 'mock-video', prompt: '파도', duration_sec: 5 })
    expect(res.ok).toBe(true)
    const after = await pg.query(`select balance_krw from wallets where id=$1`, [wId])
    expect(after.rows[0].balance_krw).toBeLessThan(before.rows[0].balance_krw)
    if (res.ok) {
      const g = await pg.query(`select status, external_job_id, charged_krw from generations where id=$1`, [res.generationId])
      expect(g.rows[0].status).toBe('RUNNING')
      expect(g.rows[0].external_job_id).toMatch(/^mock-done-/)
      expect(before.rows[0].balance_krw - after.rows[0].balance_krw).toBe(g.rows[0].charged_krw)
    }
  })
})
