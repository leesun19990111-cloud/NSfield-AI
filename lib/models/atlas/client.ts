import { fetchWithTimeout } from '@/lib/http/fetch'
import { AdapterError } from '@/lib/models/adapter'
import type { ModelConfig, FieldType } from '@/lib/models/catalog/types'

const ATLAS_BASE = 'https://api.atlascloud.ai/api/v1/model'

function requireKey(): string {
  const k = process.env.ATLASCLOUD_API_KEY
  if (!k) throw new AdapterError('ATLASCLOUD_NO_KEY', 'ATLASCLOUD_API_KEY 미설정')
  return k
}

// 필드의 입력 param 이름
function fieldParam(f: FieldType): string | null {
  switch (f.kind) {
    case 'prompt':
      return 'prompt'
    case 'negative_prompt':
      return 'negative_prompt'
    case 'select':
    case 'int':
    case 'toggle':
    case 'image':
    case 'images':
    case 'video_clip':
      return f.param
    default:
      return null
  }
}

export function buildRequestBody(
  config: ModelConfig,
  inputs: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = { model: config.atlasModel }
  const all = [...config.fields, ...(config.advancedFields ?? [])]
  for (const f of all) {
    const param = fieldParam(f)
    if (!param) continue
    const v = inputs[param]
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue
    body[param] = v
  }
  return body
}

export type AtlasPollResult =
  | { status: 'running' }
  | { status: 'succeeded'; url: string; raw: unknown }
  | { status: 'failed'; reason: string }

function unwrap(json: unknown): { status?: string; outputs?: string[]; error?: string; id?: string } {
  const j = (json ?? {}) as { data?: Record<string, unknown> } & Record<string, unknown>
  const d = (j.data ?? j) as { status?: string; outputs?: string[]; error?: string; id?: string }
  return d
}

export async function atlasSubmit(
  config: ModelConfig,
  inputs: Record<string, unknown>,
): Promise<string> {
  const key = requireKey()
  const endpoint = config.output === 'VIDEO' ? 'generateVideo' : 'generateImage'
  const res = await fetchWithTimeout(`${ATLAS_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(buildRequestBody(config, inputs)),
  })
  if (!res.ok) throw new AdapterError('ATLASCLOUD_ERROR', `AtlasCloud submit ${res.status}`)
  const id = unwrap(await res.json()).id
  if (!id) throw new AdapterError('ATLASCLOUD_NO_JOB', '예측 ID 없음')
  return id
}

export async function atlasPoll(predictionId: string): Promise<AtlasPollResult> {
  const key = requireKey()
  const res = await fetchWithTimeout(`${ATLAS_BASE}/prediction/${encodeURIComponent(predictionId)}`, {
    headers: { authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new AdapterError('ATLASCLOUD_ERROR', `AtlasCloud poll ${res.status}`)
  const d = unwrap(await res.json())
  if (d.status === 'completed' || d.status === 'succeeded') {
    const url = d.outputs?.[0]
    if (!url) return { status: 'failed', reason: '결과 없음' }
    return { status: 'succeeded', url, raw: d }
  }
  if (d.status === 'failed' || d.status === 'timeout') {
    return { status: 'failed', reason: d.error || 'AtlasCloud 생성 실패' }
  }
  return { status: 'running' }
}
