# NS Field — AtlasCloud 멀티모델 통합 구현 계획

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** AtlasCloud 17모델(+기존 GPT-Image)을 config 기반으로 통합 — 패밀리 그룹 카탈로그 + 모달리티별 적응 생성 폼, 각 모델 강점 보존.
**Spec:** `docs/superpowers/specs/2026-06-03-atlascloud-models-design.md`.
**Stack:** Next.js 16 + TS strict + Prisma 6.19.3 + Vitest/Playwright. 기존 학습 전부 준수(TEXT id, dotenv-cli, create-only+deploy, `@/lib/db/prisma`, wallet_apply_tx, mock non-prod, pg 통합테스트).

---

## Task 1: config 스키마 + 레지스트리 + DB 마이그레이션 + seed
- `lib/models/catalog/types.ts`: `Family`/`Modality`/`FieldType`/`ModelConfig` (spec §1).
- `lib/models/catalog/registry.ts`: `MODEL_CONFIGS: ModelConfig[]` — 활성 4(nano t2i/ref2i 문서대로 fields 정확히, veo3.1 t2v, seedance i2v) + 비활성 13 best-guess + gpt-image(openai). `getModelConfig(id)`, `listConfigs()`.
- 활성 모델 fields(문서 기준):
  - nano t2i: prompt, select aspect_ratio(1:1·16:9·9:16·…), select resolution(1k·2k·4k); advanced: select thinking_level, toggle enable_web_search.
  - nano ref2i: prompt, video_clip(required), images(max10); advanced: aspect_ratio, resolution, thinking_level.
  - veo3.1 t2v: prompt, select aspect_ratio(16:9·9:16), int duration(4·6·8), select resolution(720p·1080p·4k), toggle generate_audio; advanced: negative_prompt, int seed. durationParam:'duration'.
  - seedance i2v: prompt, image(required), select ratio(adaptive·16:9·9:16·…), int duration(opts 4..15), select resolution(480p·720p·1080p·…), toggle generate_audio; advanced: image last_image, toggle return_last_frame. durationParam:'duration'.
- DB: `prisma/schema.prisma` Model에 `family String`, `modality String`, `atlas_model String` 추가. 마이그레이션 create-only(빈 폴더면 hand-author `ALTER TABLE models ADD COLUMN ... DEFAULT '' NOT NULL` 후 백필) + deploy.
- `prisma/seed.ts`: MODEL_CONFIGS에서 seed 생성(id/kind/family/modality/atlas_model/display_name/provider/is_active/margin_pct/pricing_json). 기존 7개 행은 upsert로 신규 id 체계에 맞게 재구성(구 id 'nanobanana-2.0' 등은 비활성 처리 또는 삭제 — 신규 'nanobanana-2-t2i'로 대체).
- 단위 테스트: 모든 활성 config는 DB seed에 대응(불변식), FieldType 판별 유효.
- Commit: `feat: AtlasCloud 모델 config 레지스트리 + DB family/modality/atlas_model + seed 재구성`.

## Task 2: AtlasCloud 클라이언트 (buildRequestBody/submit/poll)
- `lib/models/atlas/client.ts`: `buildRequestBody(config, inputs)`(필드별 param 매핑, 값 없으면 생략), `atlasSubmit(config, inputs)→predictionId`(output→generateImage/generateVideo, `{data:{id}}`/`{code,message,data:{id}}` 양쪽 파싱, 키 없으면 AdapterError('ATLASCLOUD_NO_KEY')), `atlasPoll(id)→ running|{url,raw}|failed`(data.status/outputs/error). `fetchWithTimeout`, 제출 재시도 0.
- `lib/models/atlas/uploadMedia.ts`: `atlasUploadMedia(file/buffer)→ url`(multipart, 서버 전용).
- 단위 테스트(TDD): buildRequestBody가 veo3.1(aspect_ratio,duration,generate_audio)·seedance(ratio,image,last_image)·nano ref2i(images[],video_clip) inputs를 올바른 키로 매핑; atlasPoll 응답 파싱(완료/실패/진행, 양쪽 응답 형태). fetch 전역 stub.
- Commit: `feat: AtlasCloud 클라이언트(요청 조립/제출/폴링) + uploadMedia`.

## Task 3: config 기반 어댑터 자동 생성 + 레지스트리 통합
- `lib/models/atlas/adapters.ts`: `makeAtlasImageAdapter(config)`(동기: atlasSubmit→inline atlasPoll≤50s→이미지 URL 다운로드→base64, 또는 enable_base64_output), `makeAtlasVideoAdapter(config)`(비동기: start=atlasSubmit→externalJobId, poll=atlasPoll).
- `lib/models/registry.ts`: MODEL_CONFIGS 순회 자동 등록(output별), gpt-image는 기존 어댑터, mock non-prod. 기존 `lib/models/image/nanobanana.ts`·video skeleton들은 config 기반으로 대체(파일 정리). `getImageAdapter`/`getVideoAdapter` 시그니처 유지.
- 단위/통합: 레지스트리가 활성 모델 어댑터 반환, mock-video succeeded 흐름 유지.
- Commit: `feat: config 기반 AtlasCloud 어댑터 자동 생성 + 레지스트리 통합`.

## Task 4: 생성 액션 일반화 (임의 입력 + 동적 zod)
- `lib/validation/dynamic.ts`: `buildInputSchema(config)→zod` (fields→스키마: prompt min1, image required면 url 필수, select는 옵션 enum, int는 옵션/범위, images max, video_clip 형태).
- `lib/actions/generation.ts`: `estimateGeneration`/`createImageGeneration`/`createVideoGeneration`을 `inputs: Record<string,unknown>` 받도록 일반화(config 조회→buildInputSchema 검증→어댑터 inputs 전달). 차감/정산/환불/RUNNING/cron 기존 재사용. params_json에 inputs 저장.
- 통합 테스트(mock 모델): 이미지·영상 각각 inputs(옵션 포함)로 생성→차감 정확.
- Commit: `feat: 생성 액션 일반화(모델별 임의 입력 + 동적 검증)`.

## Task 5: 업로드 라우트 + 라이브러리 선택
- `app/api/upload/route.ts`: POST(requireUser, multipart) → `atlasUploadMedia` 프록시 → `{url}`. rate-limit(이미지생성과 별도 가벼운 한도) 선택.
- `lib/actions/library.ts`: `listMyImageResults()`(SUCCEEDED IMAGE 생성물 + 서명URL) — 라이브러리 선택 모달용.
- 단위/통합: 업로드 라우트 인증 가드, 라이브러리 목록.
- Commit: `feat: 입력 이미지 업로드(AtlasCloud uploadMedia 프록시) + 라이브러리 선택`.

## Task 6: 폼 빌더 (DynamicGenerator) + 필드 렌더러 + 이스케이프 해치
- `components/generate/fields/*`: PromptField, NegativePromptField, SelectField, IntField, ToggleField, ImageInputField(업로드+라이브러리), ImagesInputField, VideoClipField.
- `components/generate/DynamicGenerator.tsx`(client): config→core/advanced 필드 렌더, inputs 상태, 실시간 견적, 생성→/library/[id]. customForm 있으면 `customForms[key]` 대체.
- `components/generate/customForms.ts`: 빈 레지스트리(추후 모델별 전용 폼 등록 지점).
- `app/(app)/generate/[modelId]/page.tsx`: config 조회→DynamicGenerator 위임. 기존 ImageStudio/VideoStudio 제거/흡수.
- Commit: `feat: 동적 생성 폼 빌더 + 필드 렌더러 + 이스케이프 해치`.

## Task 7: 패밀리 그룹 카탈로그
- `app/(public)/models/page.tsx`: 패밀리 카드(활성 모델 있는 family) + 최저가 + 모델 수 → `/models/[family]`.
- `app/(public)/models/[family]/page.tsx`: 해당 family 모델을 modality 섹션으로, 카드+가격+[생성하기]. 비활성=준비중 배지.
- `lib/actions/models.ts`: `listFamilies()`, `listModelsByFamily(family)`.
- Commit: `feat: 패밀리 그룹 모델 카탈로그(/models, /models/[family])`.

## Task 8: E2E + 정리
- `tests/e2e/atlas-catalog-flow.spec.ts`: 로그인→/models→패밀리 클릭→모델 선택→DynamicGenerator 폼→mock 모델 생성→결과. self-contained(mock-image 또는 mock config 활성).
- 전 게이트(unit/integration/e2e/build/typecheck/lint) green.
- Commit: `test: AtlasCloud 카탈로그→폼→생성 E2E`.

---

## DoD
- 활성 4모델 + GPT-Image가 패밀리 카탈로그에 보이고, 폼이 각 모델 fields대로 적응, mock으로 생성→차감→결과 종단 통과.
- 비활성 13모델은 카탈로그에 "준비 중"으로 구조만 노출(owner가 atlasModel 확정 후 활성화).
- 모델 강점 파라미터(audio·last_image·video_clip 트림·다중참조·thinking_level)가 폼에 노출.
- 차감/환불 전부 wallet_apply_tx, 외부 유료 호출 0(테스트).

## 소유주 액션
- 비활성 13모델 atlasModel 문자열·파라미터 확정 → config 수정 + is_active=true.
- ATLASCLOUD_API_KEY 설정됨(업로드·생성 사용).
