import { describe, it, expect, afterAll } from 'vitest'
import { runBackup } from '@/lib/jobs/backup'
import { createAdminClient } from '@/lib/supabase/admin'

const testDate = '2026-06-03-test'
const testPath = `backups/${testDate}.json`

afterAll(async () => {
  const supabase = createAdminClient()
  await supabase.storage.from('generations').remove([testPath])
})

describe('backup (real DB + Storage)', () => {
  it('핵심 테이블을 직렬화해 Storage에 업로드', async () => {
    const result = await runBackup(testDate)
    expect(result.path).toBe(testPath)
    for (const key of ['wallets', 'wallet_transactions', 'topup_requests', 'generations', 'admin_actions']) {
      expect(typeof result.counts[key]).toBe('number')
      expect(result.counts[key]).toBeGreaterThanOrEqual(0)
    }

    // 업로드된 객체가 실제 존재하고 JSON으로 파싱되는지 검증
    const supabase = createAdminClient()
    const { data, error } = await supabase.storage.from('generations').download(testPath)
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    const text = await data!.text()
    const parsed = JSON.parse(text)
    expect(parsed).toHaveProperty('data')
    expect(parsed.backed_up_at).toBe(testDate)
  })
})
