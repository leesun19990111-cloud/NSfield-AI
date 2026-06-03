import { describe, it, expect } from 'vitest'
import { mockVideoAdapter } from '@/lib/models/video/mock'

describe('mockVideoAdapter', () => {
  it('start는 mock-done- job id 반환', async () => {
    const r = await mockVideoAdapter.start({ prompt: 'x', duration_sec: 5 })
    expect(r.externalJobId).toMatch(/^mock-done-/)
  })
  it('poll(mock-done-*)은 succeeded + videoUrl', async () => {
    const r = await mockVideoAdapter.poll('mock-done-123')
    expect(r.status).toBe('succeeded')
    if (r.status === 'succeeded') { expect(r.videoUrl).toMatch(/^data:/); expect(r.cost_usd_raw).toBeGreaterThan(0) }
  })
  it('poll(미완료 job)은 running', async () => {
    const r = await mockVideoAdapter.poll('real-job-xyz')
    expect(r.status).toBe('running')
  })
})
