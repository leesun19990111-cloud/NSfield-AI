import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'

// AtlasCloud 통합 마일스톤 게이트 E2E:
// 카탈로그(/models) → 패밀리(/models/mock) → 모델 → DynamicGenerator(/generate/mock-image)
// → 실제 폼으로 생성 → 차감 → 라이브러리 SUCCEEDED 까지 전 구간을 실 UI로 검증한다.
// mock-image는 무료·결정적 어댑터(비-production)라 외부 호출 없이 동기 성공한다.

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)
const pg = new Client({ connectionString: process.env.DIRECT_URL })

const stamp = Date.now()
const email = `e2e_catalog_${stamp}@example.com`
const pwd = 'Test1234!'
let userId = ''
const fxTestId = `fx-e2e-catalog-${stamp}`

test.beforeAll(async () => {
  await pg.connect()
  const u = await admin.auth.admin.createUser({ email, password: pwd, email_confirm: true })
  if (u.error || !u.data.user) throw new Error('user create failed: ' + u.error?.message)
  userId = u.data.user.id

  // 트리거가 wallet을 만들 시간을 폴링
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
    [fxTestId],
  )

  // mock-image 모델 보장 + 활성화 (seed로 family='mock', is_active=false 행이 존재할 수 있음).
  // family='mock' 이어야 카탈로그에 'Mock' 패밀리 카드가 노출된다.
  await pg.query(`insert into models(id,kind,family,modality,atlas_model,display_name,provider,is_active,margin_pct,pricing_json)
    values ('mock-image','IMAGE','mock','text-to-image','','Mock Image (테스트)','mock',true,10,'{"kind":"per_image","usd_per_unit":0.04}'::jsonb)
    on conflict (id) do update set is_active=true, family='mock', modality='text-to-image'`)
})

test.afterAll(async () => {
  if (userId) {
    // 생성물 Storage 정리
    const gens = await pg.query(`select result_urls from generations where user_id=$1`, [userId])
    const paths = gens.rows.flatMap((r: { result_urls: string[] }) => r.result_urls ?? [])
    if (paths.length) await admin.storage.from('generations').remove(paths)

    await pg.query(
      `delete from wallet_transactions where wallet_id in (select id from wallets where user_id=$1)`,
      [userId],
    )
    await pg.query(`delete from generations where user_id=$1`, [userId])
    await pg.query(`delete from rate_limits where user_id=$1`, [userId])
    await pg.query(`delete from wallets where user_id=$1`, [userId])
    await pg.query(`delete from users where id=$1`, [userId])
    await admin.auth.admin.deleteUser(userId)
  }
  await pg.query(`delete from fx_rates where id=$1`, [fxTestId])
  // mock-image는 공용 카탈로그 행이므로 비활성화만 (삭제 시 다른 테스트/seed 영향)
  await pg.query(`update models set is_active=false where id='mock-image'`)
  await pg.end()
})

test('카탈로그 → mock 패밀리 → DynamicGenerator → 생성 → 차감 → 라이브러리 SUCCEEDED', async ({ page }) => {
  // 1) 로그인
  await page.goto('/auth/login')
  await page.getByPlaceholder('이메일').fill(email)
  await page.getByPlaceholder('비밀번호').fill(pwd)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('**/wallet', { timeout: 30000 })

  // 2) 카탈로그 → Mock 패밀리 카드 클릭
  await page.goto('/models')
  const familyLink = page.locator('a[href="/models/mock"]')
  await expect(familyLink).toBeVisible({ timeout: 15000 })
  await expect(familyLink).toContainText('Mock')
  await familyLink.click()
  await page.waitForURL('**/models/mock', { timeout: 15000 })

  // 3) 패밀리 페이지에서 mock-image 모델의 '생성하기' 클릭 → DynamicGenerator
  const generateLink = page.locator('a[href="/generate/mock-image"]')
  await expect(generateLink).toBeVisible({ timeout: 15000 })
  await generateLink.click()
  await page.waitForURL('**/generate/mock-image', { timeout: 15000 })

  // 4) DynamicGenerator 폼: 프롬프트 입력 → 생성
  await expect(page.getByRole('heading', { name: /Mock Image/ })).toBeVisible()
  await page.getByRole('textbox').first().fill('테스트 고양이')
  await page.getByRole('button', { name: /생성하기/ }).click()

  // 5) 라이브러리 결과 페이지 → SUCCEEDED (이미지 경로는 동기 성공)
  await page.waitForURL('**/library/**', { timeout: 30000 })
  await expect(page.getByText('SUCCEEDED')).toBeVisible({ timeout: 15000 })

  // 6) 잔액 차감 확인 (DB)
  const bal = await pg.query(`select balance_krw from wallets where user_id=$1`, [userId])
  expect(bal.rows[0].balance_krw).toBeLessThan(100000)
})
