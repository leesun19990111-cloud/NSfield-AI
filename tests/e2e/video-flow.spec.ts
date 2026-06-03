import { test, expect, request as pwRequest } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)
const pg = new Client({ connectionString: process.env.DIRECT_URL })

const stamp = Date.now()
const email = `e2e_vid_${stamp}@example.com`
const pwd = 'Test1234!'
let userId = ''
const fxId = `fx-e2e-vid-${stamp}`

test.beforeAll(async () => {
  await pg.connect()
  const u = await admin.auth.admin.createUser({ email, password: pwd, email_confirm: true })
  if (u.error || !u.data.user) throw new Error('user create failed: ' + u.error?.message)
  userId = u.data.user.id

  // 트리거가 wallet 생성할 시간을 약간 폴링
  let walletId: string | null = null
  for (let i = 0; i < 10 && !walletId; i++) {
    const w = await pg.query(`select id from wallets where user_id=$1`, [userId])
    if (w.rowCount) walletId = w.rows[0].id as string
    else await new Promise((r) => setTimeout(r, 500))
  }
  if (!walletId) throw new Error('wallet not created by trigger')

  // 잔액 충전 (ledger 일관성 위해 wallet_apply_tx)
  await pg.query(`select wallet_apply_tx($1::text,'TOPUP',100000::int,'seed',null,'e2e')`, [walletId])

  // FRESH FX 행 (외부 API 회피). getCurrentFxRate는 1시간 이내 캐시를 사용.
  await pg.query(
    `insert into fx_rates(id,pair,rate,source,fetched_at) values ($1,'USDKRW',1380,'e2e',now())`,
    [fxId],
  )

  // mock-video 모델 보장 (polling_interval_sec=1 → 첫 cron에서 즉시 완료)
  await pg.query(`insert into models(id,kind,display_name,provider,is_active,margin_pct,pricing_json)
    values ('mock-video','VIDEO','Mock Video','mock',true,10,'{"kind":"per_video_fixed","tiers":{"5":0.45,"10":0.82},"options":{"allowed_durations_sec":[5,10],"polling_interval_sec":1}}'::jsonb)
    on conflict (id) do update set is_active=true`)
})

test.afterAll(async () => {
  if (userId) {
    // 생성물 Storage 정리
    const gens = await pg.query(`select result_urls from generations where user_id=$1`, [userId])
    const paths = gens.rows.flatMap((r: { result_urls: string[] }) => r.result_urls ?? [])
    if (paths.length) await admin.storage.from('generations').remove(paths)

    await pg.query(`delete from wallet_transactions where wallet_id in (select id from wallets where user_id=$1)`, [userId])
    await pg.query(`delete from generations where user_id=$1`, [userId])
    await pg.query(`delete from wallets where user_id=$1`, [userId])
    await pg.query(`delete from users where id=$1`, [userId])
    await admin.auth.admin.deleteUser(userId)
  }
  await pg.query(`delete from fx_rates where id=$1`, [fxId])
  // mock-video는 공용 카탈로그일 수 있으니 비활성화만 (삭제 시 다른 테스트 영향)
  await pg.query(`update models set is_active=false where id='mock-video'`)
  await pg.end()
})

test('로그인 → 영상 생성(RUNNING) → 폴링 cron → SUCCEEDED + 차감', async ({ page, baseURL }) => {
  await page.goto('/auth/login')
  await page.getByPlaceholder('이메일').fill(email)
  await page.getByPlaceholder('비밀번호').fill(pwd)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('**/wallet', { timeout: 30000 })

  await page.goto('/generate/mock-video')
  await page.getByPlaceholder('생성할 영상을 설명하세요').fill('파도치는 해변')
  // 길이 5초 선택(기본이 첫 허용=5초이나 명시적으로 클릭) — 라벨이 고유
  await page.getByRole('button', { name: '5초', exact: true }).click()
  await page.getByRole('button', { name: /영상 생성하기/ }).click()

  // 등록 직후 RUNNING 상태로 라이브러리 상세로 이동
  await page.waitForURL('**/library/**', { timeout: 30000 })
  await expect(page.getByText('RUNNING')).toBeVisible({ timeout: 15000 })

  // 폴링 cron 호출 (GET + Bearer CRON_SECRET). mock-video는 즉시 succeeded.
  const ctx = await pwRequest.newContext()
  const pollRes = await ctx.get(`${baseURL}/api/cron/poll-generations`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  expect(pollRes.ok()).toBe(true)
  const pollJson = await pollRes.json()
  expect(pollJson.ok).toBe(true)
  await ctx.dispose()

  // 완료 반영까지 reload 폴링 (수동 새로고침)
  await expect
    .poll(
      async () => {
        await page.reload()
        return (await page.getByText('SUCCEEDED').count()) > 0
      },
      { timeout: 20000, intervals: [1000, 2000, 2000] },
    )
    .toBe(true)

  // 잔액 차감 확인 (hold 유지 — 환불되지 않았음)
  const bal = await pg.query(`select balance_krw from wallets where user_id=$1`, [userId])
  expect(bal.rows[0].balance_krw).toBeLessThan(100000)
})
