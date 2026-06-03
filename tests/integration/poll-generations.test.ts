import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'

import { pollRunningVideoGenerations } from '@/lib/jobs/poll-generations'
import { deleteGenerationObjects } from '@/lib/storage/upload'

const uId = '99999999-9999-9999-9999-999999999999'
const wId = 'w-' + uId
const fxId = `fx-poll-${Date.now()}`
const genSuccessId = `gen-poll-ok-${Date.now()}`
const genTimeoutId = `gen-poll-to-${Date.now()}`

const pg = new Client({ connectionString: process.env.DIRECT_URL })

beforeAll(async () => {
  await pg.connect()
  await pg.query(`insert into users(id,email,topup_code,role) values ($1,$2,'POLU','USER') on conflict (id) do nothing`,
    [uId, `poll_${Date.now()}@x.com`])
  await pg.query(`insert into wallets(id,user_id,balance_krw,updated_at) values ($1,$2,100000,now()) on conflict (id) do nothing`, [wId, uId])
  await pg.query(`insert into fx_rates(id,pair,rate,source,fetched_at) values ($1,'USDKRW',1380,'test',now())`, [fxId])
  // 폴링 간격을 작게(1s) 두어 last_polled_at 유무와 무관하게 폴링되도록 함
  await pg.query(`insert into models(id,kind,display_name,provider,is_active,margin_pct,pricing_json)
    values ('mock-video','VIDEO','Mock Video','mock',true,10,'{"kind":"per_video_fixed","tiers":{"5":0.45,"10":0.82},"options":{"allowed_durations_sec":[5,10],"polling_interval_sec":1}}'::jsonb)
    on conflict (id) do update set is_active=true, pricing_json=excluded.pricing_json`)
})

afterAll(async () => {
  const gens = await pg.query(`select result_urls from generations where user_id=$1`, [uId])
  const paths = gens.rows.flatMap((r: { result_urls: string[] }) => r.result_urls ?? [])
  if (paths.length) await deleteGenerationObjects(paths)
  await pg.query(`delete from wallet_transactions where wallet_id=$1`, [wId])
  await pg.query(`delete from generations where user_id=$1`, [uId])
  await pg.query(`delete from wallets where id=$1`, [wId])
  await pg.query(`delete from users where id=$1`, [uId])
  await pg.query(`delete from fx_rates where id=$1`, [fxId])
  await pg.query(`delete from models where id='mock-video'`)
  await pg.end()
})

describe('pollRunningVideoGenerations (mock-video, real DB)', () => {
  it('A) 완료: 다운로드+저장+SUCCEEDED+expires_at', async () => {
    await pg.query(
      `insert into generations(id,user_id,model_id,kind,prompt,params_json,status,external_job_id,charged_krw,started_at,last_polled_at)
       values ($1,$2,'mock-video','VIDEO','파도','{}'::jsonb,'RUNNING','mock-done-test',690,now(),null)`,
      [genSuccessId, uId],
    )

    await pollRunningVideoGenerations()

    const g = await pg.query(
      `select status, array_length(result_urls,1) as n, expires_at from generations where id=$1`,
      [genSuccessId],
    )
    expect(g.rows[0].status).toBe('SUCCEEDED')
    expect(g.rows[0].n).toBe(1)
    expect(g.rows[0].expires_at).not.toBeNull()
  })

  it('B) 30분 타임아웃: FAILED + 환불(잔액 복구)', async () => {
    await pg.query(
      `insert into generations(id,user_id,model_id,kind,prompt,params_json,status,external_job_id,charged_krw,started_at,last_polled_at)
       values ($1,$2,'mock-video','VIDEO','파도','{}'::jsonb,'RUNNING','real-job',500,now() - interval '31 minutes',null)`,
      [genTimeoutId, uId],
    )

    const before = await pg.query(`select balance_krw from wallets where id=$1`, [wId])

    await pollRunningVideoGenerations()

    const g = await pg.query(`select status, failed_reason from generations where id=$1`, [genTimeoutId])
    expect(g.rows[0].status).toBe('FAILED')
    expect(g.rows[0].failed_reason).toContain('timeout')

    const after = await pg.query(`select balance_krw from wallets where id=$1`, [wId])
    expect(after.rows[0].balance_krw - before.rows[0].balance_krw).toBe(500)
  })
})
