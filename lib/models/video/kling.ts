import { fetchWithTimeout } from '@/lib/http/fetch'
import type { VideoAdapter, VideoStartResult, VideoPollResult } from '../adapter'
import { AdapterError } from '../adapter'
import type { GenerationParams } from '../types'

// TODO(owner): Kling 실제 엔드포인트/스키마 확정 필요. 아래는 형식 골격.
export const klingAdapter: VideoAdapter = {
  id: 'kling', kind: 'VIDEO',
  async start(params: GenerationParams): Promise<VideoStartResult> {
    const key = process.env.KLING_API_KEY
    if (!key) throw new AdapterError('KLING_NO_KEY', 'KLING_API_KEY 미설정')
    // TODO(owner): 실제 엔드포인트/스키마 확정
    const res = await fetchWithTimeout('https://api.klingai.com/v1/videos/text2video', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ prompt: params.prompt, duration: params.duration_sec }),
    })
    if (!res.ok) throw new AdapterError('KLING_ERROR', `Kling ${res.status}`)
    const json = (await res.json()) as { data?: { task_id?: string }; task_id?: string }
    const id = json.data?.task_id ?? json.task_id
    if (!id) throw new AdapterError('KLING_ERROR', '작업 ID 없음')
    return { externalJobId: id }
  },
  async poll(externalJobId: string): Promise<VideoPollResult> {
    const key = process.env.KLING_API_KEY
    if (!key) throw new AdapterError('KLING_NO_KEY', 'KLING_API_KEY 미설정')
    // TODO(owner): 실제 엔드포인트/스키마 확정
    const res = await fetchWithTimeout(`https://api.klingai.com/v1/videos/text2video/${encodeURIComponent(externalJobId)}`, {
      headers: { authorization: `Bearer ${key}` },
    })
    if (!res.ok) throw new AdapterError('KLING_ERROR', `Kling ${res.status}`)
    const json = (await res.json()) as {
      data?: { task_status?: string; task_status_msg?: string; task_result?: { videos?: { url?: string }[] } }
    }
    const status = json.data?.task_status
    if (status === 'failed') return { status: 'failed', reason: json.data?.task_status_msg ?? 'kling error' }
    if (status !== 'succeed') return { status: 'running' }
    const url = json.data?.task_result?.videos?.[0]?.url
    if (!url) return { status: 'failed', reason: '영상 URL 없음' }
    return { status: 'succeeded', videoUrl: url, cost_usd_raw: 0 }
  },
}
