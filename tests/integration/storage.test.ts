import { describe, it, expect, afterAll } from 'vitest'
import { uploadGenerationImages, deleteGenerationObjects } from '@/lib/storage/upload'
import { getSignedUrl } from '@/lib/storage/signed-url'

const TINY = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const testPath = `__test__/${Date.now()}/output_0.png`

afterAll(async () => { await deleteGenerationObjects([testPath]) })

describe('storage (real Supabase)', () => {
  it('업로드 후 서명 URL 발급', async () => {
    const paths = await uploadGenerationImages([{ path: testPath, b64: TINY, contentType: 'image/png' }])
    expect(paths).toContain(testPath)
    const url = await getSignedUrl(testPath)
    expect(url).toMatch(/^https?:\/\//)
  })
})
