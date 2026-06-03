import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Client } from 'pg'

const uId = '77777777-7777-7777-7777-777777777777'
const wId = 'w-' + uId

// 인증만 모킹 (나머지 prisma/fx/registry/storage는 실제)
vi.mock('@/lib/auth/guards', () => ({
  requireUser: vi.fn(async () => ({ id: uId, email: 'g@x.com', role: 'USER', display_name: null, topup_code: 'GENU' })),
  requireAdmin: vi.fn(),
}))

// Next 요청 컨텍스트가 없는 Vitest 환경에서 revalidatePath는 동작 불가 → 프레임워크 부수효과만 모킹
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createImageGeneration } from '@/lib/actions/generation'
import { deleteGenerationObjects } from '@/lib/storage/upload'

const pg = new Client({ connectionString: process.env.DIRECT_URL })

beforeAll(async () => {
  await pg.connect()
  await pg.query(`insert into users(id,email,topup_code,role) values ($1,$2,'GENU','USER') on conflict (id) do nothing`,
    [uId, `gen_${Date.now()}@x.com`])
  await pg.query(`insert into wallets(id,user_id,balance_krw,updated_at) values ($1,$2,100000,now()) on conflict (id) do nothing`, [wId, uId])
  await pg.query(`insert into models(id,kind,display_name,provider,is_active,margin_pct,pricing_json)
    values ('mock-image','IMAGE','Mock','mock',true,10,'{"kind":"per_image","usd_per_unit":0.04}'::jsonb)
    on conflict (id) do update set is_active=true`)
  // 신선한 환율 캐시 보장 (외부 API 미의존). getCurrentFxRate는 1시간 이내 캐시를 사용.
  await pg.query(`insert into fx_rates(id,pair,rate,source,fetched_at)
    values ('fx-test-gen','USDKRW',1380,'test',now()) on conflict (id) do update set fetched_at=now()`)
})

afterAll(async () => {
  // 생성된 결과물 Storage 정리
  const gens = await pg.query(`select result_urls from generations where user_id=$1`, [uId])
  const paths = gens.rows.flatMap((r: { result_urls: string[] }) => r.result_urls ?? [])
  if (paths.length) await deleteGenerationObjects(paths)
  await pg.query(`delete from wallet_transactions where wallet_id=$1`, [wId])
  await pg.query(`delete from generations where user_id=$1`, [uId])
  await pg.query(`delete from wallets where id=$1`, [wId])
  await pg.query(`delete from users where id=$1`, [uId])
  await pg.query(`delete from models where id='mock-image'`)
  await pg.query(`delete from fx_rates where id='fx-test-gen'`)
  await pg.end()
  vi.restoreAllMocks()
})

describe('createImageGeneration (mock model, real DB)', () => {
  it('생성 성공 시 잔액 차감 + SUCCEEDED + result_urls', async () => {
    const before = await pg.query(`select balance_krw from wallets where id=$1`, [wId])
    const res = await createImageGeneration({ modelId: 'mock-image', prompt: '고양이', count: 1 })
    expect(res.ok).toBe(true)
    const after = await pg.query(`select balance_krw from wallets where id=$1`, [wId])
    expect(after.rows[0].balance_krw).toBeLessThan(before.rows[0].balance_krw)
    if (res.ok) {
      const g = await pg.query(`select status, array_length(result_urls,1) as n, charged_krw from generations where id=$1`, [res.generationId])
      expect(g.rows[0].status).toBe('SUCCEEDED')
      expect(g.rows[0].n).toBe(1)
      expect(g.rows[0].charged_krw).toBeGreaterThan(0)
      expect(before.rows[0].balance_krw - after.rows[0].balance_krw).toBe(g.rows[0].charged_krw)
    }
  })
})
