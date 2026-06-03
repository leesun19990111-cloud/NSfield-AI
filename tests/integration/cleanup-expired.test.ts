import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'

import { cleanupExpiredGenerations } from '@/lib/jobs/cleanup-expired'
import { uploadGenerationImages, deleteGenerationObjects } from '@/lib/storage/upload'

const TINY = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const uId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const genId = `gen-cleanup-${Date.now()}`
const objPath = `${uId}/${genId}/output_0.png`

const pg = new Client({ connectionString: process.env.DIRECT_URL })

beforeAll(async () => {
  await pg.connect()
  await pg.query(
    `insert into users(id,email,topup_code,role) values ($1,$2,'CLUP','USER') on conflict (id) do nothing`,
    [uId, `cleanup_${Date.now()}@x.com`],
  )
  // 실제 Storage 객체 업로드
  await uploadGenerationImages([{ path: objPath, b64: TINY, contentType: 'image/png' }])
  // 이미 만료된(어제 만료) SUCCEEDED 생성 + 메타데이터 보존 대상
  await pg.query(
    `insert into generations(id,user_id,model_id,kind,prompt,params_json,status,result_urls,charged_krw,created_at,finished_at,expires_at)
     values ($1,$2,'mock-image','IMAGE','keep me','{}'::jsonb,'SUCCEEDED',ARRAY[$3]::text[],55,now(),now(),now() - interval '1 day')`,
    [genId, uId, objPath],
  )
})

afterAll(async () => {
  await deleteGenerationObjects([objPath])
  await pg.query(`delete from generations where id=$1`, [genId])
  await pg.query(`delete from users where id=$1`, [uId])
  await pg.end()
})

describe('cleanupExpiredGenerations (real DB + Storage)', () => {
  it('만료 파일 삭제 + result_urls 비움, 메타데이터(prompt/charged_krw) 보존', async () => {
    const res = await cleanupExpiredGenerations()
    expect(res.processed).toBeGreaterThanOrEqual(1)

    const g = await pg.query(
      `select array_length(result_urls,1) as n, prompt, charged_krw, input_image_url from generations where id=$1`,
      [genId],
    )
    // result_urls 비워짐 (빈 배열 → array_length = NULL)
    expect(g.rows[0].n).toBeNull()
    expect(g.rows[0].input_image_url).toBeNull()
    // 메타데이터 보존
    expect(g.rows[0].prompt).toBe('keep me')
    expect(g.rows[0].charged_krw).toBe(55)
  })

  it('멱등성: 재실행 시 이 행은 더 이상 처리되지 않음', async () => {
    const before = await pg.query(
      `select array_length(result_urls,1) as n from generations where id=$1`,
      [genId],
    )
    expect(before.rows[0].n).toBeNull()
    // 재실행해도 result_urls가 비어 있어 쿼리에 매칭되지 않음 → 에러 없이 통과
    await cleanupExpiredGenerations()
    const after = await pg.query(
      `select array_length(result_urls,1) as n, prompt from generations where id=$1`,
      [genId],
    )
    expect(after.rows[0].n).toBeNull()
    expect(after.rows[0].prompt).toBe('keep me')
  })
})
