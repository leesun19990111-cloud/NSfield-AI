# NS Field — Plan 2: P2 첫 종단 생성 (이미지) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 모델 카탈로그에서 이미지 모델을 골라 프롬프트로 이미지를 생성하면, 잔액에서 정확히 차감되고 결과가 라이브러리에 저장되는 종단(end-to-end) 흐름을 TDD로 구축한다.

**Architecture:** Plan 1의 레이어/불변식을 그대로 따른다. 생성 차감은 반드시 `wallet_apply_tx()`(단일 진입점)를 통과한다. 외부 모델 호출은 **어댑터 인터페이스 뒤에 격리**하여 mock 주입으로 테스트하고, E2E는 실제 유료 API를 호출하지 않는 **mock 어댑터**로 전체 차감·저장 흐름을 검증한다(비용 0, 결정적).

**Tech Stack:** Next.js 16 + TS strict + Tailwind v4 + Supabase(Auth/Postgres/Storage) + Prisma 6.19.3 + Vitest/Playwright. (Plan 1에서 구축됨)

**관련 설계 문서:**
- `docs/ARCHITECTURE.md` (§5 어댑터, §11 P2)
- `docs/superpowers/specs/2026-05-27-nsfield-design.md` (§5 어댑터, §6 이미지 동기 흐름, §7b 가격)
- `docs/superpowers/specs/2026-05-30-nsfield-pages.md` (§1.3 카탈로그, §1.5 생성 스튜디오, §1.8/1.9 라이브러리)

**이 Plan의 범위(P2):** 모델 어댑터 인터페이스+레지스트리, GPT-Image 어댑터(이미지), mock 어댑터(테스트/E2E), Supabase Storage(버킷+RLS+업로드/서명URL), 생성 도메인(상태·정산), 동기 생성 Server Action(차감+저장+실패시 환불), 모델 카탈로그 페이지, 생성 스튜디오(이미지), 라이브러리, E2E.
**범위 밖(다음 Plan):** 영상 비동기·폴링 cron·Realtime, 30일 cleanup cron(Plan 3); 나머지 이미지 어댑터 3개(Seedream/Nanobanana ×2)는 Plan 3에서 같은 패턴으로 추가; 관리자 생성 모니터·강제환불(Plan 4).

**Plan 1에서 이어지는 핵심 전제 (반드시 준수):**
- DB id 컬럼은 모두 **TEXT** (Prisma `String @default(uuid())`). raw SQL은 `text` 파라미터/캐스트.
- Prisma 클라이언트는 `lib/generated/prisma` 생성 → 코드에서는 `@/lib/db/prisma`의 `prisma` 싱글톤만 사용.
- Prisma CLI는 `.env.local`을 못 읽음 → `npx dotenv -e .env.local -- npx prisma <cmd>`.
- `auth`/`storage` 스키마 참조 마이그레이션은 shadow DB에 없어 `migrate dev` 실패 → `--create-only` 후 `migrate deploy`.
- psql 미설치 → DB 검증은 `pg` 클라이언트 기반 Vitest 통합 테스트(`tests/integration/**`, `npm run test:integration`).
- `@updatedAt` 컬럼은 raw INSERT 시 `updated_at = now()` 명시.
- 가격 엔진(`lib/models/pricing.ts`: `estimateBilledUsd`, `estimateRawUsd`)·환율(`lib/fx/service.ts`: `getCurrentFxRate`)·환산(`lib/money/format.ts`: `usdToKrw`)·`wallet_apply_tx`는 이미 존재 — 재사용.

---

## 사전 준비 (Task 0)

### Task 0: 작업 브랜치

- [ ] **Step 1: main 최신화 + 브랜치 생성**

Run:
```bash
git checkout main && git pull origin main && git checkout -b feature/p2-generation
```
Expected: `feature/p2-generation` 브랜치로 전환.

---

## Task 1: 모델 어댑터 인터페이스 + 레지스트리 + mock/GPT-Image 어댑터

**Files:**
- Create: `lib/models/adapter.ts`, `lib/models/registry.ts`, `lib/models/image/mock.ts`, `lib/models/image/gpt-image.ts`
- Test: `tests/unit/models/gpt-image.test.ts`, `tests/unit/models/registry.test.ts`
- Fixture: `tests/fixtures/openai/image-response.json`

- [ ] **Step 1: 어댑터 인터페이스 정의**

Create: `lib/models/adapter.ts`
```typescript
import type { GenerationParams } from './types'

export type GeneratedImage = {
  b64: string          // base64 (data 부분만, data: 프리픽스 없음)
  contentType: string  // 'image/png' 등
}

export type ImageGenerateResult = {
  images: GeneratedImage[]
  cost_usd_raw: number   // 외부 API 실제 원가 (마진 전)
  meta?: Record<string, unknown>
}

// 이미지(동기) 어댑터. 외부 API 호출만 담당 — 가격/환율/저장은 모름.
export interface ImageAdapter {
  id: string
  kind: 'IMAGE'
  generate(params: GenerationParams): Promise<ImageGenerateResult>
}

export class AdapterError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code)
  }
}
```

- [ ] **Step 2: mock 어댑터 (테스트/E2E 전용, 무료·결정적)**

Create: `lib/models/image/mock.ts`
```typescript
import type { ImageAdapter, ImageGenerateResult } from '../adapter'
import type { GenerationParams } from '../types'

// 1x1 투명 PNG (base64). 외부 호출 없이 즉시 반환.
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

export const mockImageAdapter: ImageAdapter = {
  id: 'mock-image',
  kind: 'IMAGE',
  async generate(_params: GenerationParams): Promise<ImageGenerateResult> {
    return {
      images: [{ b64: TINY_PNG_B64, contentType: 'image/png' }],
      cost_usd_raw: 0.04,
      meta: { mock: true },
    }
  },
}
```

- [ ] **Step 3: OpenAI 응답 fixture**

Create: `tests/fixtures/openai/image-response.json`
```json
{
  "created": 1730000000,
  "data": [
    { "b64_json": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" }
  ],
  "usage": { "total_tokens": 0 }
}
```

- [ ] **Step 4 (TDD): GPT-Image 어댑터 실패 테스트**

Create: `tests/unit/models/gpt-image.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const fixture = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../fixtures/openai/image-response.json'), 'utf8'),
)

import { gptImageAdapter } from '@/lib/models/image/gpt-image'

describe('gptImageAdapter', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    vi.restoreAllMocks()
  })

  it('OpenAI 응답을 GeneratedImage로 파싱', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => fixture,
    })) as unknown as typeof fetch)

    const res = await gptImageAdapter.generate({ prompt: '고양이', count: 1 })
    expect(res.images).toHaveLength(1)
    expect(res.images[0]!.b64).toBe(fixture.data[0].b64_json)
    expect(res.images[0]!.contentType).toBe('image/png')
    expect(res.cost_usd_raw).toBeGreaterThan(0)
  })

  it('API 비정상 응답이면 AdapterError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 400, text: async () => 'bad request',
    })) as unknown as typeof fetch)

    await expect(gptImageAdapter.generate({ prompt: 'x' })).rejects.toMatchObject({ code: 'OPENAI_ERROR' })
  })
})
```

- [ ] **Step 5: 실행 (FAIL) → GPT-Image 어댑터 구현**

Run: `npm test -- tests/unit/models/gpt-image.test.ts` → FAIL.

Create: `lib/models/image/gpt-image.ts`
```typescript
import { fetchWithTimeout } from '@/lib/http/fetch'
import type { ImageAdapter, ImageGenerateResult } from '../adapter'
import { AdapterError } from '../adapter'
import type { GenerationParams } from '../types'

// OpenAI Images API. b64_json 포맷으로 받아 그대로 반환.
export const gptImageAdapter: ImageAdapter = {
  id: 'gpt-image-2.0',
  kind: 'IMAGE',
  async generate(params: GenerationParams): Promise<ImageGenerateResult> {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new AdapterError('OPENAI_NO_KEY', 'OPENAI_API_KEY 미설정')

    const count = params.count ?? 1
    const res = await fetchWithTimeout('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: params.prompt,
        n: count,
        size: '1024x1024',
        response_format: 'b64_json',
      }),
    })
    if (!res.ok) {
      throw new AdapterError('OPENAI_ERROR', `OpenAI ${res.status}`)
    }
    const json = (await res.json()) as { data?: { b64_json?: string }[] }
    const data = json.data ?? []
    if (data.length === 0 || !data[0]?.b64_json) {
      throw new AdapterError('OPENAI_EMPTY', '결과 이미지 없음')
    }
    return {
      images: data.map((d) => ({ b64: d.b64_json!, contentType: 'image/png' })),
      // 원가는 가격 엔진(per_image)이 표기/차감을 담당하므로 여기서는 참고용 추정만.
      cost_usd_raw: 0.04 * count,
    }
  },
}
```
Run → 2 passed.

- [ ] **Step 6 (TDD): 레지스트리 실패 테스트**

Create: `tests/unit/models/registry.test.ts`
```typescript
import { describe, it, expect } from 'vitest'
import { getImageAdapter } from '@/lib/models/registry'

describe('registry', () => {
  it('gpt-image-2.0 어댑터 반환', () => {
    expect(getImageAdapter('gpt-image-2.0')?.id).toBe('gpt-image-2.0')
  })
  it('mock-image 어댑터 반환', () => {
    expect(getImageAdapter('mock-image')?.id).toBe('mock-image')
  })
  it('미등록 모델은 null', () => {
    expect(getImageAdapter('nope')).toBeNull()
  })
})
```

- [ ] **Step 7: 실행 (FAIL) → 레지스트리 구현**

Create: `lib/models/registry.ts`
```typescript
import type { ImageAdapter } from './adapter'
import { gptImageAdapter } from './image/gpt-image'
import { mockImageAdapter } from './image/mock'

const imageAdapters: Record<string, ImageAdapter> = {
  [gptImageAdapter.id]: gptImageAdapter,
  [mockImageAdapter.id]: mockImageAdapter,
}

export function getImageAdapter(modelId: string): ImageAdapter | null {
  return imageAdapters[modelId] ?? null
}
```
Run: `npm test -- tests/unit/models/registry.test.ts` → 3 passed.

- [ ] **Step 8: 전체 테스트 + 빌드 + Commit**

Run: `npm test && npm run build && npm run typecheck`
Expected: 전체 통과.
```bash
git add -A && git commit -m "feat: 이미지 모델 어댑터 인터페이스 + 레지스트리 + GPT-Image/mock 어댑터"
```

---

## Task 2: Supabase Storage 버킷 + RLS + 업로드/서명URL 헬퍼

**Files:**
- Create: `db/sql/storage/generations_bucket.sql`, 마이그레이션, `lib/storage/upload.ts`, `lib/storage/signed-url.ts`
- Test: `tests/integration/storage.test.ts`

- [ ] **Step 1: 버킷 + Storage RLS SQL**

Create: `db/sql/storage/generations_bucket.sql`
```sql
-- private 버킷 'generations'
insert into storage.buckets (id, name, public)
values ('generations', 'generations', false)
on conflict (id) do nothing;

-- 객체 경로 규약: {user_id}/{generation_id}/output_{i}.png
-- 사용자 본인 폴더만 접근(anon/authenticated 키 경로). 서버(service_role)는 우회.
drop policy if exists gen_objects_self_select on storage.objects;
create policy gen_objects_self_select on storage.objects for select
  using (bucket_id = 'generations' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists gen_objects_self_insert on storage.objects;
create policy gen_objects_self_insert on storage.objects for insert
  with check (bucket_id = 'generations' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: 마이그레이션 등록·적용 (storage 스키마 → create-only + deploy)**

Run:
```bash
npx dotenv -e .env.local -- npx prisma migrate dev --create-only --name generations_bucket
```
create-only가 shadow 검증으로 실패하면 폴더를 직접 만든다: `prisma/migrations/<최신보다 뒤 타임스탬프>_generations_bucket/migration.sql`에 Step 1 SQL 작성. 그 후:
```bash
npx dotenv -e .env.local -- npx prisma migrate deploy
npx dotenv -e .env.local -- npx prisma migrate status
```
Expected: up to date. 실패 시 STOP + BLOCKED(정확한 에러, 비번 redact).

- [ ] **Step 3: 업로드 헬퍼 (service_role로 서버 업로드)**

Create: `lib/storage/upload.ts`
```typescript
import { createAdminClient } from '@/lib/supabase/admin'

export type UploadInput = { path: string; b64: string; contentType: string }

// base64 이미지를 generations 버킷에 업로드. 경로는 호출자가 규약대로 구성.
export async function uploadGenerationImages(items: UploadInput[]): Promise<string[]> {
  const supabase = createAdminClient()
  const paths: string[] = []
  for (const it of items) {
    const buffer = Buffer.from(it.b64, 'base64')
    const { error } = await supabase.storage
      .from('generations')
      .upload(it.path, buffer, { contentType: it.contentType, upsert: true })
    if (error) throw new Error('STORAGE_UPLOAD_FAILED: ' + error.message)
    paths.push(it.path)
  }
  return paths
}

export async function deleteGenerationObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const supabase = createAdminClient()
  await supabase.storage.from('generations').remove(paths)
}
```

- [ ] **Step 4: 서명 URL 헬퍼 (TTL 5분)**

Create: `lib/storage/signed-url.ts`
```typescript
import { createAdminClient } from '@/lib/supabase/admin'

export async function getSignedUrl(path: string, expiresInSec = 300): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from('generations')
    .createSignedUrl(path, expiresInSec)
  if (error || !data) return null
  return data.signedUrl
}
```

- [ ] **Step 5: 통합 테스트 (업로드 → 서명URL → 삭제, 실 Storage)**

Create: `tests/integration/storage.test.ts`
```typescript
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
```
Run: `npm run test:integration` (기존 8 + 1). Expected: 통과. (service_role 키 필요 — `.env.local`에 있음)

- [ ] **Step 6: 빌드 + Commit**

Run: `npm run build && npm run typecheck`
```bash
git add -A && git commit -m "feat: generations Storage 버킷 + RLS + 업로드/서명URL 헬퍼"
```

---

## Task 3: 생성 도메인 — 상태 전이 + 정산 (순수)

**Files:**
- Create: `lib/generation/state.ts`, `lib/generation/settle.ts`
- Test: `tests/unit/generation/settle.test.ts`

- [ ] **Step 1 (TDD): 정산 로직 실패 테스트**

설계 §6 정산: 실제 > 견적이면 차액 추가 차감, 실제 ≤ 견적이면 그대로. 이미지(per_image 고정가)는 실제==견적이라 차액 0.

Create: `tests/unit/generation/settle.test.ts`
```typescript
import { describe, it, expect } from 'vitest'
import { computeSettlementKrw } from '@/lib/generation/settle'

describe('computeSettlementKrw', () => {
  it('실제 == 견적: 추가 차감 0', () => {
    expect(computeSettlementKrw(690, 690)).toBe(0)
  })
  it('실제 > 견적: 차액만 추가 차감(양수)', () => {
    expect(computeSettlementKrw(690, 750)).toBe(60)
  })
  it('실제 < 견적: 추가 차감 0 (운영자 흡수, 환불 안 함)', () => {
    expect(computeSettlementKrw(690, 600)).toBe(0)
  })
})
```

- [ ] **Step 2: 실행 (FAIL) → 구현**

Create: `lib/generation/settle.ts`
```typescript
// 견적 차감(chargedKrw) 후 실제 비용(actualKrw)이 확정됐을 때
// 추가로 차감해야 할 KRW. 실제가 견적보다 작으면 0(흡수).
export function computeSettlementKrw(chargedKrw: number, actualKrw: number): number {
  const diff = actualKrw - chargedKrw
  return diff > 0 ? diff : 0
}
```

Create: `lib/generation/state.ts`
```typescript
export type GenStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'

// 단방향 전이만 허용
const allowed: Record<GenStatus, GenStatus[]> = {
  PENDING: ['RUNNING', 'FAILED', 'CANCELED'],
  RUNNING: ['SUCCEEDED', 'FAILED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELED: [],
}

export function canTransition(from: GenStatus, to: GenStatus): boolean {
  return allowed[from].includes(to)
}
```
Run: `npm test -- tests/unit/generation/settle.test.ts` → 3 passed.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: 생성 상태 전이 규칙 + 정산 계산(순수)"
```

---

## Task 4: 생성 Server Action — 견적 + 동기 생성(차감·저장·환불)

**Files:**
- Create: `lib/validation/generation.ts`, `lib/actions/generation.ts`
- Test: `tests/unit/validation/generation.test.ts`, `tests/integration/generation.test.ts`

- [ ] **Step 1 (TDD): 생성 입력 검증 실패 테스트**

Create: `tests/unit/validation/generation.test.ts`
```typescript
import { describe, it, expect } from 'vitest'
import { imageGenerateSchema } from '@/lib/validation/generation'

describe('imageGenerateSchema', () => {
  it('정상: 프롬프트 1~2000자', () => {
    expect(imageGenerateSchema.safeParse({ modelId: 'gpt-image-2.0', prompt: '고양이', count: 1 }).success).toBe(true)
  })
  it('빈 프롬프트 거부', () => {
    expect(imageGenerateSchema.safeParse({ modelId: 'gpt-image-2.0', prompt: '' }).success).toBe(false)
  })
  it('2000자 초과 거부', () => {
    expect(imageGenerateSchema.safeParse({ modelId: 'gpt-image-2.0', prompt: 'a'.repeat(2001) }).success).toBe(false)
  })
})
```

- [ ] **Step 2: 실행 (FAIL) → 검증 구현**

Create: `lib/validation/generation.ts`
```typescript
import { z } from 'zod'

export const imageGenerateSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().trim().min(1).max(2000),
  count: z.coerce.number().int().min(1).max(4).default(1),
})

export type ImageGenerateInput = z.infer<typeof imageGenerateSchema>
```
Run → 3 passed.

- [ ] **Step 3: 생성 액션 구현 (견적 + 동기 생성)**

Create: `lib/actions/generation.ts`
```typescript
'use server'

import { requireUser } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { getCurrentFxRate } from '@/lib/fx/service'
import { estimateBilledUsd } from '@/lib/models/pricing'
import { usdToKrw } from '@/lib/money/format'
import { getImageAdapter } from '@/lib/models/registry'
import { uploadGenerationImages } from '@/lib/storage/upload'
import { computeSettlementKrw } from '@/lib/generation/settle'
import { imageGenerateSchema, type ImageGenerateInput } from '@/lib/validation/generation'
import type { ModelMeta, PricingJson } from '@/lib/models/types'
import { revalidatePath } from 'next/cache'

function toModelMeta(m: {
  id: string; kind: string; display_name: string; provider: string
  is_active: boolean; margin_pct: unknown; pricing_json: unknown
}): ModelMeta {
  return {
    id: m.id, kind: m.kind as 'IMAGE' | 'VIDEO', display_name: m.display_name,
    provider: m.provider, is_active: m.is_active,
    margin_pct: Number(m.margin_pct), pricing_json: m.pricing_json as PricingJson,
  }
}

export type EstimateResult =
  | { ok: true; billedUsd: number; krw: number; fxRate: number }
  | { ok: false; message: string }

export async function estimateGeneration(input: ImageGenerateInput): Promise<EstimateResult> {
  await requireUser()
  const parsed = imageGenerateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: '입력값을 확인해주세요.' }
  const model = await prisma.model.findUnique({ where: { id: parsed.data.modelId } })
  if (!model || !model.is_active) return { ok: false, message: '사용할 수 없는 모델입니다.' }
  const meta = toModelMeta(model)
  const billedUsd = estimateBilledUsd(meta, { prompt: parsed.data.prompt, count: parsed.data.count })
  const fxRate = await getCurrentFxRate()
  return { ok: true, billedUsd, krw: usdToKrw(billedUsd, fxRate), fxRate }
}

export type CreateResult =
  | { ok: true; generationId: string }
  | { ok: false; code: 'VALIDATION' | 'MODEL' | 'INSUFFICIENT' | 'ADAPTER' | 'UNKNOWN'; message: string }

export async function createImageGeneration(input: ImageGenerateInput): Promise<CreateResult> {
  const user = await requireUser()
  const parsed = imageGenerateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: '입력값을 확인해주세요.' }
  const d = parsed.data

  const model = await prisma.model.findUnique({ where: { id: d.modelId } })
  if (!model || !model.is_active || model.kind !== 'IMAGE') {
    return { ok: false, code: 'MODEL', message: '사용할 수 없는 이미지 모델입니다.' }
  }
  const meta = toModelMeta(model)
  const adapter = getImageAdapter(model.id)
  if (!adapter) return { ok: false, code: 'MODEL', message: '모델 어댑터가 없습니다.' }

  const wallet = await prisma.wallet.findUnique({ where: { user_id: user.id } })
  if (!wallet) return { ok: false, code: 'UNKNOWN', message: '지갑을 찾을 수 없습니다.' }

  const billedUsd = estimateBilledUsd(meta, { prompt: d.prompt, count: d.count })
  const fxRate = await getCurrentFxRate()
  const krw = usdToKrw(billedUsd, fxRate)

  // 1) Generation(PENDING) 생성 + 견적 차감(CHARGE)을 한 트랜잭션으로.
  //    잔액 부족이면 wallet_apply_tx가 INSUFFICIENT_BALANCE 예외 → 전체 롤백.
  let generationId: string
  try {
    const created = await prisma.$transaction(async (tx) => {
      const gen = await tx.generation.create({
        data: {
          user_id: user.id, model_id: model.id, kind: 'IMAGE',
          prompt: d.prompt, params_json: { count: d.count },
          status: 'PENDING',
          cost_usd_billed: billedUsd, margin_pct: meta.margin_pct, fx_rate: fxRate, charged_krw: krw,
        },
      })
      await tx.$executeRaw`SELECT wallet_apply_tx(${wallet.id}::text, 'CHARGE', ${-krw}::int, 'generation', ${gen.id}::text, ${'이미지 생성'})`
      return gen
    })
    generationId = created.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('INSUFFICIENT_BALANCE')) {
      return { ok: false, code: 'INSUFFICIENT', message: `잔액이 부족합니다. (필요: ₩${krw.toLocaleString('ko-KR')})` }
    }
    console.error('[createImageGeneration] charge tx failed:', e)
    return { ok: false, code: 'UNKNOWN', message: '생성 요청 처리에 실패했습니다.' }
  }

  // 2) RUNNING
  await prisma.generation.update({ where: { id: generationId }, data: { status: 'RUNNING', started_at: new Date() } })

  // 3) 외부 어댑터 호출 → 실패 시 전액 환불
  try {
    const result = await adapter.generate({ prompt: d.prompt, count: d.count })
    const uploads = result.images.map((img, i) => ({
      path: `${user.id}/${generationId}/output_${i}.png`,
      b64: img.b64, contentType: img.contentType,
    }))
    const paths = await uploadGenerationImages(uploads)

    // 4) 정산 (이미지 고정가: actual==estimate → 차액 0)
    const actualBilledKrw = krw // per_image 고정가 기준. 토큰 기반 모델은 result.cost_usd_raw로 재계산(추후).
    const extra = computeSettlementKrw(krw, actualBilledKrw)
    if (extra > 0) {
      await prisma.$executeRaw`SELECT wallet_apply_tx(${wallet.id}::text, 'CHARGE', ${-extra}::int, 'generation', ${generationId}::text, ${'정산 차액'})`
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await prisma.generation.update({
      where: { id: generationId },
      data: {
        status: 'SUCCEEDED', result_urls: paths, finished_at: new Date(),
        expires_at: expiresAt, cost_usd_raw: result.cost_usd_raw,
        result_meta_json: (result.meta ?? {}) as object,
      },
    })
    revalidatePath('/library')
    return { ok: true, generationId }
  } catch (e) {
    console.error('[createImageGeneration] adapter/storage failed:', e)
    // 전액 환불 + FAILED
    await prisma.$executeRaw`SELECT wallet_apply_tx(${wallet.id}::text, 'REFUND', ${krw}::int, 'generation', ${generationId}::text, ${'생성 실패 환불'})`
    await prisma.generation.update({
      where: { id: generationId },
      data: { status: 'FAILED', failed_reason: (e instanceof Error ? e.message : 'unknown').slice(0, 500), finished_at: new Date() },
    })
    return { ok: false, code: 'ADAPTER', message: '생성에 실패했습니다. 차감 금액은 환불되었습니다.' }
  }
}
```

- [ ] **Step 4: 통합 테스트 (mock 모델로 실 DB 차감·저장·정산 검증)**

이 테스트는 `mock-image` 모델(어댑터)을 DB에 임시 삽입하고, mock 어댑터로 전체 흐름을 검증한다. 외부 유료 API 호출 없음.

Create: `tests/integration/generation.test.ts`
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'
import { createImageGeneration } from '@/lib/actions/generation'
import * as guards from '@/lib/auth/guards'
import { vi } from 'vitest'

const pg = new Client({ connectionString: process.env.DIRECT_URL })
const uId = '77777777-7777-7777-7777-777777777777'
const wId = 'w-' + uId

beforeAll(async () => {
  await pg.connect()
  await pg.query(`insert into users(id,email,topup_code,role) values ($1,$2,'GENU','USER') on conflict (id) do nothing`,
    [uId, `gen_${Date.now()}@x.com`])
  await pg.query(`insert into wallets(id,user_id,balance_krw,updated_at) values ($1,$2,100000,now()) on conflict (id) do nothing`, [wId, uId])
  await pg.query(`insert into models(id,kind,display_name,provider,is_active,margin_pct,pricing_json)
    values ('mock-image','IMAGE','Mock','mock',true,10,'{"kind":"per_image","usd_per_unit":0.04}'::jsonb)
    on conflict (id) do update set is_active=true`)
  // requireUser를 이 사용자로 모킹
  vi.spyOn(guards, 'requireUser').mockResolvedValue({ id: uId, email: 'g@x.com', role: 'USER', display_name: null, topup_code: 'GENU' })
})

afterAll(async () => {
  await pg.query(`delete from wallet_transactions where wallet_id=$1`, [wId])
  await pg.query(`delete from generations where user_id=$1`, [uId])
  await pg.query(`delete from wallets where id=$1`, [wId])
  await pg.query(`delete from users where id=$1`, [uId])
  await pg.query(`delete from models where id='mock-image'`)
  await pg.end()
  vi.restoreAllMocks()
})

describe('createImageGeneration (mock model, real DB)', () => {
  it('생성 성공 시 잔액 차감 + SUCCEEDED + result_urls', async () => {
    const before = await pg.query(`select balance_krw from wallets where id=$1`, [wId])
    const res = await createImageGeneration({ modelId: 'mock-image', prompt: '고양이', count: 1 })
    expect(res.ok).toBe(true)
    const after = await pg.query(`select balance_krw from wallets where id=$1`, [wId])
    expect(after.rows[0].balance_krw).toBeLessThan(before.rows[0].balance_krw)
    if (res.ok) {
      const g = await pg.query(`select status, array_length(result_urls,1) as n, charged_krw from generations where id=$1`, [res.generationId])
      expect(g.rows[0].status).toBe('SUCCEEDED')
      expect(g.rows[0].n).toBe(1)
      expect(g.rows[0].charged_krw).toBeGreaterThan(0)
      // 잔액 = before - charged
      expect(before.rows[0].balance_krw - after.rows[0].balance_krw).toBe(g.rows[0].charged_krw)
    }
  })
})
```
> NOTE: 이 테스트는 mock 어댑터가 Storage에 실제 업로드한다. 업로드 경로 `{uId}/{genId}/output_0.png`는 afterAll의 generations 삭제로 DB에서는 지워지지만 Storage 객체는 남을 수 있다 — afterAll에 `deleteGenerationObjects`로 정리하거나, 무방한 테스트 잔여물로 둔다(Plan 3 cleanup이 처리). 구현 시 Storage 정리도 afterAll에 추가할 것.

Run: `npm run test:integration` (기존 9 + 1). Expected: 통과. mock 어댑터/모델로 외부 호출 없음.

- [ ] **Step 5: 전체 테스트 + 빌드 + Commit**

Run: `npm test && npm run build && npm run typecheck`
```bash
git add -A && git commit -m "feat: 이미지 생성 액션(견적/동기생성/차감/저장/실패환불) + 통합 테스트"
```

---

## Task 5: 모델 카탈로그 페이지 `/models` + 상세 `/models/[id]`

**Files:**
- Create: `lib/actions/models.ts`, `app/(public)/models/page.tsx`, `app/(public)/models/[id]/page.tsx`, `components/models/ModelCard.tsx`
- (참고: `/models`는 공개 — 비로그인 열람 가능. `(public)` 그룹 또는 그룹 없이 배치. middleware가 `/models`를 보호하지 않음 확인.)

- [ ] **Step 1: 모델 조회 액션 (공개)**

Create: `lib/actions/models.ts`
```typescript
'use server'

import { prisma } from '@/lib/db/prisma'
import { getCurrentFxRate } from '@/lib/fx/service'
import { estimateBilledUsd } from '@/lib/models/pricing'
import type { ModelMeta, PricingJson } from '@/lib/models/types'

export async function listActiveModels() {
  const models = await prisma.model.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } })
  const fxRate = await getCurrentFxRate()
  return { models, fxRate }
}

export async function getModelDetail(id: string) {
  const model = await prisma.model.findUnique({ where: { id } })
  if (!model) return null
  const fxRate = await getCurrentFxRate()
  return { model, fxRate }
}

// 카탈로그 카드용 대표 단가(이미지=1장, 영상=최저 tier) 계산 헬퍼
export function lowestBilledUsd(model: {
  kind: string; margin_pct: unknown; pricing_json: unknown
}): number {
  const meta: ModelMeta = {
    id: '', kind: model.kind as 'IMAGE' | 'VIDEO', display_name: '', provider: '',
    is_active: true, margin_pct: Number(model.margin_pct), pricing_json: model.pricing_json as PricingJson,
  }
  if (meta.kind === 'IMAGE') return estimateBilledUsd(meta, { prompt: 'x', count: 1 })
  // 영상: allowed_durations 최저값으로 추정 (Plan 3에서 정교화)
  const p = meta.pricing_json
  if (p.kind === 'per_video_fixed') {
    const durations = p.options.allowed_durations_sec
    const min = Math.min(...durations)
    return estimateBilledUsd(meta, { prompt: 'x', duration_sec: min })
  }
  if (p.kind === 'per_second') {
    const min = Math.min(...p.options.allowed_durations_sec)
    return estimateBilledUsd(meta, { prompt: 'x', duration_sec: min })
  }
  return 0
}
```

- [ ] **Step 2: ModelCard 컴포넌트**

Create: `components/models/ModelCard.tsx`
```tsx
import Link from 'next/link'
import { MoneyText } from '@/components/common/MoneyText'

export function ModelCard({ model, fxRate, lowestUsd }: {
  model: { id: string; kind: string; display_name: string; provider: string; is_active: boolean }
  fxRate: number; lowestUsd: number
}) {
  const krw = Math.round(lowestUsd * fxRate)
  return (
    <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] p-4 flex flex-col gap-2">
      <div className="text-xs text-[var(--text-dim)] uppercase">{model.provider} · {model.kind === 'IMAGE' ? '이미지' : '영상'}</div>
      <div className="font-semibold">{model.display_name}</div>
      <div className="text-sm">
        {model.kind === 'IMAGE' ? '1장' : '최저'} <MoneyText usd={lowestUsd} krw={krw} primary="usd" />~
      </div>
      <Link href={`/generate/${model.id}`}
        className="mt-2 text-center px-3 py-1.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm">
        생성하기
      </Link>
    </div>
  )
}
```

- [ ] **Step 3: 카탈로그 페이지 (공개) + kind 필터**

Create: `app/(public)/models/page.tsx`
```tsx
import { listActiveModels, lowestBilledUsd } from '@/lib/actions/models'
import { ModelCard } from '@/components/models/ModelCard'

export default async function ModelsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams
  const { models, fxRate } = await listActiveModels()
  const filtered = kind === 'image' ? models.filter((m) => m.kind === 'IMAGE')
    : kind === 'video' ? models.filter((m) => m.kind === 'VIDEO') : models
  const images = filtered.filter((m) => m.kind === 'IMAGE')
  const videos = filtered.filter((m) => m.kind === 'VIDEO')
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">모델</h1>
        <div className="text-xs text-[var(--text-dim)]">현재 환율 1USD = {fxRate.toLocaleString('ko-KR')}₩</div>
      </div>
      {images.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3 text-[var(--text-muted)]">이미지</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((m) => <ModelCard key={m.id} model={m} fxRate={fxRate} lowestUsd={lowestBilledUsd(m)} />)}
          </div>
        </section>
      )}
      {videos.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3 text-[var(--text-muted)]">영상</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {videos.map((m) => <ModelCard key={m.id} model={m} fxRate={fxRate} lowestUsd={lowestBilledUsd(m)} />)}
          </div>
        </section>
      )}
    </div>
  )
}
```
> NOTE: `(public)` 그룹에는 인증 셸이 없다. 비로그인도 열람 가능해야 하므로 TopBar 없이 단독 렌더하거나, 공개용 간단 헤더를 둔다. middleware는 `/models`를 보호하지 않음(Plan 1에서 `/wallet`,`/generate`,`/library`,`/account`,`/admin`만 보호) — `/generate/*`는 보호되므로 [생성하기] 클릭 시 비로그인은 로그인으로 유도됨. 확인할 것.

- [ ] **Step 4: 모델 상세 페이지**

Create: `app/(public)/models/[id]/page.tsx` — 모델명/provider, 이미지면 "1장 $X (≈₩Y)", 영상이면 길이별 단가 표(Plan 3에서 영상 생성 연결), [생성하기] → `/generate/[id]`. (이미지 위주로 간단히. MoneyText 사용, getModelDetail 호출. 없으면 notFound().)
```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getModelDetail, lowestBilledUsd } from '@/lib/actions/models'
import { MoneyText } from '@/components/common/MoneyText'

export default async function ModelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getModelDetail(id)
  if (!data) notFound()
  const { model, fxRate } = data
  const lowUsd = lowestBilledUsd(model)
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
      <Link href="/models" className="text-sm text-[var(--text-muted)]">← 모델</Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{model.display_name}</h1>
          <div className="text-sm text-[var(--text-dim)]">{model.provider} · {model.kind === 'IMAGE' ? '이미지 모델' : '영상 모델'}</div>
        </div>
        <Link href={`/generate/${model.id}`} className="px-4 py-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm">생성하기</Link>
      </div>
      <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] p-5 text-sm">
        <div className="text-[var(--text-muted)] mb-2">가격 (마진 포함 · 1USD={fxRate.toLocaleString('ko-KR')}₩)</div>
        <div>{model.kind === 'IMAGE' ? '이미지 1장' : '최저'} <MoneyText usd={lowUsd} krw={Math.round(lowUsd * fxRate)} primary="usd" /></div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 빌드 + Commit**

Run: `npm run build && npm run typecheck && npm test`
```bash
git add -A && git commit -m "feat: 모델 카탈로그 + 상세 페이지(공개)"
```

---

## Task 6: 생성 스튜디오 `/generate/[modelId]` (이미지)

**Files:**
- Create: `app/(app)/generate/[modelId]/page.tsx`, `components/generate/ImageStudio.tsx`
- (인증 필요 — `(app)` 그룹 아래. middleware가 `/generate` 보호.)

- [ ] **Step 1: 스튜디오 서버 페이지 (모델 로드 + 가드)**

Create: `app/(app)/generate/[modelId]/page.tsx`
```tsx
import { notFound, redirect } from 'next/navigation'
import { getModelDetail } from '@/lib/actions/models'
import { ImageStudio } from '@/components/generate/ImageStudio'

export default async function GeneratePage({ params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params
  const data = await getModelDetail(modelId)
  if (!data || !data.model.is_active) notFound()
  if (data.model.kind !== 'IMAGE') redirect('/models') // 영상은 Plan 3
  return (
    <ImageStudio
      modelId={data.model.id}
      modelName={data.model.display_name}
      fxRate={data.fxRate}
    />
  )
}
```

- [ ] **Step 2: ImageStudio 클라이언트 컴포넌트 (프롬프트 + 견적 + 생성)**

Create: `components/generate/ImageStudio.tsx`
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { estimateGeneration, createImageGeneration } from '@/lib/actions/generation'
import { formatKrw, formatUsd } from '@/components/common/MoneyText'

export function ImageStudio({ modelId, modelName, fxRate }: {
  modelId: string; modelName: string; fxRate: number
}) {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [est, setEst] = useState<{ usd: number; krw: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onEstimate() {
    if (!prompt.trim()) return
    const res = await estimateGeneration({ modelId, prompt, count: 1 })
    if (res.ok) setEst({ usd: res.billedUsd, krw: res.krw })
    else setError(res.message)
  }

  async function onGenerate() {
    setLoading(true); setError(null)
    const res = await createImageGeneration({ modelId, prompt, count: 1 })
    setLoading(false)
    if (res.ok) router.push(`/library/${res.generationId}`)
    else setError(res.message)
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h1 className="text-lg font-bold">{modelName}</h1>
        <textarea
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); setEst(null) }}
          onBlur={onEstimate}
          maxLength={2000}
          placeholder="생성할 이미지를 설명하세요"
          className="w-full h-40 px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)]"
        />
        <div className="text-xs text-[var(--text-dim)] text-right">{prompt.length}/2000</div>
        {est && (
          <div className="rounded-md bg-[var(--bg-surface)] border border-[var(--border)] p-3 text-sm">
            예상 차감 <span className="font-mono">{formatUsd(est.usd)}</span> ≈ <span className="font-mono">{formatKrw(est.krw)}</span>
            <div className="text-xs text-[var(--text-dim)] mt-1">현재 환율 1USD={fxRate.toLocaleString('ko-KR')}₩ · 마진 포함</div>
          </div>
        )}
        {error && <p className="text-[var(--danger)] text-sm">{error}</p>}
        <button onClick={onGenerate} disabled={loading || !prompt.trim()}
          className="w-full py-2.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50">
          {loading ? '생성 중… (최대 30초)' : '✨ 생성하기'}
        </button>
      </div>
      <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] min-h-[300px] flex items-center justify-center text-[var(--text-dim)] text-sm">
        {loading ? '이미지를 생성하고 있습니다…' : '생성 결과가 여기에 표시됩니다'}
      </div>
    </div>
  )
}
```
> NOTE: 동기 이미지 생성은 최대 ~30초. Server Action 기본 타임아웃 내. 페이지에 `export const maxDuration = 60` 추가 가능(Vercel). 생성 성공 시 `/library/[id]`로 이동해 결과 표시.

- [ ] **Step 3: 빌드 + Commit**

Run: `npm run build && npm run typecheck`
```bash
git add -A && git commit -m "feat: 이미지 생성 스튜디오(/generate/[modelId])"
```

---

## Task 7: 라이브러리 `/library` + 결과 상세 `/library/[genId]`

**Files:**
- Create: `lib/actions/library.ts`, `app/(app)/library/page.tsx`, `app/(app)/library/[genId]/page.tsx`, `components/library/GenerationGrid.tsx`, `components/library/ResultViewer.tsx`

- [ ] **Step 1: 라이브러리 조회 액션 + 서명 URL**

Create: `lib/actions/library.ts`
```typescript
'use server'

import { requireUser } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { getSignedUrl } from '@/lib/storage/signed-url'

export async function listMyGenerations() {
  const user = await requireUser()
  return prisma.generation.findMany({
    where: { user_id: user.id },
    orderBy: { created_at: 'desc' },
    take: 60,
  })
}

export async function getMyGeneration(id: string) {
  const user = await requireUser()
  const gen = await prisma.generation.findUnique({ where: { id } })
  if (!gen || gen.user_id !== user.id) return null
  // 첫 결과의 서명 URL (만료 전이고 result_urls 있을 때만)
  let signedUrls: string[] = []
  if (gen.result_urls.length > 0) {
    const urls = await Promise.all(gen.result_urls.map((p) => getSignedUrl(p)))
    signedUrls = urls.filter((u): u is string => !!u)
  }
  return { gen, signedUrls }
}
```

- [ ] **Step 2: GenerationGrid + 라이브러리 페이지**

Create: `components/library/GenerationGrid.tsx`
```tsx
import Link from 'next/link'
import { formatKrw } from '@/components/common/MoneyText'

type Gen = {
  id: string; kind: string; status: string; charged_krw: number | null
  created_at: Date; expires_at: Date | null; result_urls: string[]
}

const statusLabel: Record<string, string> = {
  PENDING: '대기', RUNNING: '생성 중', SUCCEEDED: '완료', FAILED: '실패', CANCELED: '취소',
}

export function GenerationGrid({ items }: { items: Gen[] }) {
  if (items.length === 0) {
    return <p className="text-[var(--text-dim)] text-sm py-12 text-center">아직 생성한 결과가 없습니다. 모델에서 첫 이미지를 만들어보세요.</p>
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((g) => {
        const expired = !!g.expires_at && new Date(g.expires_at) < new Date()
        return (
          <Link key={g.id} href={`/library/${g.id}`}
            className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] p-3 hover:border-[var(--accent)]">
            <div className="aspect-square rounded bg-[var(--bg-surface-2)] mb-2 flex items-center justify-center text-xs text-[var(--text-dim)]">
              {expired ? '만료됨' : g.status === 'SUCCEEDED' ? '이미지' : statusLabel[g.status] ?? g.status}
            </div>
            <div className="text-xs flex justify-between">
              <span>{statusLabel[g.status] ?? g.status}</span>
              <span className="font-mono">{g.charged_krw ? formatKrw(g.charged_krw) : '-'}</span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
```

Create: `app/(app)/library/page.tsx`
```tsx
import { listMyGenerations } from '@/lib/actions/library'
import { GenerationGrid } from '@/components/library/GenerationGrid'

export default async function LibraryPage() {
  const items = await listMyGenerations()
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">라이브러리</h1>
        <span className="text-xs text-[var(--text-dim)]">생성물은 30일 후 자동 삭제됩니다</span>
      </div>
      <GenerationGrid items={items} />
    </div>
  )
}
```

- [ ] **Step 3: ResultViewer + 결과 상세 페이지**

Create: `components/library/ResultViewer.tsx`
```tsx
'use client'

import Image from 'next/image'

export function ResultViewer({ urls, status }: { urls: string[]; status: string }) {
  if (status !== 'SUCCEEDED') {
    return <div className="aspect-square rounded-lg bg-[var(--bg-surface-2)] flex items-center justify-center text-[var(--text-dim)]">
      {status === 'FAILED' ? '생성 실패 (환불됨)' : '생성 중…'}
    </div>
  }
  if (urls.length === 0) {
    return <div className="aspect-square rounded-lg bg-[var(--bg-surface-2)] flex items-center justify-center text-[var(--text-dim)]">
      파일이 삭제되었습니다 (30일 경과)
    </div>
  }
  return (
    <div className="space-y-3">
      {urls.map((u, i) => (
        <img key={i} src={u} alt={`결과 ${i + 1}`} className="w-full rounded-lg border border-[var(--border)]" />
      ))}
      <a href={urls[0]} download className="inline-block px-4 py-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm">다운로드</a>
    </div>
  )
}
```
> NOTE: 서명 URL은 Supabase 도메인. `next.config.ts`의 이미지 도메인 설정이 필요하면 `<img>`(일반 태그) 사용으로 회피(위 코드). next/image 쓰려면 remotePatterns 추가.

Create: `app/(app)/library/[genId]/page.tsx`
```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getMyGeneration } from '@/lib/actions/library'
import { ResultViewer } from '@/components/library/ResultViewer'
import { MoneyText } from '@/components/common/MoneyText'

export default async function GenerationDetailPage({ params }: { params: Promise<{ genId: string }> }) {
  const { genId } = await params
  const data = await getMyGeneration(genId)
  if (!data) notFound()
  const { gen, signedUrls } = data
  return (
    <div className="space-y-4">
      <Link href="/library" className="text-sm text-[var(--text-muted)]">← 라이브러리</Link>
      <div className="grid md:grid-cols-2 gap-6">
        <ResultViewer urls={signedUrls} status={gen.status} />
        <div className="space-y-3 text-sm">
          <div className="font-semibold">{gen.model_id} · {gen.kind === 'IMAGE' ? '이미지' : '영상'}</div>
          <div>상태: {gen.status}</div>
          {gen.charged_krw != null && (
            <div>차감: <MoneyText krw={gen.charged_krw} usd={gen.cost_usd_billed ? Number(gen.cost_usd_billed) : undefined} primary="krw" /></div>
          )}
          <div className="text-[var(--text-muted)]">프롬프트</div>
          <p className="text-[var(--text-primary)]">{gen.prompt}</p>
          {gen.expires_at && <div className="text-xs text-[var(--text-dim)]">만료: {new Date(gen.expires_at).toLocaleDateString('ko-KR')}</div>}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 빌드 + Commit**

Run: `npm run build && npm run typecheck && npm test`
```bash
git add -A && git commit -m "feat: 라이브러리(목록 + 결과 상세 + 서명URL 다운로드)"
```

---

## Task 8: E2E — 충전(seed) → 이미지 생성(mock) → 차감 → 라이브러리

**Files:**
- Create: `tests/e2e/generation-flow.spec.ts`

- [ ] **Step 1: E2E 시나리오 (self-contained, mock 모델, 외부 API 0)**

`mock-image` 모델을 DB에 보장하고, 잔액을 admin/pg로 채운 뒤, UI로 생성 → 차감 → 라이브러리 확인. (Task 4 통합 테스트와 달리 실제 UI/브라우저 경유.)

Create: `tests/e2e/generation-flow.spec.ts`
```typescript
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const pg = new Client({ connectionString: process.env.DIRECT_URL })
const stamp = Date.now()
const email = `e2e_gen_${stamp}@example.com`
const pwd = 'Test1234!'
let userId = ''

test.beforeAll(async () => {
  await pg.connect()
  const u = await admin.auth.admin.createUser({ email, password: pwd, email_confirm: true })
  userId = u.data.user!.id
  // 잔액 충전 (직접 wallet 업데이트 대신 ledger 일관성 위해 wallet_apply_tx 사용)
  const w = await pg.query(`select id from wallets where user_id=$1`, [userId])
  await pg.query(`select wallet_apply_tx($1::text,'TOPUP',100000::int,'seed',null,'e2e')`, [w.rows[0].id])
  // mock 모델 보장
  await pg.query(`insert into models(id,kind,display_name,provider,is_active,margin_pct,pricing_json)
    values ('mock-image','IMAGE','Mock Image','mock',true,10,'{"kind":"per_image","usd_per_unit":0.04}'::jsonb)
    on conflict (id) do update set is_active=true`)
})

test.afterAll(async () => {
  await pg.query(`delete from wallet_transactions where wallet_id in (select id from wallets where user_id=$1)`, [userId])
  await pg.query(`delete from generations where user_id=$1`, [userId])
  await pg.query(`delete from wallets where user_id=$1`, [userId])
  await pg.query(`delete from users where id=$1`, [userId])
  // mock 모델은 공용일 수 있으니 비활성만 (삭제 시 다른 테스트 영향 방지) — 여기선 남겨둠
  await admin.auth.admin.deleteUser(userId)
  await pg.end()
})

test('로그인 → mock 이미지 생성 → 차감 → 라이브러리 표시', async ({ page }) => {
  await page.goto('/auth/login')
  await page.getByPlaceholder('이메일').fill(email)
  await page.getByPlaceholder('비밀번호').fill(pwd)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL('**/wallet')

  await page.goto('/generate/mock-image')
  await page.getByPlaceholder('생성할 이미지를 설명하세요').fill('테스트 고양이')
  await page.getByRole('button', { name: /생성하기/ }).click()
  // 성공 시 /library/[id]로 이동
  await page.waitForURL('**/library/**', { timeout: 30000 })
  await expect(page.getByText('SUCCEEDED')).toBeVisible()

  // 잔액 차감 확인
  await page.goto('/wallet')
  const bal = await pg.query(`select balance_krw from wallets where user_id=$1`, [userId])
  expect(bal.rows[0].balance_krw).toBeLessThan(100000)
})
```

- [ ] **Step 2: 실행**

Run: `npm run test:e2e`
Expected: 통과(기존 topup-flow + 이 generation-flow). 셀렉터/타이밍 이슈 시 robust하게 수정(상태 텍스트, waitForURL). 핵심 단언(차감 발생 + 결과 SUCCEEDED) 약화 금지.

- [ ] **Step 3: 전체 게이트 + Commit**

Run: `npm test && npm run test:integration && npm run build && npm run typecheck && npm run test:e2e`
```bash
git add -A && git commit -m "test: 이미지 생성 플로우 E2E(로그인→생성→차감→라이브러리)"
```

---

## 완료 기준 (Plan 2 Definition of Done)

- [ ] `npm run typecheck` / `npm run lint` 통과
- [ ] `npm test`(유닛) 통과 — 어댑터/레지스트리/정산/생성검증 추가
- [ ] `npm run test:integration` 통과 — storage + generation(mock 모델, 실 DB 차감) 추가
- [ ] `npm run test:e2e` 통과 — generation-flow 추가
- [ ] mock 모델로 "생성 → 차감 → 라이브러리" 종단 검증 (외부 유료 API 0)
- [ ] (선택) `OPENAI_API_KEY` 설정 후 `gpt-image-2.0`로 실제 이미지 1장 수동 생성 확인

이 Plan 완료 시 "이미지를 생성하면 잔액이 차감되고 라이브러리에 결과가 남는" 종단 흐름이 동작한다. 다음은 **Plan 3 (영상 비동기 + 폴링 cron + Realtime + 나머지 이미지 어댑터 + 30일 cleanup)**.

---

## 소유주 액션 (Plan 2 실제 운영용 — 테스트엔 불필요)

- `.env.local`에 `OPENAI_API_KEY=sk-...` 설정 (실제 GPT-Image 생성 시). 없어도 mock 모델·테스트는 동작.
- 실제 운영 시 `mock-image` 모델은 seed/카탈로그에서 제외하거나 `is_active=false`로 둘 것(테스트 전용).

---

## Self-Review 결과

- **Spec 커버리지**: 어댑터(§5), 이미지 동기 흐름(§6), 가격(§7b, 재사용), 카탈로그(pages §1.3/1.4), 스튜디오(pages §1.5 이미지부), 라이브러리(pages §1.8/1.9), 스토리지(§8 업로드/서명URL; 30일 cleanup cron은 Plan 3) 매핑됨. 영상·Realtime·cleanup·나머지 어댑터는 명시적으로 Plan 3.
- **Placeholder 스캔**: 모든 코드 스텝에 실제 코드 포함.
- **타입 일관성**: `ImageAdapter`/`ImageGenerateResult`(adapter↔registry↔gpt-image↔mock), `ModelMeta`/`PricingJson`(Plan 1 재사용), `CreateResult`/`EstimateResult`(generation action↔ImageStudio), `wallet_apply_tx` text 시그니처(호출부 `::text`) 일치.
- **불변식 유지**: 차감/환불 모두 `wallet_apply_tx` 경유. 잔액 직접 수정 없음. INSUFFICIENT_BALANCE는 트랜잭션 롤백으로 generation 미생성.
- **비용 안전**: E2E·통합 테스트는 mock 어댑터/모델로 외부 유료 호출 0.
