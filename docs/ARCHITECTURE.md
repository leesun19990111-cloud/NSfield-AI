# NS Field — 아키텍처 문서

- **최종 갱신**: 2026-05-30
- **관련 문서**: `docs/superpowers/specs/2026-05-27-nsfield-design.md` (시스템 설계), `docs/superpowers/specs/2026-05-30-nsfield-pages.md` (화면 명세)
- **목적**: 코드 작성 전 레이어 경계·데이터 흐름·디렉터리·상태 관리·컴포넌트 계층을 확정한다.

---

## 1. 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 15 (App Router) | Server Components 기본, Server Actions로 변경 작업 |
| 언어 | TypeScript (strict) | `tsc --noEmit` CI 게이트 |
| 스타일 | Tailwind CSS v4 | 다크 모드 토큰은 CSS 변수 |
| UI 컴포넌트 | shadcn/ui (Radix) | 다크 테마 커스터마이즈, 소스 직접 보유 |
| 아이콘 | lucide-react | |
| 폼/검증 | react-hook-form + zod | zod 스키마는 서버/클라 공유 |
| 클라이언트 데이터 | TanStack Query | 실시간·낙관적 업데이트 보조 (대부분은 RSC) |
| 차트 | recharts | 관리자 대시보드 |
| 토스트 | sonner | |
| DB | Supabase Postgres | |
| ORM | Prisma 6.x | 스키마·마이그레이션. RLS/함수는 raw SQL 마이그레이션 |
| 인증 | Supabase Auth (`@supabase/ssr`) | Google OAuth + 이메일/PW |
| 스토리지 | Supabase Storage | private 버킷 + Signed URL |
| 실시간 | Supabase Realtime | Generation row 상태 구독 |
| 스케줄러 | Vercel Cron | 폴링·환율·정리 |
| 메일(옵션) | Resend | 관리자 알림 |
| 호스팅 | Vercel + Supabase | |
| 테스트 | Vitest, Playwright, pgTAP, fast-check | 섹션 11 설계 참조 |

---

## 2. 레이어 아키텍처

요청은 위에서 아래로만 흐른다. 하위 레이어는 상위를 모른다.

```
┌─────────────────────────────────────────────────────────────┐
│  L1  Presentation  (app/**, components/**)                   │
│      Server Components(조회) + Client Components(상호작용)     │
│      - 데이터 표시, 폼, 상태 표현                              │
│      - 비즈니스 규칙 없음. 서비스 레이어 호출만.               │
├─────────────────────────────────────────────────────────────┤
│  L2  Application  (lib/actions/**, app/api/**)               │
│      Server Actions + Route Handlers + Cron Handlers         │
│      - 인증/인가 가드, 입력 검증(zod), 트랜잭션 경계           │
│      - 도메인 서비스 조합(orchestration)                      │
├─────────────────────────────────────────────────────────────┤
│  L3  Domain  (lib/wallet, lib/models, lib/fx, lib/generation)│
│      순수 비즈니스 로직                                       │
│      - 가격 엔진, 어댑터, 지갑 규칙, 상태 전이                 │
│      - 외부 I/O는 인터페이스로 주입(테스트 용이)               │
├─────────────────────────────────────────────────────────────┤
│  L4  Infrastructure  (lib/db, lib/supabase, lib/storage,     │
│                       lib/http, db/sql/**)                   │
│      Prisma, Supabase 클라이언트, Storage, 외부 HTTP,        │
│      Postgres 함수/RLS/트리거                                │
└─────────────────────────────────────────────────────────────┘
```

### 의존성 규칙

- **L1 → L2 → L3 → L4** 단방향. 역방향 import 금지(ESLint `import/no-restricted-paths`로 강제).
- L3(Domain)는 Prisma 타입에 직접 의존하지 않고 자체 도메인 타입 사용. L4가 변환 담당.
- 외부 AI API 호출은 L3 어댑터 인터페이스 뒤에 격리 → 테스트는 mock 주입.

### 책임 경계 요약

| 레이어 | 하는 일 | 하지 않는 일 |
|---|---|---|
| L1 Presentation | 렌더링, 폼, 낙관적 UI, Realtime 구독 | 잔액 계산, 외부 API 호출, 권한 결정 |
| L2 Application | 인증 가드, zod 검증, 트랜잭션 시작, 서비스 조합 | 가격 공식, 외부 API 포맷 |
| L3 Domain | 가격 엔진, 어댑터, 상태 전이, 환불 판단 | HTTP/DB 직접 접근(인터페이스로 주입받음) |
| L4 Infra | Prisma 쿼리, Supabase, Storage, fetch, SQL 함수 | 비즈니스 규칙 |

---

## 3. 핵심 데이터 흐름

### 3.1 이미지 생성 (동기) — 시퀀스

```
Client(/generate)         Server Action            Domain            Infra/외부
  │ estimate 요청          │                         │                  │
  ├──────────────────────► │ requireUser             │                  │
  │                        │ pricing.estimate ──────►│ estimateBilledUsd│
  │                        │ fx.getCurrent ─────────────────────────────► FxRate
  │ ◄── 견적(USD+KRW) ───── │                         │                  │
  │ 생성 확정               │                         │                  │
  ├──────────────────────► │ zod 검증                │                  │
  │                        │ TX 시작 ───────────────────────────────────► DB
  │                        │  Generation(PENDING)    │                  │
  │                        │  wallet_apply_tx(CHARGE)│  (음수→예외)      │
  │                        │  status=RUNNING         │                  │
  │                        │ adapter.start ─────────►│ ─────────────────► OpenAI
  │                        │ ◄── urls + cost_usd_raw │                  │
  │                        │ storage.upload ────────────────────────────► Storage
  │                        │ Generation(SUCCEEDED,expires=+30d)          │
  │                        │ 정산: 실제>견적 → 차액 CHARGE / 흡수         │
  │ ◄── 결과 ───────────── │                         │                  │
```

### 3.2 영상 생성 (비동기) — 시작 + 폴링

```
[시작] Client → Server Action:
   requireUser → zod → TX{ Generation(PENDING) + wallet_apply_tx(CHARGE,견적) }
   → adapter.start() → external_job_id → Generation(RUNNING) → 응답
   → Client는 /library/[id]에서 Realtime 구독

[폴링] Vercel Cron(1분) → /api/cron/poll-generations (CRON_SECRET 검증):
   SELECT status=RUNNING AND kind=VIDEO AND 폴링간격 경과 LIMIT 50
   for each: adapter.poll(job_id)
     running   → last_polled_at 갱신
     succeeded → storage.upload → Generation(SUCCEEDED) → 정산 → Realtime push
     failed    → Generation(FAILED) → wallet_apply_tx(REFUND) → Realtime push
   타임아웃: started_at > 30분 → FAILED + REFUND
```

### 3.3 충전 승인 — 트랜잭션

```
Admin(/admin/topups) → approveTopup(requestId):
   requireAdmin → TX{
     TopupRequest(APPROVED, reviewed_by/at)
     wallet_apply_tx(TOPUP, +amount)
     recordAdminAction(approve_topup, before/after)
   } → 사용자 잔액 즉시 반영
```

### 3.4 불변식 (시스템 전체에서 항상 참)

1. `wallet.balance_krw == Σ(wallet_transaction.amount_krw)` (해당 지갑)
2. `wallet.balance_krw >= 0` (단, `ADJUSTMENT` 거래 제외)
3. Generation.status 전이는 단방향: `PENDING → RUNNING → (SUCCEEDED | FAILED | CANCELED)`
4. 모든 잔액 변동은 `wallet_apply_tx()` SQL 함수를 통해서만 발생
5. 모든 관리자 변경 액션은 `AdminAction` 1행을 남긴다

---

## 4. 디렉터리 구조 (확정)

```
NSfield/
├─ app/
│  ├─ (public)/
│  │  ├─ page.tsx                      # 랜딩
│  │  ├─ models/page.tsx
│  │  └─ models/[id]/page.tsx
│  ├─ (auth)/
│  │  ├─ login/page.tsx
│  │  ├─ signup/page.tsx
│  │  └─ layout.tsx
│  ├─ (app)/                           # 인증 필요 사용자 영역 (공통 셸)
│  │  ├─ layout.tsx                    # TopBar + 잔액 칩
│  │  ├─ generate/[modelId]/page.tsx
│  │  ├─ wallet/page.tsx
│  │  ├─ wallet/topup/page.tsx
│  │  ├─ library/page.tsx
│  │  ├─ library/[genId]/page.tsx
│  │  └─ account/page.tsx
│  ├─ admin/                           # 관리자 영역 (사이드바 셸)
│  │  ├─ layout.tsx                    # requireAdmin + Sidebar
│  │  ├─ dashboard/page.tsx
│  │  ├─ topups/page.tsx
│  │  ├─ users/page.tsx
│  │  ├─ users/[id]/page.tsx
│  │  ├─ models/page.tsx
│  │  ├─ models/[id]/page.tsx
│  │  ├─ generations/page.tsx
│  │  ├─ generations/[id]/page.tsx
│  │  ├─ fx-rates/page.tsx
│  │  └─ audit/page.tsx
│  ├─ auth/callback/route.ts           # OAuth 콜백
│  ├─ api/
│  │  └─ cron/
│  │     ├─ poll-generations/route.ts
│  │     ├─ fx-update/route.ts
│  │     └─ cleanup-expired/route.ts
│  ├─ layout.tsx                       # root (폰트, 테마, Toaster)
│  └─ globals.css
│
├─ components/
│  ├─ ui/                              # shadcn/ui 원자 컴포넌트
│  ├─ layout/                          # TopBar, Sidebar, BalanceChip, Breadcrumb
│  ├─ models/                          # ModelCard, PriceTable, KindTabs
│  ├─ generate/                        # PromptInput, ImageDropzone, DurationPicker,
│  │                                   #   EstimateBar, ResultPanel, GenerateButton
│  ├─ wallet/                          # BalanceCard, TransactionTable, TopupForm
│  ├─ library/                         # GenerationGrid, GenerationCard, ResultViewer
│  ├─ admin/                           # KpiCard, TopupQueue, UserTable, ModelEditor,
│  │                                   #   PriceSimulator, GenerationMonitor, AuditTable
│  └─ common/                          # EmptyState, ConfirmDialog, MoneyText, FxNote
│
├─ lib/
│  ├─ actions/                         # L2 Server Actions (도메인별 파일)
│  │  ├─ generation.ts                 # estimate/create/getSignedUrl
│  │  ├─ wallet.ts                     # getWallet/listTransactions
│  │  ├─ topup.ts                      # create/listMy / (admin) approve/reject
│  │  ├─ admin-users.ts                # detail/adjustBalance
│  │  ├─ admin-models.ts               # update/simulate
│  │  ├─ admin-generations.ts          # listAll/forceRefund
│  │  └─ fx.ts                         # list/triggerUpdate
│  ├─ auth/
│  │  ├─ guards.ts                     # requireUser / requireAdmin
│  │  └─ session.ts                    # 현재 사용자/역할
│  ├─ wallet/
│  │  ├─ apply-tx.ts                   # wallet_apply_tx SQL 래퍼
│  │  └─ rules.ts                      # 잔액 규칙(순수)
│  ├─ models/
│  │  ├─ types.ts                      # ModelAdapter 인터페이스
│  │  ├─ registry.ts
│  │  ├─ pricing.ts                    # 견적/마진/환산 (순수)
│  │  ├─ image/{gpt-image,seedream,nanobanana}.ts
│  │  └─ video/{seedance,kling,veo3}.ts
│  ├─ generation/
│  │  ├─ service.ts                    # 생성 오케스트레이션(L3)
│  │  ├─ state.ts                      # 상태 전이 규칙(순수)
│  │  └─ settle.ts                     # 정산/환불 판단(순수)
│  ├─ fx/
│  │  ├─ service.ts                    # getCurrent/refresh
│  │  └─ provider.ts                   # 외부 환율 API 클라이언트
│  ├─ storage/
│  │  ├─ upload.ts                     # 결과/입력 업로드
│  │  └─ signed-url.ts
│  ├─ rate-limit/
│  │  └─ token-bucket.ts               # Postgres 기반
│  ├─ db/
│  │  └─ prisma.ts                     # PrismaClient 싱글톤
│  ├─ supabase/
│  │  ├─ server.ts                     # RSC/Action용 (service_role/anon 구분)
│  │  ├─ client.ts                     # 브라우저용 (anon)
│  │  └─ middleware.ts                 # 세션 리프레시
│  ├─ http/
│  │  └─ fetch.ts                      # timeout/no-retry fetch 래퍼
│  ├─ validation/                      # zod 스키마 (서버/클라 공유)
│  │  ├─ generation.ts
│  │  ├─ topup.ts
│  │  └─ admin.ts
│  ├─ audit/
│  │  └─ record.ts                     # recordAdminAction
│  ├─ money/
│  │  └─ format.ts                     # USD/KRW 포맷·환산·반올림 규칙
│  └─ constants.ts                     # DURATIONS=[3,5,10,15,30,60] 등
│
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts                          # 7개 모델 + 관리자 + 초기 환율
│
├─ db/sql/                             # Prisma migration에 포함될 raw SQL
│  ├─ functions/
│  │  ├─ wallet_apply_tx.sql
│  │  ├─ apply_topup.sql
│  │  └─ rate_limit_consume.sql
│  ├─ rls/                             # 테이블별 RLS 정책
│  └─ triggers/
│     └─ on_auth_user_created.sql      # User+Wallet+topup_code 생성
│
├─ tests/
│  ├─ unit/                            # 가격엔진, 어댑터(fixture), money
│  ├─ integration/                     # Server Action + 테스트 DB
│  ├─ e2e/                             # Playwright
│  ├─ sql/                             # pgTAP (wallet_apply_tx)
│  └─ fixtures/                        # 외부 API 응답 샘플
│
├─ middleware.ts                       # 세션 + 라우트 보호(/app, /admin)
├─ next.config.js                      # 보안 헤더 + CSP + 이미지 도메인
├─ vercel.json                         # cron schedules
├─ docs/
│  ├─ ARCHITECTURE.md                  # (본 문서)
│  └─ superpowers/specs/*.md
└─ package.json
```

---

## 5. 상태 관리 전략

### 5.1 서버 상태 (대부분)

- **기본은 React Server Components + Server Actions**. 목록·상세·잔액·거래내역은 RSC에서 직접 조회 → 클라이언트 전역 상태 불필요.
- 변경(생성/충전/승인 등)은 Server Action → `revalidatePath`/`revalidateTag`로 갱신.

### 5.2 클라이언트 상태 (국소)

| 종류 | 도구 | 예 |
|---|---|---|
| 폼 입력 | react-hook-form (로컬) | 프롬프트, 충전 폼, 모델 편집 |
| 견적 미리보기 | 컴포넌트 로컬 state | 옵션 변경 시 즉시 재계산(서버 메타 기반) |
| 생성 진행/실시간 | Supabase Realtime + TanStack Query | `/library`, `/library/[id]` 구독 |
| 낙관적 업데이트 | TanStack Query mutation | 관리자 승인/거절, 잔액 조정 |
| 토스트 | sonner (전역) | 성공/실패 알림 |
| 테마 | `next-themes` (다크 기본) | 라이트 토글은 Phase 2 |

원칙: **전역 클라이언트 스토어(Zustand/Redux) 도입하지 않는다.** 서버 상태는 서버에서, 클라 상태는 국소적으로. 도입 필요가 생기면 그때 재평가.

### 5.3 Realtime 구독 패턴

```
/library, /library/[id] 진입
  → supabase.channel('gen:'+userId)
      .on('postgres_changes',
          { event:'UPDATE', table:'generation', filter:'user_id=eq.'+userId },
          (payload) => queryClient.setQueryData(...))
  → 컴포넌트 unmount 시 unsubscribe
```

RLS가 타 사용자 row 구독을 차단 → 보안은 DB 레벨에서 보장.

---

## 6. 컴포넌트 계층 규칙

### 6.1 Server vs Client 결정

| 신호 | 컴포넌트 종류 |
|---|---|
| 데이터 조회·표시만 | **Server** (기본) |
| `onClick`/`onChange`/`useState`/`useEffect` 필요 | **Client** (`'use client'`) |
| Realtime/낙관적 업데이트 | **Client** |

원칙: Client 컴포넌트는 가능한 한 잎(leaf)에 두고, 데이터 조회는 Server에서 props로 내려준다. (예: `/library` page=Server에서 조회 → `GenerationGrid`=Client는 표시+구독만)

### 6.2 컴포넌트 책임 단위

- `MoneyText` — 금액 1개의 USD/KRW 병기·반올림 규칙을 단독 캡슐화 (금액 표기 버그 차단)
- `FxNote` — "1USD=N₩ (갱신 N분 전)" 일관 표기
- `EstimateBar` — 옵션 → 견적 계산을 한 곳에서 (서버 차감 로직과 동일 공식 공유: `lib/models/pricing.ts`)
- `ConfirmDialog` — 금전 액션 확인 모달 표준화
- `DurationPicker` — 6개 고정 + 모델별 disabled 규칙 캡슐화

### 6.3 가격 계산 단일 소스

- 견적(클라 미리보기)과 차감(서버 확정)은 **반드시 `lib/models/pricing.ts`의 동일 함수**를 사용. 클라/서버 공식 분기 금지 → 표기와 차감 불일치 원천 차단.
- 클라는 미리보기, 서버는 권위(authority). 서버가 항상 재계산·재검증.

---

## 7. 인증·인가 아키텍처

```
요청
 │
 ├─ middleware.ts
 │   - Supabase 세션 리프레시
 │   - /app/** , /admin/** 비로그인 → /auth/login
 │   - /admin/** 비관리자 → 404 또는 /
 │
 ├─ Server Component / Server Action
 │   - requireUser(): 세션 없으면 throw → 처리
 │   - requireAdmin(): role!=admin throw
 │
 └─ Postgres RLS (최종 방어선)
     - 사용자 데이터: auth.uid()=user_id
     - 모델/환율: SELECT 공개, 쓰기 admin
     - 코드 버그가 있어도 타인 데이터 비노출
```

- 관리자 역할: Supabase Auth 사용자 메타데이터 `role=admin` → JWT 클레임. seed/수동으로 본인 계정 1개 지정.
- 키 분리: 클라이언트=`anon` 키만, 서버=`service_role`(RLS 우회 필요한 cron/admin 한정) + 일반은 사용자 세션 기반.

---

## 8. Cron / 배경 작업

`vercel.json`:

| 경로 | 주기 | 역할 | 보호 |
|---|---|---|---|
| `/api/cron/poll-generations` | `* * * * *` (1분) | 영상 폴링·정산·환불·타임아웃 | `CRON_SECRET` 헤더 |
| `/api/cron/fx-update` | `0 * * * *` (1시간) | 환율 갱신 | `CRON_SECRET` |
| `/api/cron/cleanup-expired` | `0 19 * * *` (KST 04:00) | 30일 만료 파일 삭제 | `CRON_SECRET` |

- 모든 cron 핸들러는 `Authorization: Bearer $CRON_SECRET` 검증 후 실행. 외부 무단 호출 차단.
- 멱등 보장: 상태 전이 `WHERE status='RUNNING'` 조건, 중복 실행 안전.

---

## 9. 에러 처리 표준

| 계층 | 방식 |
|---|---|
| L4 외부 HTTP | timeout 30s, 재시도 0(시작), 폴링만 재시도. 실패 시 도메인 에러로 변환 |
| L3 도메인 | 명시적 에러 타입(`InsufficientBalanceError`, `UnsupportedDurationError`, `ContentBlockedError`) |
| L2 액션 | try/catch → `{ ok:false, code, message(한국어) }` 반환(throw 대신 결과 객체) |
| L1 UI | 결과 객체 분기 → 토스트/인라인 에러. 환불 발생 시 금액 명시 |

- 금전 트랜잭션 실패는 전부 롤백(부분 차감 불가). DB 트랜잭션 경계는 L2에서.

---

## 10. 보안 요약 (설계 §10 구현 매핑)

| 항목 | 구현 위치 |
|---|---|
| API 키 서버 전용 | `lib/models/**`는 server-only, `NEXT_PUBLIC_` 미사용 |
| Rate limit | `lib/rate-limit/token-bucket.ts` + `rate_limit_consume.sql` |
| 입력 검증 | `lib/validation/**` (zod), 액션 진입부 |
| Signed URL | `lib/storage/signed-url.ts` (TTL 5분) |
| 보안 헤더/CSP | `next.config.js` |
| RLS | `db/sql/rls/**` |
| 감사 로그 | `lib/audit/record.ts`, 모든 admin 액션 |
| 콘텐츠 차단 키워드 | `CONTENT_BLOCK_KEYWORDS` env (MVP 빈 값) |

---

## 11. 개발 순서 (구현 의존성)

```
P0 기반
  1. 프로젝트 스캐폴드 (Next.js+TS+Tailwind+shadcn, lint/typecheck/CI)
  2. Supabase 연결 + Prisma 스키마 + 마이그레이션
  3. SQL: wallet_apply_tx, RLS, on_auth_user_created 트리거 + pgTAP
  4. 인증 (로그인/가입/콜백/guards/middleware) + 셸 레이아웃

P1 금전·정산 코어
  5. money/format + pricing 엔진 + 단위테스트(불변식)
  6. fx 서비스 + /api/cron/fx-update
  7. 지갑 화면 + 충전 요청 + 관리자 승인/거절 (E2E: 가입→충전→승인)

P2 첫 종단 생성 흐름 (가장 단순 이미지 1개)
  8. 모델 어댑터 인터페이스 + registry + GPT-Image 어댑터
  9. 생성 스튜디오 + createGeneration(동기) + 결과 저장 + 라이브러리
 10. seed로 모델 카탈로그 + /models 화면

P3 확장
 11. 나머지 이미지 어댑터 3개
 12. 영상 어댑터 3개 + 비동기 + poll-generations cron + Realtime
 13. cleanup-expired cron + 만료 UX

P4 관리자 + 마감
 14. 관리자 대시보드/사용자/모델편집/생성모니터/환율/감사
 15. rate-limit, 보안 헤더/CSP, 백업
 16. 통합/E2E 보강 + zero-script-qa + 배포
```

각 단계는 독립 PR 단위. P0~P2까지가 "첫 이미지 1장 생성·차감"이 도는 최소 종단(end-to-end).

---

## 12. 미해결/추후 확정 (구현 중 채움)

- 각 외부 API의 실제 엔드포인트·요청 스키마·원가 단위 (어댑터 작성 시 공식 문서로 확정)
- Nanobanana 2.0/Pro의 실제 provider 및 인증 방식
- 영상 모델별 실제 지원 길이·해상도·화면비 옵션
- 환율 API 최종 선정 및 rate limit
- 관리자 이메일 알림 on/off 기본값

이 항목들은 아키텍처(레이어·경계)에 영향을 주지 않는다 — 어댑터/seed 데이터에 국한된다.

---

**문서 끝**
