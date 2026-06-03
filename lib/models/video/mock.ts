import type { VideoAdapter, VideoStartResult, VideoPollResult } from '../adapter'
import type { GenerationParams } from '../types'

// 외부 호출 없이 동작. 'mock-done-' job은 poll이 즉시 succeeded.
export const mockVideoAdapter: VideoAdapter = {
  id: 'mock-video',
  kind: 'VIDEO',
  async start(_params: GenerationParams): Promise<VideoStartResult> {
    return { externalJobId: `mock-done-${Date.now()}` }
  },
  async poll(externalJobId: string): Promise<VideoPollResult> {
    if (externalJobId.startsWith('mock-done-')) {
      return {
        status: 'succeeded',
        videoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        cost_usd_raw: 0.45,
        meta: { mock: true },
      }
    }
    return { status: 'running' }
  },
}
