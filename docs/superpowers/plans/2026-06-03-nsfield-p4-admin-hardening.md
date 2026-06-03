# NS Field — Plan 4: P4 관리자 + 보안 하드닝 + 배포 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 관리자 운영 콘솔(대시보드/사용자/모델편집/생성모니터/환율/감사)을 완성하고, rate limiting·보안 헤더/CSP·백업으로 운영 안전성을 갖추고, 배포 구성을 정리한다.

**Architecture:** Plan 1~3 레이어·불변식 유지. 모든 관리자 변경 액션은 `requireAdmin` 가드 + `recordAdminAction` 감사 로그. 잔액 조정은 `wallet_apply_tx(ADJUSTMENT)`. 강제 환불은 `wallet_apply_tx(REFUND)`.

**Tech Stack:** Plan 1~3 동일 + recharts(대시보드 차트) + Vercel(배포).

**관련 설계:** `docs/superpowers/specs/2026-05-30-nsfield-pages.md`(§2 관리자 화면), `docs/superpowers/specs/2026-05-27-nsfield-design.md`(§9 관리자, §10 보안, §11 테스트).

**범위(P4):** 관리자 6개 화면(대시보드/사용자/모델/생성모니터/환율/감사), rate-limit(토큰버킷 SQL+적용), 보안 헤더+CSP, 주간 백업 cron, 배포 구성(vercel.json 정리 + setup-deploy 문서). **실제 `vercel deploy`는 소유주 액션.**
**범위 밖:** 신규 비즈니스 기능(전부 Phase 2+).

**Plan 1~3 학습 준수:** TEXT id, `@/lib/db/prisma`, dotenv-cli, 마이그레이션 create-only+deploy, pg 통합테스트, `wallet_apply_tx`만 잔액 변동, `requireAdmin` + `recordAdminAction` 모든 admin 액션.

---

## Task 0: 브랜치
- [ ] `git checkout main && git pull && git checkout -b feature/p4-admin-hardening`

---

## Task 1: 관리자 대시보드 `/admin/dashboard`

**Files:** `lib/actions/admin-dashboard.ts`, `app/admin/dashboard/page.tsx`, `components/admin/KpiCard.tsx`, (선택)`components/admin/RevenueChart.tsx`
**Test:** `tests/unit/actions/admin-dashboard.test.ts`

- [ ] **Step 1: 집계 액션** `getDashboardStats()` (requireAdmin):
  - 오늘 매출 = SUM(-amount_krw) FROM wallet_transactions WHERE type='CHARGE' AND created_at>=오늘0시 (차감은 음수이므로 절대값)
  - 이번달 매출 동일(월초부터)
  - 대기 충전 = count(topup_requests PENDING)
  - 진행 영상 = count(generations status='RUNNING' AND kind='VIDEO')
  - 주의: 30분 초과 RUNNING 영상 수, 식별코드 누락 PENDING 충전 수
  - 최근 7일 일별 매출(차트용)
- [ ] **Step 2: KpiCard + 페이지** — KPI 4개 카드(MoneyText), 주의 필요 박스, (recharts 설치 시) 7일 막대 차트. recharts 설치: `npm i recharts`. 차트는 client 컴포넌트.
- [ ] **Step 3: 단위 테스트** — 집계 쿼리 로직(프리즈마 mock 또는 순수 집계 함수 분리)로 매출 계산 검증. Commit `feat: 관리자 대시보드(매출/대기/진행 KPI)`.

---

## Task 2: 관리자 사용자 `/admin/users` + 상세 `/admin/users/[id]` + 잔액 조정

**Files:** `lib/actions/admin-users.ts`, `app/admin/users/page.tsx`, `app/admin/users/[id]/page.tsx`, `components/admin/UserTable.tsx`, `components/admin/BalanceAdjustDialog.tsx`
**Test:** `tests/unit/actions/admin-users.test.ts`, `tests/integration/admin-adjust.test.ts`

- [ ] **Step 1: 액션** `listUsers(query?)`(검색: 이메일/이름/코드), `getUserDetail(id)`(잔액+거래+생성+충전), `adjustBalance(userId, amountKrw, reason)`:
```
requireAdmin → wallet 조회 → wallet_apply_tx(walletId,'ADJUSTMENT',amountKrw(+/-),'admin_adjust',null,reason)
  → recordAdminAction(adjust_balance, before:{balance}, after:{delta:amountKrw}, reason) → revalidate
```
ADJUSTMENT은 음수 잔액 허용(설계). amount 0 금지, reason 필수(trim>0).
- [ ] **Step 2: UI** — 목록(검색), 상세(탭: 거래/생성/충전), 잔액 조정 다이얼로그(추가/차감 + 금액 + 사유 → confirm).
- [ ] **Step 3: 통합 테스트** — adjustBalance(+5000) → 잔액 +5000 + ADJUSTMENT ledger + AdminAction 기록 검증(실 DB, rollback/cleanup). Commit `feat: 관리자 사용자 목록·상세 + 잔액 조정(ADJUSTMENT)`.

---

## Task 3: 관리자 모델 관리 `/admin/models` + 편집 `/admin/models/[id]`

**Files:** `lib/actions/admin-models.ts`, `lib/validation/model.ts`, `app/admin/models/page.tsx`, `app/admin/models/[id]/page.tsx`, `components/admin/ModelEditor.tsx`
**Test:** `tests/unit/validation/model.test.ts`, `tests/unit/actions/admin-models.test.ts`

- [ ] **Step 1: 액션** `listAllModels()`, `updateModel(id, {display_name, is_active, margin_pct, pricing_json})`:
```
requireAdmin → 이전값 조회(before) → validate(pricing_json 구조 zod) → prisma.model.update
  → recordAdminAction(update_model, before, after) → revalidate
```
`toggleModel(id, active)`도. pricing_json 검증: kind∈{per_image,per_token,per_second,per_video_fixed}, 영상은 allowed_durations_sec/polling_interval_sec, tiers 형식.
- [ ] **Step 2: ModelEditor UI** — 표시명/활성/마진율 입력 + 가격패턴별 폼 + **가격 시뮬레이터**(입력 즉시 `estimateBilledUsd`×환율 미리보기, lib/models/pricing 재사용). 원시 JSON 편집 토글(고급).
- [ ] **Step 3: 테스트** — pricing_json 검증 + updateModel이 before/after 기록 검증. Commit `feat: 관리자 모델 편집 + 가격 시뮬레이터`.

---

## Task 4: 관리자 생성 모니터 `/admin/generations` + 강제 환불

**Files:** `lib/actions/admin-generations.ts`, `app/admin/generations/page.tsx`, `app/admin/generations/[id]/page.tsx`, `components/admin/GenerationMonitor.tsx`
**Test:** `tests/integration/admin-force-refund.test.ts`

- [ ] **Step 1: 액션** `listAllGenerations(filters)`(status/kind/model/user/기간 + 페이지네이션), `getGenerationAdmin(id)`(외부 응답 로그 포함), `forceRefund(genId, reason)`:
```
requireAdmin → gen 조회 → 이미 REFUND됐는지 확인(중복 방지: wallet_transactions ref_id=genId & type='REFUND' 존재?)
  → wallet_apply_tx(walletId,'REFUND',+charged_krw,'generation',genId,reason)
  → recordAdminAction(force_refund, before:{charged_krw}, reason) → revalidate
```
- [ ] **Step 2: UI** — 필터 테이블 + 상세(비용/타임라인/결과 미리보기/강제환불 버튼, 이미 환불됐으면 비활성).
- [ ] **Step 3: 통합 테스트** — SUCCEEDED generation에 forceRefund → 잔액 복구 + REFUND ledger + AdminAction + 재호출 시 중복 차단 검증. Commit `feat: 관리자 생성 모니터 + 강제 환불`.

---

## Task 5: 관리자 환율 `/admin/fx-rates` + 수동 갱신

**Files:** `lib/actions/admin-fx.ts`, `app/admin/fx-rates/page.tsx`
**Test:** `tests/unit/actions/admin-fx.test.ts`

- [ ] **Step 1: 액션** `listFxRates(limit)`(이력), `triggerFxRefresh()`(requireAdmin → refreshFxRate() → recordAdminAction(fx_refresh)). 현재 적용 환율(최신) 표시.
- [ ] **Step 2: UI** — 현재 환율 + [지금 갱신] 버튼 + 이력 테이블 (+선택 추이).
- [ ] **Step 3: 테스트** + Commit `feat: 관리자 환율 이력 + 수동 갱신`.

---

## Task 6: 관리자 감사 로그 `/admin/audit`

**Files:** `lib/actions/admin-audit.ts`, `app/admin/audit/page.tsx`, `components/admin/AuditTable.tsx`

- [ ] **Step 1: 액션** `listAdminActions(filters)`(action/admin/기간 + 페이지네이션, requireAdmin).
- [ ] **Step 2: UI** — 테이블(시각/관리자/액션/대상/사유) + 행 클릭 시 before/after JSON diff 펼침.
- [ ] **Step 3:** 빌드/테스트 + Commit `feat: 관리자 감사 로그 뷰어`.

---

## Task 7: Rate limiting (Postgres 토큰 버킷)

**Files:** `db/sql/functions/rate_limit_consume.sql`(마이그레이션), `lib/rate-limit/token-bucket.ts`, 생성/충전 액션에 적용
**Test:** `tests/integration/rate-limit.test.ts`

- [ ] **Step 1: rate_limit 테이블 + 함수** — `rate_limits(user_id text, action text, window_start timestamptz, count int, primary key(user_id,action))`. `rate_limit_consume(p_user text, p_action text, p_limit int, p_window_sec int) returns boolean`(true=허용): 윈도우 만료면 리셋, count<limit이면 +1 true, 아니면 false. (마이그레이션 create-only+deploy)
- [ ] **Step 2: 래퍼** `consumeRateLimit(userId, action, limit, windowSec): Promise<boolean>` (prisma.$queryRaw). 한도(설계 §10.2): 이미지 생성 10/분·100/시간, 영상 3/분·20/시간, 충전요청 5/시간. ADMIN 면제.
- [ ] **Step 3: 적용** — createImageGeneration/createVideoGeneration/createTopupRequest 진입부에 체크, 초과 시 `{ok:false,code:'RATE_LIMIT',message:'잠시 후 다시 시도해주세요.'}`.
- [ ] **Step 4: 통합 테스트** — 분당 한도 초과 시 false 반환 검증. Commit `feat: 사용자별 rate limiting(토큰 버킷)`.

---

## Task 8: 보안 헤더 + CSP

**Files:** `next.config.ts`(headers)
- [ ] **Step 1: headers()** — HSTS, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, X-Frame-Options: DENY, CSP(self + Supabase URL + Vercel + 결과 이미지/서명URL 도메인; inline script 금지하되 Next 요구 nonce/style 허용). Supabase Realtime용 `connect-src wss://*.supabase.co` 포함.
- [ ] **Step 2:** `npm run build` 후 응답 헤더 확인(또는 통합/수동). CSP가 앱을 깨지 않는지 dev에서 확인. Commit `feat: 보안 응답 헤더 + CSP 적용`.

---

## Task 9: 주간 백업 cron

**Files:** `lib/jobs/backup.ts`, `app/api/cron/backup/route.ts`, `vercel.json`(확장)
**Test:** `tests/integration/backup.test.ts`(소규모)
- [ ] **Step 1: 백업 로직** — `Wallet`/`WalletTransaction`/`TopupRequest`/`Generation`(메타만, result 제외 가능)/`AdminAction`을 JSON으로 직렬화 → Storage `backups/{yyyy-mm-dd}.json` 업로드(service_role). 90일 이전 백업 삭제(선택).
- [ ] **Step 2: cron 라우트** + CRON_SECRET + `vercel.json` `{ "path":"/api/cron/backup","schedule":"0 18 * * 0" }`(일요일 KST 03:00).
- [ ] **Step 3: 통합 테스트** — backup 실행 → Storage에 backups/ 객체 생성 검증 → 정리. Commit `feat: 주간 DB 백업 cron`.

---

## Task 10: 배포 구성 정리 (소유주가 실제 배포)

**Files:** `vercel.json`(전체 cron 확인), `docs/DEPLOY.md`, `.env.example`(전체 동기화)
- [ ] **Step 1: vercel.json** — 4개 cron 확정: fx-update(0 * * * *), poll-generations(* * * * *), cleanup-expired(0 19 * * *), backup(0 18 * * 0). `functions` maxDuration 필요한 라우트 설정.
- [ ] **Step 2: .env.example 전체 동기화** — Plan 1~4에서 추가된 모든 키(SUPABASE_*, DATABASE_URL/DIRECT_URL, OPENAI_API_KEY, GOOGLE/KLING/BYTEDANCE/NANOBANANA_API_KEY, EXCHANGE_RATE_API_URL, CRON_SECRET, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_BANK_*, ADMIN_EMAIL/RESEND 선택) 정리 + 주석.
- [ ] **Step 3: docs/DEPLOY.md** — Vercel 프로젝트 생성 → 환경변수 등록(특히 DATABASE_URL은 pooler, DIRECT_URL은 5432) → Supabase Realtime publication 확인 → 첫 배포 → cron 활성 확인 → 본인 ADMIN 승격 SQL → 스모크 체크리스트. **실제 `vercel` 배포 명령은 소유주가 실행**(자동 실행 금지).
- [ ] **Step 4:** 빌드 최종 확인 + Commit `docs: 배포 구성(vercel.json cron) + DEPLOY 가이드 + env 동기화`.

---

## 완료 기준 (Plan 4 DoD)
- [ ] typecheck/lint/unit/integration/(가능한)e2e green
- [ ] 관리자 6개 화면 동작 + 모든 변경 액션 감사 로그 기록
- [ ] 잔액 조정(ADJUSTMENT)/강제환불(REFUND) `wallet_apply_tx` 경유 + 중복 차단
- [ ] rate limit 한도 초과 차단 검증
- [ ] 보안 헤더/CSP 적용(앱 정상 동작)
- [ ] 백업 cron이 Storage에 덤프 생성
- [ ] DEPLOY.md로 소유주가 배포 가능한 상태

## 소유주 액션
- Vercel 프로젝트 생성 + 환경변수 등록 + 배포(DEPLOY.md)
- Supabase Realtime publication 확인(Plan 3 마이그레이션으로 추가됨)
- 외부 모델 API 키 입력 후 실제 생성 검증

---
**Self-Review:** 관리자 화면(§9)·보안(§10: 키 서버전용·rate limit·헤더/CSP·백업)·테스트(§11) 매핑. 모든 admin 변경은 requireAdmin+감사. 잔액 변동은 wallet_apply_tx. 배포는 문서화하되 자동 실행 안 함.
