import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)
const pg = new Client({ connectionString: process.env.DIRECT_URL })

const stamp = Date.now()
const email = `e2e_gen_${stamp}@example.com`
const pwd = 'Test1234!'
let userId = ''
const fxTestId = `fx-e2e-${stamp}`

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
  await pg.query(`insert into fx_rates(id,pair,rate,source,fetched_at) values ($1,'USDKRW',1380,'e2e',now())`, [fxTestId])

  // mock 모델 보장
  await pg.query(`insert into models(id,kind,display_name,provider,is_active,margin_pct,pricing_json)
    values ('mock-image','IMAGE','Mock Image','mock',true,10,'{"kind":"per_image","usd_per_unit":0.04}'::jsonb)
    on conflict (id) do update set is_active=true`)
})

test.afterAll(async () => {
  if (userId) {
    // 생성물 Storage 정리 (Playwright ts 런타임에서 @ alias 불확실 → admin client 직접 호출)
    const gens = await pg.query(`select result_urls from generations where user_id=$1`, [userId])
    const paths = gens.rows.flatMap((r: { result_urls: string[] }) => r.result_urls ?? [])
    if (paths.length) await admin.storage.from('generations').remove(paths)

    await pg.query(`delete from wallet_transactions where wallet_id in (select id from wallets where user_id=$1)`, [userId])
    await pg.query(`delete from generations where user_id=$1`, [userId])
    await pg.query(`delete from wallets where user_id=$1`, [userId])
    await pg.query(`delete from users where id=$1`, [userId])
    await admin.auth.admin.deleteUser(userId)
  }
  await pg.query(`delete from fx_rates where id=$1`, [fxTestId])
  // mock-image 모델은 공용일 수 있으니 비활성화만 (삭제 시 다른 테스트/카탈로그 영향)
  await pg.query(`update models set is_active=false where id='mock-image'`)
  await pg.end()
})

test('로그인 → mock 이미지 생성 → 차감 → 라이브러리 표시', async ({ page }) => {
  await page.goto('/auth/login')
  await page.getByPlaceholder('이메일').fill(email)
  await page.getByPlaceholder('비밀번호').fill(pwd)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('**/wallet', { timeout: 30000 })

  await page.goto('/generate/mock-image')
  await page.getByPlaceholder('생성할 이미지를 설명하세요').fill('테스트 고양이')
  await page.getByRole('button', { name: /생성하기/ }).click()

  await page.waitForURL('**/library/**', { timeout: 30000 })
  await expect(page.getByText('SUCCEEDED')).toBeVisible({ timeout: 15000 })

  // 잔액 차감 확인 (DB)
  const bal = await pg.query(`select balance_krw from wallets where user_id=$1`, [userId])
  expect(bal.rows[0].balance_krw).toBeLessThan(100000)
})
