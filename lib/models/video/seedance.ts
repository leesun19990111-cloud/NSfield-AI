import { fetchWithTimeout } from '@/lib/http/fetch'
import type { VideoAdapter, VideoStartResult, VideoPollResult } from '../adapter'
import { AdapterError } from '../adapter'
import type { GenerationParams } from '../types'

// TODO(owner): ByteDance Seedance 실제 엔드포인트/스키마 확정 필요. 아래는 형식 골격.
export const seedanceAdapter: VideoAdapter = {
  id: 'seedance-2.0', kind: 'VIDEO',
  async start(params: GenerationParams): Promise<VideoStartResult> {
    const key = process.env.BYTEDANCE_API_KEY
    if (!key) throw new AdapterError('SEEDANCE_NO_KEY', 'BYTEDANCE_API_KEY 미설정')
    // TODO(owner): 실제 엔드포인트/스키마 확정
    const res = await fetchWithTimeout('https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'seedance-2.0', prompt: params.prompt, duration: params.duration_sec }),
    })
    if (!res.ok) throw new AdapterError('SEEDANCE_ERROR', `Seedance ${res.status}`)
    const json = (await res.json()) as { id?: string; task_id?: string }
    const id = json.id ?? json.task_id
    if (!id) throw new AdapterError('SEEDANCE_ERROR', '작업 ID 없음')
    return { externalJobId: id }
  },
  async poll(externalJobId: string): Promise<VideoPollResult> {
    const key = process.env.BYTEDANCE_API_KEY
    if (!key) throw new AdapterError('SEEDANCE_NO_KEY', 'BYTEDANCE_API_KEY 미설정')
    // TODO(owner): 실제 엔드포인트/스키마 확정
    const res = await fetchWithTimeout(`https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${encodeURIComponent(externalJobId)}`, {
      headers: { authorization: `Bearer ${key}` },
    })
    if (!res.ok) throw new AdapterError('SEEDANCE_ERROR', `Seedance ${res.status}`)
    const json = (await res.json()) as {
      status?: string; error?: { message?: string }; content?: { video_url?: string }
    }
    if (json.status === 'failed') return { status: 'failed', reason: json.error?.message ?? 'seedance error' }
    if (json.status !== 'succeeded') return { status: 'running' }
    const url = json.content?.video_url
    if (!url) return { status: 'failed', reason: '영상 URL 없음' }
    return { status: 'succeeded', videoUrl: url, cost_usd_raw: 0 }
  },
}
