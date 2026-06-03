import { AdapterError } from '@/lib/models/adapter'
import { fetchWithTimeout } from '@/lib/http/fetch'

const ATLAS_BASE = 'https://api.atlascloud.ai/api/v1/model'

// 서버 전용. 파일 바이트를 AtlasCloud에 업로드하고 호스팅 URL 반환.
// TODO(owner): uploadMedia 응답 형태 실제 확인
export async function atlasUploadMedia(file: Blob, filename: string): Promise<string> {
  const key = process.env.ATLASCLOUD_API_KEY
  if (!key) throw new AdapterError('ATLASCLOUD_NO_KEY', 'ATLASCLOUD_API_KEY 미설정')
  const form = new FormData()
  form.append('file', file, filename)
  const res = await fetchWithTimeout(`${ATLAS_BASE}/uploadMedia`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: form,
  }, 60000)
  if (!res.ok) throw new AdapterError('ATLASCLOUD_UPLOAD_FAILED', `uploadMedia ${res.status}`)
  const json = (await res.json()) as { data?: { url?: string; asset_id?: string }; url?: string }
  const url =
    json.data?.url ?? json.url ?? (json.data?.asset_id ? `asset://${json.data.asset_id}` : undefined)
  if (!url) throw new AdapterError('ATLASCLOUD_UPLOAD_FAILED', '업로드 URL 없음')
  return url
}
