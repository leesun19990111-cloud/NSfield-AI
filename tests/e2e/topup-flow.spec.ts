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
const userEmail = `e2e_user_${stamp}@example.com`
const adminEmail = `e2e_admin_${stamp}@example.com`
const pw = 'Test1234!'
const depositorName = `E2E테스트${stamp}`
let userId = ''
let adminId = ''
const fxTestId = `fx-e2e-topup-${stamp}`

test.beforeAll(async () => {
  await pg.connect()

  // /wallet 렌더 시 getCurrentFxRate()가 외부 FX API를 호출하지 않도록
  // 신선한 환율 행을 보장 (오프라인/환율 staleness 회피). 1시간 이내 캐시 사용.
  await pg.query(
    `insert into fx_rates(id,pair,rate,source,fetched_at) values ($1,'USDKRW',1380,'e2e',now())`,
    [fxTestId],
  )
  const u = await admin.auth.admin.createUser({
    email: userEmail,
    password: pw,
    email_confirm: true,
  })
  if (u.error || !u.data.user) throw new Error('regular user create failed: ' + u.error?.message)
  userId = u.data.user.id

  const a = await admin.auth.admin.createUser({
    email: adminEmail,
    password: pw,
    email_confirm: true,
  })
  if (a.error || !a.data.user) throw new Error('admin user create failed: ' + a.error?.message)
  adminId = a.data.user.id

  // Promote the admin user. The on_auth_user_created trigger has populated
  // public.users already, but guard with a short poll in case of replication lag.
  for (let i = 0; i < 10; i++) {
    const res = await pg.query(`update users set role='ADMIN' where id=$1`, [adminId])
    if (res.rowCount && res.rowCount > 0) break
    await new Promise((r) => setTimeout(r, 500))
  }
})

test.afterAll(async () => {
  for (const id of [userId, adminId]) {
    if (!id) continue
    await pg.query(
      `delete from wallet_transactions where wallet_id in (select id from wallets where user_id=$1)`,
      [id],
    )
    await pg.query(`delete from topup_requests where user_id=$1`, [id])
    await pg.query(`delete from wallets where user_id=$1`, [id])
    // admin_actions has no FK but is keyed by the admin id — clean to avoid orphans.
    await pg.query(`delete from admin_actions where admin_id=$1`, [id])
    await pg.query(`delete from users where id=$1`, [id])
    await admin.auth.admin.deleteUser(id)
  }
  await pg.query(`delete from fx_rates where id=$1`, [fxTestId])
  await pg.end()
})

test('로그인 → 충전 요청 → 관리자 승인 → 잔액 반영', async ({ browser }) => {
  // 1) Regular user logs in.
  const userCtx = await browser.newContext()
  const u = await userCtx.newPage()
  await u.goto('/auth/login')
  await u.getByPlaceholder('이메일').fill(userEmail)
  await u.getByPlaceholder('비밀번호').fill(pw)
  await u.getByRole('button', { name: '로그인' }).click()
  await u.waitForURL('**/wallet', { timeout: 30000 })

  // 2) Submit a topup request for ₩30,000.
  await u.goto('/wallet/topup')
  await u.getByPlaceholder('입금 금액 (₩)').fill('30000')
  await u.getByPlaceholder(/입금자명/).fill(depositorName)
  await u.locator('input[type="datetime-local"]').fill('2026-05-30T14:00')
  await u.getByRole('button', { name: '충전 요청 제출' }).click()
  await expect(u.getByText('관리자 확인 후 잔액에 반영됩니다.')).toBeVisible({ timeout: 15000 })

  // 3) Admin logs in, opens the queue, approves the request.
  const adminCtx = await browser.newContext()
  const a = await adminCtx.newPage()
  a.on('dialog', (d) => d.accept())
  await a.goto('/auth/login')
  await a.getByPlaceholder('이메일').fill(adminEmail)
  await a.getByPlaceholder('비밀번호').fill(pw)
  await a.getByRole('button', { name: '로그인' }).click()
  await a.waitForURL('**/wallet', { timeout: 30000 })
  await a.goto('/admin/topups')
  await a.getByText(depositorName).waitFor({ timeout: 15000 })
  await a.getByRole('button', { name: '승인' }).first().click()
  // Wait for the approved request to leave the pending queue (revalidate done).
  await expect(a.getByText(depositorName)).toBeHidden({ timeout: 15000 })

  // 4) Regular user sees the new balance.
  await u.goto('/wallet')
  await expect(u.getByText('₩30,000').first()).toBeVisible({ timeout: 15000 })

  await userCtx.close()
  await adminCtx.close()
})
