# NS Field — AtlasCloud 멀티모델 통합 설계 (A+ config 기반)

- **작성일**: 2026-06-03
- **상태**: 설계 확정 (구현 계획 직전)
- **목표**: AtlasCloud의 17개 모델을 패밀리별 그룹 브라우징 + 모달리티별 적응 생성 폼으로 통합. 각 모델의 고유 강점(오디오·last_frame·다중참조·비디오트림·thinking level 등)을 100% 노출.

---

## 0. 핵심 원칙

**제너릭은 *메커니즘*에만, *기능*은 모델별 100%.** 단일 config 스키마 + 단일 AtlasCloud 클라이언트로 중복을 없애되, 각 모델 config가 자기 파라미터를 빠짐없이 선언하고 폼 빌더가 풍부한 입력 타입을 렌더한다. 제너릭으로 부족한 모델은 전용 폼(이스케이프 해치)으로 교체.

확정된 AtlasCloud 통합 패턴:
- 제출: `POST /api/v1/model/generateImage`(이미지) 또는 `generateVideo`(영상) → `{data:{id}}`
- 폴링: `GET /api/v1/model/prediction/{id}` → `data.status`(processing/created→completed/succeeded→outputs[0] / failed/timeout→error)
- model 문자열: `provider/이름/모달리티` (예: `google/veo3.1/text-to-video`)
- 입력 미디어: URL / base64 / `asset://ID`. 파일은 `POST /uploadMedia`(multipart).
- 인증: `Authorization: Bearer ATLASCLOUD_API_KEY`

---

## 1. 모델 config (코드 레지스트리, 타입 안전)

`lib/models/catalog/types.ts`:
```typescript
export type Family = 'nanobanana' | 'seedream' | 'veo3.1' | 'seedance' | 'kling'
export type Modality =
  | 'text-to-image' | 'reference-to-image'
  | 'text-to-video' | 'image-to-video' | 'reference-to-video'

export type FieldType =
  | { kind: 'prompt'; required?: boolean }
  | { kind: 'negative_prompt' }
  | { kind: 'select'; param: string; label: string; options: { value: string; label: string }[]; default?: string }
  | { kind: 'int'; param: string; label: string; options?: number[]; min?: number; max?: number; default?: number }
  | { kind: 'toggle'; param: string; label: string; default?: boolean }
  | { kind: 'image'; param: string; label: string; required?: boolean }
  | { kind: 'images'; param: string; label: string; max: number }
  | { kind: 'video_clip'; param: string; label: string; required?: boolean }

export type ModelConfig = {
  id: string                    // 내부 id (= DB Model.id), 예 'veo3.1-text-to-video'
  atlasModel: string            // AtlasCloud model 문자열
  family: Family
  modality: Modality
  output: 'IMAGE' | 'VIDEO'     // generateImage / generateVideo 결정
  displayName: string
  provider: string
  fields: FieldType[]           // 핵심 입력 (모델 강점 포함)
  advancedFields?: FieldType[]  // "고급 설정" 접힘 (seed, thinking_level, negative_prompt 등)
  customForm?: string           // 이스케이프 해치: 전용 폼 컴포넌트 키
  durationParam?: string        // 과금 계산용 길이 파라미터 이름
}
```

config는 `lib/models/catalog/registry.ts`의 `MODEL_CONFIGS: ModelConfig[]`에 모음. `getModelConfig(id)`로 조회. 폼·어댑터·카탈로그·검증이 모두 이걸 읽음.

**불변식:** DB `Model.id` ↔ config.id 1:1. config 없는 활성 모델 없음(빌드/테스트에서 검증).

---

## 2. DB 스키마 변경 (Prisma)

`Model`에 3개 컬럼 추가:
```prisma
model Model {
  id            String    @id
  kind          ModelKind              // IMAGE | VIDEO (출력)
  family        String                 // 'veo3.1' (그룹핑) — 신규
  modality      String                 // 'text-to-video' — 신규
  atlas_model   String                 // 'google/veo3.1/text-to-video' — 신규
  display_name  String
  provider      String
  is_active     Boolean  @default(true)
  margin_pct    Decimal  @default(10)
  pricing_json  Json
}
```
- 마이그레이션: `ALTER TABLE models ADD COLUMN family/modality/atlas_model`. 기존 행 백필(seed 재실행 + 신규 컬럼 채움). create-only + deploy(다른 마이그레이션이 auth 참조하므로 shadow DB 실패).
- `Generation`: 변경 없음. 모델별 입력은 기존 `params_json`(Json)에 저장:
  ```
  params_json = { prompt, negative_prompt?, duration?, aspect_ratio?, ratio?, generate_audio?,
                  image_urls?: string[], video_clip?: {url,start,ends,fps}, ...어댑터가 매핑 }
  ```
  기존 `input_image_url`은 "대표 입력 이미지"(썸네일·라이브러리 표시용)로 선택 사용.

---

## 3. AtlasCloud 클라이언트 + 어댑터 (config 기반)

### 3.1 공유 클라이언트 `lib/models/atlas/client.ts`
```typescript
const ATLAS_BASE = 'https://api.atlascloud.ai/api/v1/model'

// config + 검증된 inputs → 요청 본문. 값 없으면 생략(모델 기본값).
export function buildRequestBody(config: ModelConfig, inputs: Record<string, unknown>): Record<string, unknown>

// 제출 → predictionId. output으로 endpoint 결정. 키 없으면 AdapterError('ATLASCLOUD_NO_KEY').
export async function atlasSubmit(config: ModelConfig, inputs): Promise<string>

// 폴링 → running | { url } | failed(reason)
export async function atlasPoll(predictionId: string): Promise<AtlasPollResult>

// 응답 파싱: json.data.id / json.data.status / json.data.outputs[0] / json.data.error
```
- 이미지 모델은 outputs URL을 받아 다운로드→base64 변환(또는 enable_base64_output=true 사용)해 우리 Storage 업로드 경로로 넘김.
- 모든 호출 `fetchWithTimeout`, 재시도 0(제출), 폴링만 반복.

### 3.2 어댑터 자동 생성 (기존 인터페이스 재사용)
```typescript
// 이미지: 동기. generate()=submit + inline poll(최대 ~50초, maxDuration 60) → base64
export function makeAtlasImageAdapter(config: ModelConfig): ImageAdapter
// 영상: 비동기. start()=submit→externalJobId, poll()=atlasPoll
export function makeAtlasVideoAdapter(config: ModelConfig): VideoAdapter
```
레지스트리(`lib/models/registry.ts`)가 `MODEL_CONFIGS`를 순회해 output별로 `getImageAdapter`/`getVideoAdapter`에 자동 등록. mock-image/mock-video는 non-production 유지. **기존 GPT-Image(OpenAI) 어댑터는 별도 유지**(AtlasCloud 아님).

### 3.3 생성 흐름 (기존 P2/P3 액션 확장)
- `lib/actions/generation.ts`: `createImageGeneration`/`createVideoGeneration`을 **임의 입력**(prompt 외 image/images/video_clip/옵션)을 받도록 일반화. 입력은 config.fields로 **동적 zod 스키마** 생성해 검증.
- 이미지 입력(image/images)은 업로드/라이브러리에서 받은 URL을 inputs에 포함.
- 차감(hold)·정산·환불·영상 poll-generations cron·Realtime: **전부 기존 것 재사용**. cron은 `getVideoAdapter(model_id)`로 조회 → config 기반 등록이라 그대로 동작.

---

## 4. 폼 빌더 + 이스케이프 해치

`components/generate/DynamicGenerator.tsx` (client):
- 입력: 모델 config + fxRate. config.fields(핵심) + advancedFields("고급 설정" 접힘)를 렌더.
- 필드 렌더러: `PromptField`, `NegativePromptField`, `SelectField`(버튼/드롭다운), `IntField`(옵션 버튼 또는 숫자/슬라이더), `ToggleField`(스위치), `ImageInputField`(단일), `ImagesInputField`(다중 N), `VideoClipField`(url+start/ends/fps).
- inputs 상태 관리 → 변경 시 실시간 견적(estimateGeneration, duration 등 반영) → [생성하기] → createImage/VideoGeneration(inputs).
- **이스케이프 해치**: `config.customForm`이 있으면 `customForms[config.customForm]` 컴포넌트로 제너릭 대신 렌더(예: Seedance 첫→끝 프레임 듀얼 업로더).

`/generate/[modelId]` 페이지: config 조회 → output=IMAGE/VIDEO 무관하게 `DynamicGenerator`에 위임(기존 ImageStudio/VideoStudio는 DynamicGenerator로 통합/대체).

### 4.1 이미지 입력 UX (`ImageInputField`/`ImagesInputField`)
두 경로:
1. **드래그/파일 업로드** → `POST /api/upload`(requireUser, 서버) → 서버가 AtlasCloud `uploadMedia`로 프록시(ATLASCLOUD_API_KEY 서버 전용) → AtlasCloud URL/asset 반환 → inputs에 저장. (키 클라 노출 없음)
2. **내 라이브러리에서 선택** → 모달이 사용자의 SUCCEEDED 생성물 그리드 표시 → 선택 → 해당 결과의 서명 URL을 입력으로 사용(AtlasCloud는 공개 URL 허용, 서명 URL TTL이 제출 시점 커버).

---

## 5. 패밀리 그룹 카탈로그

- `/models` (공개): **패밀리 카드** 5개(nanobanana/seedream/veo3.1/seedance/kling) — 각 카드에 모델 수·대표 모달리티·최저가. 클릭 → `/models/[family]`.
- `/models/[family]`: 그 패밀리의 활성 모델들을 **모달리티별 섹션**으로(text-to-image / image-to-video 등) 나열, 각 모델 카드에 가격 + [생성하기]→`/generate/[modelId]`. 비활성(미확정) 모델은 "준비 중" 배지.
- 기존 `/models/[id]` 상세는 유지(직접 링크). GPT-Image는 'openai' 패밀리 카드로 함께 노출.

---

## 6. 17모델 레지스트리 (+ GPT-Image)

내부 id / atlasModel / family / modality / output / 활성여부. **문서 확보분 = 활성**, 미확보분 = best-guess + **비활성**(owner가 콘솔 문서로 atlasModel·파라미터 확정 후 활성화).

| 내부 id | atlasModel | family | modality | out | 활성 |
|---|---|---|---|---|---|
| nanobanana-2-t2i | google/nano-banana-2/text-to-image | nanobanana | text-to-image | IMG | ✅(문서) |
| nanobanana-2-ref2i | google/nano-banana-2/reference-to-image | nanobanana | reference-to-image | IMG | ✅(문서) |
| nanobanana-pro-t2i | google/nano-banana-pro/text-to-image(추정) | nanobanana | text-to-image | IMG | ⛔ best-guess |
| seedream-v4-t2i | bytedance/seedream-v4/text-to-image(추정) | seedream | text-to-image | IMG | ⛔ |
| seedream-v4.5-t2i | bytedance/seedream-v4.5/text-to-image(추정) | seedream | text-to-image | IMG | ⛔ |
| veo3.1-t2v | google/veo3.1/text-to-video | veo3.1 | text-to-video | VID | ✅(문서) |
| veo3.1-fast-t2v | google/veo3.1-fast/text-to-video(추정) | veo3.1 | text-to-video | VID | ⛔ |
| veo3.1-i2v | google/veo3.1/image-to-video(추정) | veo3.1 | image-to-video | VID | ⛔ |
| veo3.1-fast-i2v | google/veo3.1-fast/image-to-video(추정) | veo3.1 | image-to-video | VID | ⛔ |
| veo3.1-ref2v | google/veo3.1/reference-to-video(추정) | veo3.1 | reference-to-video | VID | ⛔ |
| seedance-2-t2v | bytedance/seedance-2.0/text-to-video(추정) | seedance | text-to-video | VID | ⛔ |
| seedance-2-i2v | bytedance/seedance-2.0/image-to-video | seedance | image-to-video | VID | ✅(문서) |
| seedance-2-ref2v | bytedance/seedance-2.0/reference-to-video(추정) | seedance | reference-to-video | VID | ⛔ |
| kling-v3-std-t2v | kuaishou/kling-v3.0-std/text-to-video(추정) | kling | text-to-video | VID | ⛔ |
| kling-v3-pro-t2v | kuaishou/kling-v3.0-pro/text-to-video(추정) | kling | text-to-video | VID | ⛔ |
| kling-v3-std-i2v | kuaishou/kling-v3.0-std/image-to-video(추정) | kling | image-to-video | VID | ⛔ |
| kling-v3-pro-i2v | kuaishou/kling-v3.0-pro/image-to-video(추정) | kling | image-to-video | VID | ⛔ |
| gpt-image-2.0 | (OpenAI, AtlasCloud 아님) | openai | text-to-image | IMG | ✅(기존) |

활성 4종(nano t2i/ref2i, veo3.1 t2v, seedance i2v)의 fields는 문서대로 정확히 선언. 비활성분은 동일 모달리티 활성 모델의 fields를 템플릿으로 best-guess(atlasModel·옵션은 owner 확정 TODO).

---

## 7. 가격/과금

- 사용자 과금은 기존 가격 엔진(pricing_json: per_image / per_second / per_video_fixed) + 마진, owner가 `/admin/models`에서 조정. 영상은 모델별 duration 옵션 기반.
- AtlasCloud 응답의 `total_tokens`/`completion_tokens`는 `cost_usd_raw`(참고용·감사)로 기록. 실제 청구는 우리 가격 엔진이 권위.
- 모든 차감·환불은 `wallet_apply_tx`. 정산 로직 기존 재사용.

---

## 8. 테스트

- **buildRequestBody 단위 테스트**: config별(veo3.1·seedance·nano ref2i) inputs→올바른 param 매핑(aspect_ratio vs ratio, images[], video_clip) 검증.
- **클라이언트 파싱 단위 테스트**: `{data:{...}}` / `{code,message,data:{...}}` 양쪽 + status/outputs/error.
- **동적 zod 검증 테스트**: config.fields → 스키마 생성 → 필수 누락 거부.
- **통합(mock)**: mock-image/mock-video로 생성→차감→저장 흐름(기존 재사용).
- **E2E**: 패밀리 카탈로그 → 모델 선택 → 폼 → mock 생성 → 결과(기존 mock 경로).
- 실제 AtlasCloud 호출은 fixture mock(비용 0). owner가 키로 실모델 수동 검증.

---

## 9. 구현 순서 (Plan 요약)

1. config 스키마/타입 + 레지스트리(활성 4 + 비활성 best-guess) + DB 컬럼 마이그레이션 + seed 재구성
2. AtlasCloud 클라이언트(buildRequestBody/submit/poll) + 단위 테스트
3. config 기반 어댑터 자동 생성 + 레지스트리 통합 (기존 nanobanana 어댑터를 config 기반으로 흡수)
4. 생성 액션 일반화(임의 입력 + 동적 zod) — 기존 createImage/VideoGeneration 확장
5. 업로드 라우트(`/api/upload` → AtlasCloud uploadMedia 프록시) + 라이브러리 선택
6. 폼 빌더(DynamicGenerator + 필드 렌더러 + 이스케이프 해치) — 기존 ImageStudio/VideoStudio 대체
7. 패밀리 그룹 카탈로그(`/models`, `/models/[family]`)
8. E2E(카탈로그→폼→mock 생성) + 정리

---

## 10. 소유주 액션
- 비활성 13개 모델의 **정확한 atlasModel 문자열 + 파라미터/옵션**을 콘솔 문서로 확정 → config 수정 후 `is_active=true`.
- 모델별 가격은 `/admin/models`에서 조정.
- `ATLASCLOUD_API_KEY`는 이미 설정됨(이미지 업로드 프록시·생성 모두 사용).

---

**문서 끝.** 다음: writing-plans로 구현 계획 작성 → subagent 실행.
