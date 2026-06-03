# NS Field — Plan 3: P3 영상 비동기 + 확장 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 영상 모델을 비동기 큐(작업 등록 → Vercel Cron 폴링 → 완료 시 저장·정산, 실패 시 환불)로 생성하고, 클라이언트는 Supabase Realtime으로 상태를 실시간 수신하며, 30일 지난 생성물은 자동 삭제되도록 한다. 나머지 이미지 어댑터도 추가한다.

**Architecture:** Plan 1/2의 레이어·불변식 유지. 영상은 `mode:'async'` 어댑터 — `start()`로 외부 작업 등록 후 `external_job_id` 저장, Cron이 `poll()`로 상태 조회. 차감/환불 모두 `wallet_apply_tx` 경유. 외부 영상 API는 어댑터 뒤에 격리, 결정적 **mock-video** 어댑터로 전 흐름 검증.

**Tech Stack:** Plan 1/2와 동일 + Vercel Cron(poll/cleanup) + Supabase Realtime.

**관련 설계:** `docs/superpowers/specs/2026-05-27-nsfield-design.md`(§7 영상 비동기, §7c 길이, §8 30일), `docs/ARCHITECTURE.md`(§3.2, §8 Cron), `docs/superpowers/specs/2026-05-30-nsfield-pages.md`(§1.5 영상 옵션, §1.8/1.9).

**범위(P3):** 영상 어댑터 인터페이스(async)+mock-video, 나머지 이미지 어댑터(Seedream/Nanobanana×2, best-effort), 영상 생성 액션(async start+hold 차감), poll-generations cron(완료·실패·타임아웃), Realtime 구독, 영상 스튜디오(길이 선택), cleanup-expired cron + 만료 UX, E2E(mock-video 폴링 시뮬).
**범위 밖:** 관리자 페이지·rate-limit·보안헤더·배포(Plan 4).

**Plan 1/2 학습 (반드시 준수):** TEXT id, `@/lib/db/prisma` 싱글톤, dotenv-cli, auth/storage 스키마 마이그레이션은 create-only+deploy, psql 없음→pg 통합테스트, `@updatedAt`은 raw insert 시 now(), wallet 변동은 `wallet_apply_tx`만, mock 어댑터는 non-production만 등록, FX는 fresh 캐시 필요.

---

## Task 0: 브랜치
- [ ] `git checkout main && git pull && git checkout -b feature/p3-video-async`

---

## Task 1: 영상 어댑터 인터페이스(async) + mock-video + 나머지 이미지 어댑터

**Files:** `lib/models/adapter.ts`(확장), `lib/models/video/mock.ts`, `lib/models/video/{seedance,kling,veo3}.ts`, `lib/models/image/{seedream,nanobanana}.ts`, `lib/models/registry.ts`(확장)
**Test:** `tests/unit/models/video-mock.test.ts`, `tests/unit/models/registry.test.ts`(확장)

- [ ] **Step 1: adapter.ts에 VideoAdapter 추가**
```typescript
// lib/models/adapter.ts 에 추가
export type VideoStartResult = { externalJobId: string; cost_usd_raw_estimate?: number }
export type VideoPollResult =
  | { status: 'running' }
  | { status: 'succeeded'; videoUrl: string; cost_usd_raw: number; meta?: Record<string, unknown> }
  | { status: 'failed'; reason: string }

export interface VideoAdapter {
  id: string
  kind: 'VIDEO'
  // 외부 작업 등록 (즉시 반환, 결과는 폴링)
  start(params: GenerationParams): Promise<VideoStartResult>
  // 외부 작업 상태 조회
  poll(externalJobId: string): Promise<VideoPollResult>
}
```

- [ ] **Step 2: mock-video 어댑터 (결정적: start→즉시 완료될 job, poll→succeeded)**
```typescript
// lib/models/video/mock.ts
import type { VideoAdapter, VideoStartResult, VideoPollResult } from '../adapter'
import type { GenerationParams } from '../types'

// 외부 호출 없이 동작. job id에 'mock-done-'을 붙여 poll이 즉시 succeeded 반환.
export const mockVideoAdapter: VideoAdapter = {
  id: 'mock-video',
  kind: 'VIDEO',
  async start(_params: GenerationParams): Promise<VideoStartResult> {
    return { externalJobId: `mock-done-${Date.now()}` }
  },
  async poll(externalJobId: string): Promise<VideoPollResult> {
    if (externalJobId.startsWith('mock-done-')) {
      // 1x1 png를 영상 대용으로 저장(실제 영상 대신 결정적 바이트). 저장 경로는 .mp4지만 테스트 목적.
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
```

- [ ] **Step 3: 실제 영상/이미지 어댑터 (best-effort, 소유주가 스펙/키 확정)**
각 파일에 어댑터를 만들되, 실제 API 엔드포인트/요청 형식은 공식 문서 확정 전까지 TODO 주석 + `process.env.<PROVIDER>_API_KEY` 사용. 키 없으면 `AdapterError('<CODE>_NO_KEY')`. 예 `lib/models/video/veo3.ts`:
```typescript
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
```
`kling.ts`(Kuaishou), `seedance.ts`(ByteDance)도 동일 골격(KLING_API_KEY/BYTEDANCE_API_KEY). 이미지 `seedream.ts`/`nanobanana.ts`는 Plan 2의 `ImageAdapter` 형태로 골격 작성(BYTEDANCE_API_KEY/NANOBANANA_API_KEY). nanobanana는 2.0/Pro를 id로 분기(`nanobanana-2.0`, `nanobanana-pro`).
> 핵심: 골격이 typecheck/lint를 통과하고 레지스트리에 등록되며, 키 없으면 명확한 AdapterError를 던지면 충분. 실제 호출 정확성은 소유주가 키 설정 후 검증.

- [ ] **Step 4: 레지스트리 확장 (이미지 + 영상, mock은 non-prod만)**
```typescript
// lib/models/registry.ts
import type { ImageAdapter, VideoAdapter } from './adapter'
import { gptImageAdapter } from './image/gpt-image'
import { seedreamAdapter } from './image/seedream'
import { nanobanana20Adapter, nanobananaProAdapter } from './image/nanobanana'
import { mockImageAdapter } from './image/mock'
import { veo3Adapter } from './video/veo3'
import { klingAdapter } from './video/kling'
import { seedanceAdapter } from './video/seedance'
import { mockVideoAdapter } from './video/mock'

const isNonProd = process.env.NODE_ENV !== 'production'

const imageAdapters: Record<string, ImageAdapter> = {
  [gptImageAdapter.id]: gptImageAdapter,
  [seedreamAdapter.id]: seedreamAdapter,
  [nanobanana20Adapter.id]: nanobanana20Adapter,
  [nanobananaProAdapter.id]: nanobananaProAdapter,
  ...(isNonProd ? { [mockImageAdapter.id]: mockImageAdapter } : {}),
}
const videoAdapters: Record<string, VideoAdapter> = {
  [veo3Adapter.id]: veo3Adapter,
  [klingAdapter.id]: klingAdapter,
  [seedanceAdapter.id]: seedanceAdapter,
  ...(isNonProd ? { [mockVideoAdapter.id]: mockVideoAdapter } : {}),
}

export function getImageAdapter(modelId: string): ImageAdapter | null { return imageAdapters[modelId] ?? null }
export function getVideoAdapter(modelId: string): VideoAdapter | null { return videoAdapters[modelId] ?? null }
```

- [ ] **Step 5: 테스트** — mock-video start→poll(succeeded) 단위 테스트; registry가 영상/이미지 어댑터 + non-prod mock 반환 검증. 빌드/타입체크/lint. Commit `feat: 영상 어댑터(async) + mock-video + 나머지 이미지/영상 어댑터 골격`.

---

## Task 2: 영상 길이 검증 + 영상 생성 액션 (async start, hold 차감)

**Files:** `lib/validation/generation.ts`(확장: video schema), `lib/actions/generation.ts`(확장: createVideoGeneration)
**Test:** `tests/unit/validation/video.test.ts`, `tests/integration/video-start.test.ts`

- [ ] **Step 1: 영상 입력 검증** — `videoGenerateSchema { modelId, prompt(1~2000), duration_sec(∈ ALLOWED_DURATIONS_SEC) }`. 모델 지원 길이는 액션에서 pricing 통해 검증(`estimateRawUsd`가 UNSUPPORTED_DURATION throw).

- [ ] **Step 2: createVideoGeneration 액션** (Plan 2 이미지 액션과 동일 골격, 단 어댑터는 start만):
```
requireUser → 검증 → model(VIDEO,active) + getVideoAdapter → wallet
billedUsd=estimateBilledUsd(meta,{prompt,duration_sec}) (UNSUPPORTED_DURATION → {ok:false,code:'DURATION'})
fxRate=getCurrentFxRate (try/catch)
krw=usdToKrw
$transaction: Generation.create(VIDEO, PENDING, params_json={duration_sec}, cost_usd_billed/margin/fx/charged_krw) + wallet_apply_tx(CHARGE,-krw)  // hold 차감
  INSUFFICIENT_BALANCE → {ok:false,code:'INSUFFICIENT'}
adapter.start(params) → externalJobId  (try/catch → 실패 시 REFUND + FAILED, {ok:false,code:'ADAPTER'})
Generation.update(status=RUNNING, external_job_id, started_at)
revalidatePath('/library')
return {ok:true, generationId}
```
> 영상은 결과를 지금 받지 않음 → status=RUNNING으로 종료. 완료는 Task 3 cron이 처리. 차감은 견적 기준 hold(설계 §7b 방식 b).

- [ ] **Step 3: 통합 테스트** — mock-video 모델/어댑터를 DB에 삽입, fresh fx, wallet 충전 후 `createVideoGeneration` 호출 → 잔액 차감 + Generation status=RUNNING + external_job_id 존재 검증. afterAll 정리. (폴링 완료는 Task 3에서.)

- [ ] **Step 4:** 빌드/타입체크/테스트. Commit `feat: 영상 생성 액션(async 작업 등록 + hold 차감)`.

---

## Task 3: poll-generations cron (완료·실패·30분 타임아웃 + 정산/환불)

**Files:** `lib/jobs/poll-generations.ts`(핵심 로직 — 테스트 용이하게 분리), `app/api/cron/poll-generations/route.ts`, `vercel.json`(확장)
**Test:** `tests/integration/poll-generations.test.ts`

- [ ] **Step 1: 폴링 로직 (lib/jobs/poll-generations.ts)**
```
pollRunningVideoGenerations():
  rows = SELECT generations WHERE status='RUNNING' AND kind='VIDEO'
         AND (last_polled_at IS NULL OR now()-last_polled_at > polling_interval(모델))
         LIMIT 50
  for each gen:
    if now()-started_at > 30min: → FAILED('timeout') + REFUND(charged_krw); continue
    adapter=getVideoAdapter(gen.model_id); if !adapter: continue
    r = await adapter.poll(gen.external_job_id)
    running → UPDATE last_polled_at=now()
    succeeded → videoUrl 다운로드(data: 또는 http) → Storage 업로드({user}/{gen}/output_0.mp4)
                → 정산(computeSettlementKrw; mock=동일) → SUCCEEDED + result_urls + expires_at(+30d) + cost_usd_raw
    failed → FAILED(reason) + REFUND(charged_krw)
  return {processed, succeeded, failed}
```
멱등: 상태 전이는 `WHERE status='RUNNING'` 조건으로 UPDATE. 환불/정산도 한 번만.
> videoUrl이 `data:`면 base64 추출 업로드, `http(s)`면 fetch 다운로드 후 업로드. mock-video는 data: 사용 → 네트워크 0.

- [ ] **Step 2: cron 라우트** — `GET` + `Authorization: Bearer CRON_SECRET` 검증 → `pollRunningVideoGenerations()` → JSON 결과. `vercel.json`에 `{ "path":"/api/cron/poll-generations", "schedule":"* * * * *" }` 추가.

- [ ] **Step 3: 통합 테스트** — mock-video로 RUNNING generation 생성(Task 2 액션 또는 직접 insert) → `pollRunningVideoGenerations()` 호출 → SUCCEEDED + result_urls 채워짐 검증. 그리고 별도 케이스: started_at을 31분 전으로 조작한 RUNNING → 폴링 → FAILED + REFUND(잔액 복구) 검증. afterAll Storage/DB 정리.

- [ ] **Step 4:** 빌드/테스트. Commit `feat: 영상 폴링 cron(완료·실패·타임아웃 + 정산/환불)`.

---

## Task 4: Supabase Realtime — 생성 상태 실시간 구독

**Files:** `db/sql/realtime/generations_publication.sql`(마이그레이션), `components/library/GenerationLiveStatus.tsx`(client), 라이브러리 페이지에 연결
**Test:** 수동/E2E (Realtime는 단위 테스트 어려움 — E2E Task 7에서 간접 검증)

- [ ] **Step 1: publication 마이그레이션** (storage/auth 아님이지만 안전하게 create-only+deploy)
```sql
-- generations 테이블 Realtime 발행 + RLS는 이미 자기 행만 SELECT 허용하므로 구독도 제한됨
alter publication supabase_realtime add table generations;
```
(이미 추가돼 있으면 에러 무시 처리: `do $$ begin ... exception when duplicate_object then null; end $$;` 형태로 감싸기)

- [ ] **Step 2: 클라이언트 구독 컴포넌트** — `GenerationLiveStatus`가 `createClient()`(브라우저)로 `generations` 테이블의 `user_id=eq.<me>` UPDATE를 구독, 상태 변경 시 `router.refresh()`. 라이브러리 목록/상세에 마운트. RLS가 타인 행 구독 차단.

- [ ] **Step 3:** 빌드/타입체크. Commit `feat: 생성 상태 Supabase Realtime 구독`.

---

## Task 5: 영상 스튜디오 (길이 선택) — /generate/[modelId] 영상 분기

**Files:** `components/generate/VideoStudio.tsx`, `app/(app)/generate/[modelId]/page.tsx`(영상 분기 해제)

- [ ] **Step 1: 페이지 분기** — 현재 `kind!=='IMAGE'`면 redirect였던 것을 제거, IMAGE→ImageStudio, VIDEO→VideoStudio.
- [ ] **Step 2: VideoStudio** — 프롬프트 + 길이 셀렉터(3·5·10·15·30·60, 모델 `allowed_durations_sec` 외 disabled+툴팁) + 견적(estimateGeneration에 duration_sec 전달; estimate 액션도 duration 지원하도록 확장) + 생성 버튼 → createVideoGeneration → `/library/[id]`(RUNNING 상태로 진입, Realtime이 완료 갱신). pages §1.5 영상 옵션 참고.
- [ ] **Step 3:** 빌드/테스트. Commit `feat: 영상 생성 스튜디오(길이 선택)`.

---

## Task 6: cleanup-expired cron + 만료 UX

**Files:** `lib/jobs/cleanup-expired.ts`, `app/api/cron/cleanup-expired/route.ts`, `vercel.json`(확장), 라이브러리 만료 표시(이미 Plan 2에 일부 있음 — 확인)
**Test:** `tests/integration/cleanup-expired.test.ts`

- [ ] **Step 1: cleanup 로직** — `SELECT generations WHERE expires_at<now() AND result_urls IS NOT NULL AND array_length(result_urls,1)>0 LIMIT 500` → 각 행 Storage 객체 삭제 + `UPDATE result_urls='{}', input_image_url=NULL` (메타·비용·프롬프트 보존). 멱등.
- [ ] **Step 2: cron 라우트** + CRON_SECRET + `vercel.json`에 `{ "path":"/api/cron/cleanup-expired","schedule":"0 19 * * *" }`(KST 04:00).
- [ ] **Step 3: 통합 테스트** — 만료된(expires_at 과거) result_urls 있는 generation + Storage 객체 생성 → cleanup 호출 → Storage 삭제 + result_urls 비워짐 + 메타 보존 검증.
- [ ] **Step 4:** 라이브러리 UI에서 만료 행은 "파일 삭제됨" 표시 확인(Plan 2 ResultViewer/Grid에 이미 처리됨 — 검증만). Commit `feat: 30일 만료 cleanup cron + 만료 UX 확인`.

---

## Task 7: E2E — 영상 생성(mock-video) → 폴링 → SUCCEEDED

**Files:** `tests/e2e/video-flow.spec.ts`

- [ ] **Step 1: 시나리오** (self-contained, mock-video):
```
beforeAll: 확인된 유저 생성 + wallet 충전 + fresh fx + mock-video 모델 insert(VIDEO, per_video_fixed tiers)
test:
  로그인 → /generate/mock-video → 길이 5초 선택 → 프롬프트 → 생성 → /library/[id] 진입(RUNNING 표시)
  서버에서 폴링 트리거: fetch('/api/cron/poll-generations', {headers:{authorization:'Bearer '+CRON_SECRET}})  // 또는 pollRunningVideoGenerations 직접 호출
  page.reload() 또는 Realtime 대기 → 'SUCCEEDED' 표시
  DB: 잔액 차감 확인
afterAll: Storage/DB/유저 정리, mock-video is_active=false
```
> CRON_SECRET은 .env.local(playwright config가 로드). webServer는 dev(NODE_ENV!=production, mock 등록).

- [ ] **Step 2:** `npm run test:e2e`(기존 2 + 1 = 3). 핵심 단언(차감 + SUCCEEDED) 약화 금지. Commit `test: 영상 생성 E2E(생성→폴링→완료)`.

---

## 완료 기준 (Plan 3 DoD)
- [ ] typecheck/lint/unit/integration/e2e 전부 green
- [ ] mock-video로 "영상 생성→폴링→완료→차감/저장" + "타임아웃→환불" 검증
- [ ] cleanup으로 "만료→파일삭제·메타보존" 검증
- [ ] (선택) 실제 영상 API 키 설정 후 1개 모델 수동 검증

## 소유주 액션
- 영상/이미지 실제 API 키: `GOOGLE_API_KEY`/`KLING_API_KEY`/`BYTEDANCE_API_KEY`/`NANOBANANA_API_KEY` (`.env.example`에 항목 추가) + 각 어댑터의 실제 엔드포인트/스키마 확정(TODO 주석)
- Vercel Cron은 배포(Plan 4) 후 활성화

---
**Self-Review:** 영상 비동기(§7)·폴링·타임아웃·환불·정산, 길이(§7c), 30일(§8), Realtime(§3.2), 나머지 어댑터 — 매핑됨. mock으로 비용 0 검증. 실제 외부 API는 소유주 확정(OPENAI 패턴 동일).
