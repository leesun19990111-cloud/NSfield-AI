import { fetchWithTimeout } from '@/lib/http/fetch'
import type { VideoAdapter, VideoStartResult, VideoPollResult } from '../adapter'
import { AdapterError } from '../adapter'
import type { GenerationParams } from '../types'

// TODO(owner): Google Veo3 실제 엔드포인트/요청·응답 스키마 확정 필요. 아래는 형식 골격.
export const veo3Adapter: VideoAdapter = {
  id: 'veo3', kind: 'VIDEO',
  async start(params: GenerationParams): Promise<VideoStartResult> {
    const key = process.env.GOOGLE_API_KEY
    if (!key) throw new AdapterError('GOOGLE_NO_KEY', 'GOOGLE_API_KEY 미설정')
    const res = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/veo:generate', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ prompt: params.prompt, durationSeconds: params.duration_sec }),
    })
    if (!res.ok) throw new AdapterError('VEO3_ERROR', `Veo3 ${res.status}`)
    const json = (await res.json()) as { name?: string; jobId?: string }
    const id = json.jobId ?? json.name
    if (!id) throw new AdapterError('VEO3_NO_JOB', '작업 ID 없음')
    return { externalJobId: id }
  },
  async poll(externalJobId: string): Promise<VideoPollResult> {
    const key = process.env.GOOGLE_API_KEY
    if (!key) throw new AdapterError('GOOGLE_NO_KEY', 'GOOGLE_API_KEY 미설정')
    const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/${encodeURIComponent(externalJobId)}`, {
      headers: { 'x-goog-api-key': key },
    })
    if (!res.ok) throw new AdapterError('VEO3_ERROR', `Veo3 ${res.status}`)
    const json = (await res.json()) as { done?: boolean; error?: { message?: string }; response?: { videoUri?: string } }
    if (json.error) return { status: 'failed', reason: json.error.message ?? 'veo3 error' }
    if (!json.done) return { status: 'running' }
    const url = json.response?.videoUri
    if (!url) return { status: 'failed', reason: '영상 URL 없음' }
    return { status: 'succeeded', videoUrl: url, cost_usd_raw: 0 }
  },
}
