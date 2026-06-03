# NS Field — Plan 1: P0 기반 + P1 금전 코어 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가입 → 충전 요청 → 관리자 승인 → 잔액 반영까지 도는 NS Field의 인증·지갑·충전 기반을 TDD로 구축한다.

**Architecture:** Next.js 15 App Router(L1) + Server Actions(L2) + 순수 도메인 로직(L3) + Supabase/Prisma/SQL(L4)의 단방향 레이어. 모든 잔액 변동은 Postgres 함수 `wallet_apply_tx()`를 단일 진입점으로 통과시켜 "잔액 = Σ(거래)" 불변식을 DB 레벨에서 강제한다.

**Tech Stack:** Next.js 15, TypeScript(strict), Tailwind CSS v4, shadcn/ui, Supabase(Auth/Postgres/Storage/Realtime), Prisma 6, Vitest, Playwright, pgTAP.

**관련 설계 문서:**
- `docs/superpowers/specs/2026-05-27-nsfield-design.md` (시스템 설계 — 스키마·정산 규칙)
- `docs/superpowers/specs/2026-05-30-nsfield-pages.md` (화면 명세 — 지갑/충전/관리자 충전)
- `docs/ARCHITECTURE.md` (레이어·디렉터리·불변식)

**이 Plan의 범위(P0+P1):** 스캐폴드, Supabase/Prisma, SQL 함수·트리거·RLS, 인증, 셸 레이아웃, money/format, 가격 엔진(차감 화면은 Plan 2), fx 서비스, 지갑, 충전 요청, 관리자 충전 승인, E2E 게이트.
**범위 밖(다음 Plan):** 모델 어댑터·생성 스튜디오·생성 차감·라이브러리(Plan 2), 영상/Realtime/cleanup(Plan 3), 관리자 나머지 페이지·보안 하드닝(Plan 4).

---

## 사전 준비 (Task 0)

### Task 0: 작업 브랜치 생성

**Files:** 없음 (git 작업)

- [ ] **Step 1: feature 브랜치 생성**

현재 `main`에 있으므로 작업 브랜치를 먼저 만든다.

Run:
```bash
git checkout -b feature/p0-p1-foundation
```
Expected: `Switched to a new branch 'feature/p0-p1-foundation'`

- [ ] **Step 2: .bkit 감사 로그를 추적 제외**

`.bkit/audit/*.jsonl`은 자동 생성 로그라 추적하지 않는다.

Create: `.gitignore` (루트, 임시 — Task 1에서 next가 덮어씀. 우선 .bkit만)
```gitignore
# bkit 런타임 로그 (자동 생성)
.bkit/audit/
.bkit/runtime/
.bkit/snapshots/
```

Run:
```bash
git rm -r --cached .bkit/audit 2>/dev/null; git add .gitignore && git commit -m "chore: bkit 런타임 로그 추적 제외"
```
Expected: 커밋 1개 생성.

---

# P0 — 기반

## Task 1: Next.js 15 + TypeScript + Tailwind 스캐폴드

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.gitignore`, `eslint.config.mjs`, `postcss.config.mjs`

- [ ] **Step 1: create-next-app 실행 (현재 디렉터리에 스캐폴드)**

루트에 이미 `docs/`, `.bkit/`, `CLAUDE.md`가 있으므로 임시 폴더에 생성 후 병합하지 않고, 현재 디렉터리에 직접 생성한다(`.`).

Run:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm --no-turbopack --yes
```
Expected: `app/`, `package.json`, `tsconfig.json` 등 생성. 기존 파일 충돌 시 프롬프트가 뜨면 기존 파일 유지(`docs`, `CLAUDE.md`는 건드리지 않음).

> 만약 디렉터리가 비어있지 않다는 이유로 거부되면: 임시 디렉터리(`../nsfield-scaffold`)에 생성 후 `app/ package.json tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs public/`를 루트로 복사하고 임시 디렉터리 삭제.

- [ ] **Step 2: TypeScript strict 확인**

Modify: `tsconfig.json` — `compilerOptions.strict`가 `true`인지 확인. 아니면 `true`로 설정하고 다음 추가:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
```

- [ ] **Step 3: 빌드·타입체크 통과 확인**

Run:
```bash
npm run build
```
Expected: 빌드 성공(기본 페이지). 에러 없음.

- [ ] **Step 4: 개발 스크립트 + 품질 스크립트 추가**

Modify: `package.json` `scripts`에 추가:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 5: typecheck 통과 확인**

Run:
```bash
npm run typecheck
```
Expected: 에러 없이 종료(exit 0).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Next.js 15 + TypeScript + Tailwind 스캐폴드"
```

---

## Task 2: Vitest 테스트 환경 + 다크 테마 토큰

**Files:**
- Create: `vitest.config.ts`, `tests/unit/.gitkeep`
- Modify: `package.json`, `app/globals.css`, `app/layout.tsx`

- [ ] **Step 1: Vitest 설치**

Run:
```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: vitest.config.ts 작성**

Create: `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 3: test 스크립트 추가**

Modify: `package.json` `scripts`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4: 스모크 테스트 작성·실행**

Create: `tests/unit/smoke.test.ts`
```typescript
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 5: 다크 테마 CSS 토큰 정의**

Modify: `app/globals.css` — Tailwind 지시어 아래에 디자인 토큰(설계 pages §0)을 CSS 변수로 추가:
```css
@import "tailwindcss";

:root {
  --bg-base: #0A0A0B;
  --bg-surface: #141416;
  --bg-surface-2: #1C1C20;
  --border: #2A2A30;
  --text-primary: #F4F4F5;
  --text-muted: #A1A1AA;
  --text-dim: #6B6B73;
  --accent: #6D5DFC;
  --accent-hover: #7E6FFF;
  --success: #22C55E;
  --warning: #F59E0B;
  --danger: #EF4444;
  --info: #38BDF8;
}

@theme inline {
  --color-bg-base: var(--bg-base);
  --color-bg-surface: var(--bg-surface);
  --color-bg-surface-2: var(--bg-surface-2);
  --color-border-default: var(--border);
  --color-text-primary: var(--text-primary);
  --color-text-muted: var(--text-muted);
  --color-text-dim: var(--text-dim);
  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-danger: var(--danger);
  --color-info: var(--info);
}

body {
  background: var(--bg-base);
  color: var(--text-primary);
}
```

- [ ] **Step 6: 다크 기본 적용**

Modify: `app/layout.tsx` — `<html lang="ko" className="dark">`로 변경하고 메타데이터 title을 `NS Field`로.

- [ ] **Step 7: 빌드 확인 + Commit**

Run: `npm run build && npm test`
Expected: 빌드 성공, 1 passed.

```bash
git add -A && git commit -m "test: Vitest 환경 + 다크 테마 토큰 추가"
```

---

## Task 3: 환경변수 + Supabase 클라이언트 (server/client/middleware)

**Files:**
- Create: `.env.example`, `.env.local`(git 제외), `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/middleware.ts`, `middleware.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Supabase 패키지 설치**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: .env.example 작성**

Create: `.env.example` (설계 §13 전체 중 P0+P1 해당분)
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
DIRECT_URL=

# 환율
EXCHANGE_RATE_API_URL=https://api.exchangerate.host

# 운영
CRON_SECRET=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 3: .env.local 생성(실제 값) + gitignore 확인**

Create: `.env.local` — Supabase 프로젝트 생성 후 실제 값 입력. (Supabase 대시보드에서 새 프로젝트 생성 → Settings > API에서 URL/anon/service_role, Settings > Database에서 connection string)

Modify: `.gitignore` — `.env*.local`이 이미 포함됐는지 확인(create-next-app 기본 포함). 없으면 추가.

- [ ] **Step 4: 브라우저용 클라이언트**

Create: `lib/supabase/client.ts`
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 5: 서버용 클라이언트 (RSC/Action)**

Create: `lib/supabase/server.ts`
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Component에서 set 호출 시 무시 (middleware가 갱신)
          }
        },
      },
    },
  )
}
```

- [ ] **Step 6: service_role 클라이언트 (RLS 우회 — cron/admin 전용)**

Create: `lib/supabase/admin.ts`
```typescript
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// RLS를 우회한다. 서버 신뢰 경로(cron, 검증된 admin action)에서만 사용.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
```

- [ ] **Step 7: 세션 갱신 미들웨어 헬퍼**

Create: `lib/supabase/middleware.ts`
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const needsAuth = path.startsWith('/wallet') || path.startsWith('/generate') ||
    path.startsWith('/library') || path.startsWith('/account') || path.startsWith('/admin')

  if (needsAuth && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  return response
}
```

- [ ] **Step 8: middleware.ts 루트 작성**

Create: `middleware.ts`
```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 9: 빌드 확인 + Commit**

Run: `npm run build`
Expected: 빌드 성공.

```bash
git add -A && git commit -m "feat: Supabase SSR 클라이언트 + 세션 미들웨어 추가"
```

---

## Task 4: Prisma 스키마 + 초기 마이그레이션

**Files:**
- Create: `prisma/schema.prisma`, `lib/db/prisma.ts`
- Modify: `package.json`

- [ ] **Step 1: Prisma 설치 + 초기화**

Run:
```bash
npm install -D prisma && npm install @prisma/client && npx prisma init
```
Expected: `prisma/schema.prisma`, `.env`에 `DATABASE_URL` 자리. (실제 값은 `.env.local` 사용 — 아래 Step 2에서 datasource 조정)

- [ ] **Step 2: schema.prisma 작성 (설계 §2 전체)**

Create/Modify: `prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model User {
  id            String   @id @default(uuid())
  email         String   @unique
  display_name  String?
  role          Role     @default(USER)
  topup_code    String   @unique
  created_at    DateTime @default(now())

  wallet         Wallet?
  generations    Generation[]
  topup_requests TopupRequest[]

  @@map("users")
}

model Wallet {
  id           String   @id @default(uuid())
  user_id      String   @unique
  balance_krw  Int      @default(0)
  updated_at   DateTime @updatedAt

  user         User @relation(fields: [user_id], references: [id])
  transactions WalletTransaction[]

  @@map("wallets")
}

model WalletTransaction {
  id            String   @id @default(uuid())
  wallet_id     String
  type          TxType
  amount_krw    Int
  balance_after Int
  ref_type      String?
  ref_id        String?
  memo          String?
  created_at    DateTime @default(now())

  wallet        Wallet @relation(fields: [wallet_id], references: [id])

  @@index([wallet_id, created_at(sort: Desc)])
  @@map("wallet_transactions")
}

model TopupRequest {
  id              String      @id @default(uuid())
  user_id         String
  amount_krw      Int
  depositor_name  String
  transferred_at  DateTime
  note            String?
  status          TopupStatus @default(PENDING)
  reviewed_by     String?
  reviewed_at     DateTime?
  reject_reason   String?
  created_at      DateTime    @default(now())

  user            User @relation(fields: [user_id], references: [id])

  @@index([status, created_at])
  @@map("topup_requests")
}

model Model {
  id            String    @id
  kind          ModelKind
  display_name  String
  provider      String
  is_active     Boolean   @default(true)
  margin_pct    Decimal   @default(10)
  pricing_json  Json

  @@map("models")
}

model Generation {
  id              String    @id @default(uuid())
  user_id         String
  model_id        String
  kind            ModelKind
  prompt          String
  input_image_url String?
  params_json     Json

  status          GenStatus @default(PENDING)
  external_job_id String?
  last_polled_at  DateTime?

  result_urls       String[]
  result_meta_json  Json?

  cost_usd_raw    Decimal?
  cost_usd_billed Decimal?
  margin_pct      Decimal?
  fx_rate         Decimal?
  charged_krw     Int?

  created_at    DateTime  @default(now())
  started_at    DateTime?
  finished_at   DateTime?
  expires_at    DateTime?
  failed_reason String?

  user          User @relation(fields: [user_id], references: [id])

  @@index([user_id, created_at(sort: Desc)])
  @@index([status, kind, last_polled_at])
  @@index([expires_at])
  @@map("generations")
}

model FxRate {
  id         String   @id @default(uuid())
  pair       String
  rate       Decimal
  source     String
  fetched_at DateTime @default(now())

  @@index([pair, fetched_at(sort: Desc)])
  @@map("fx_rates")
}

model AdminAction {
  id          String   @id @default(uuid())
  admin_id    String
  action      String
  target_type String?
  target_id   String?
  before_json Json?
  after_json  Json?
  reason      String?
  created_at  DateTime @default(now())

  @@index([admin_id, created_at(sort: Desc)])
  @@map("admin_actions")
}

enum Role         { USER ADMIN }
enum ModelKind    { IMAGE VIDEO }
enum TxType       { TOPUP CHARGE REFUND ADJUSTMENT }
enum TopupStatus  { PENDING APPROVED REJECTED }
enum GenStatus    { PENDING RUNNING SUCCEEDED FAILED CANCELED }
```

> 주의: `users` 테이블은 Supabase `auth.users`와 별개의 public 테이블이다. `User.id`는 트리거로 `auth.users.id`와 동일하게 채운다(Task 6).

- [ ] **Step 3: 첫 마이그레이션 생성·적용**

Run:
```bash
npx prisma migrate dev --name init
```
Expected: `prisma/migrations/<ts>_init/migration.sql` 생성, DB에 테이블 생성. Prisma Client 생성됨.

- [ ] **Step 4: Prisma 싱글톤**

Create: `lib/db/prisma.ts`
```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 5: postinstall로 prisma generate 보장**

Modify: `package.json` `scripts`에 추가:
```json
{
  "scripts": {
    "postinstall": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Prisma 스키마 + 초기 마이그레이션 추가"
```

---

## Task 5: SQL — wallet_apply_tx 함수 + pgTAP 테스트

**Files:**
- Create: `db/sql/functions/wallet_apply_tx.sql`, `prisma/migrations/<ts>_wallet_apply_tx/migration.sql`, `tests/sql/wallet_apply_tx.test.sql`

- [ ] **Step 1: wallet_apply_tx 함수 SQL 작성 (설계 §4.4)**

Create: `db/sql/functions/wallet_apply_tx.sql`
```sql
-- 잔액 변동의 단일 진입점. 잔액 = Σ(거래) 불변식과 음수 차단을 강제한다.
create or replace function wallet_apply_tx(
  p_wallet_id  uuid,
  p_type       text,         -- 'TOPUP'|'CHARGE'|'REFUND'|'ADJUSTMENT'
  p_amount_krw int,          -- 충전/환불 +, 차감 -
  p_ref_type   text default null,
  p_ref_id     uuid default null,
  p_memo       text default null
) returns wallet_transactions
language plpgsql
as $$
declare
  v_new_balance int;
  v_row wallet_transactions;
begin
  -- 1) 잔액 행 잠금
  perform 1 from wallets where id = p_wallet_id for update;
  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  -- 2) 차감 후 잔액 계산
  select balance_krw + p_amount_krw into v_new_balance
    from wallets where id = p_wallet_id;

  -- 3) 음수 금지 (ADJUSTMENT만 예외)
  if v_new_balance < 0 and p_type <> 'ADJUSTMENT' then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  -- 4) ledger insert
  insert into wallet_transactions(
    id, wallet_id, type, amount_krw, balance_after, ref_type, ref_id, memo, created_at
  ) values (
    gen_random_uuid(), p_wallet_id, p_type::"TxType", p_amount_krw, v_new_balance,
    p_ref_type, p_ref_id, p_memo, now()
  ) returning * into v_row;

  -- 5) 잔액 update
  update wallets set balance_krw = v_new_balance, updated_at = now()
    where id = p_wallet_id;

  return v_row;
end$$;
```

> `"TxType"`은 Prisma가 생성한 enum 타입명. 실제 enum 타입명은 마이그레이션 SQL에서 확인(`\dT`로 조회). Prisma 기본은 enum 이름 그대로 `"TxType"`.

- [ ] **Step 2: 마이그레이션으로 함수 등록**

Run:
```bash
npx prisma migrate dev --create-only --name wallet_apply_tx
```
그런 다음 생성된 `prisma/migrations/<ts>_wallet_apply_tx/migration.sql` 파일 내용을 `db/sql/functions/wallet_apply_tx.sql` 내용으로 교체(복사).

Run:
```bash
npx prisma migrate dev
```
Expected: 함수가 DB에 생성됨.

- [ ] **Step 3: pgTAP 활성화 + 테스트 작성**

Supabase는 pgTAP 확장을 지원한다. 테스트 SQL에서 활성화한다.

Create: `tests/sql/wallet_apply_tx.test.sql`
```sql
begin;
create extension if not exists pgtap;
select plan(5);

-- 픽스처: 사용자 + 지갑
insert into users(id, email, topup_code) values
  ('11111111-1111-1111-1111-111111111111', 't@x.com', 'TST1');
insert into wallets(id, user_id, balance_krw) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 0);

-- 1) 충전 +30000 → 잔액 30000
select lives_ok(
  $$ select wallet_apply_tx('22222222-2222-2222-2222-222222222222','TOPUP',30000,'topup_request',null,null) $$,
  'TOPUP 적용 성공');
select is(
  (select balance_krw from wallets where id='22222222-2222-2222-2222-222222222222'),
  30000, '충전 후 잔액 30000');

-- 2) 차감 -690 → 잔액 29310
select lives_ok(
  $$ select wallet_apply_tx('22222222-2222-2222-2222-222222222222','CHARGE',-690,'generation',null,null) $$,
  'CHARGE 적용 성공');
select is(
  (select balance_krw from wallets where id='22222222-2222-2222-2222-222222222222'),
  29310, '차감 후 잔액 29310');

-- 3) 잔액 초과 차감 → 예외
select throws_ok(
  $$ select wallet_apply_tx('22222222-2222-2222-2222-222222222222','CHARGE',-99999,'generation',null,null) $$,
  'INSUFFICIENT_BALANCE', '잔액 초과 차감은 차단');

select finish();
rollback;
```

- [ ] **Step 4: 테스트 실행**

Run (psql 직접 실행, `DIRECT_URL` 사용):
```bash
psql "$DIRECT_URL" -f tests/sql/wallet_apply_tx.test.sql
```
Expected: `ok 1 ... ok 5`, 실패 0. (psql 미설치 시 Supabase SQL Editor에 붙여넣어 실행)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: wallet_apply_tx 잔액 단일 진입점 함수 + pgTAP 테스트"
```

---

## Task 6: SQL — 가입 트리거 (User + Wallet + topup_code 자동 생성)

**Files:**
- Create: `db/sql/triggers/on_auth_user_created.sql`, 마이그레이션

- [ ] **Step 1: topup_code 생성 + 트리거 함수 SQL**

Create: `db/sql/triggers/on_auth_user_created.sql`
```sql
-- 4자리 영숫자 식별코드 생성 (혼동 문자 제외)
create or replace function gen_topup_code() returns text
language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  loop
    result := '';
    for i in 1..4 loop
      result := result || substr(chars, 1 + floor(random()*length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from users where topup_code = result);
  end loop;
  return result;
end$$;

-- auth.users insert 시 public.users + wallets 생성
create or replace function handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into users(id, email, display_name, topup_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    gen_topup_code()
  );
  insert into wallets(id, user_id, balance_krw)
  values (gen_random_uuid(), new.id, 0);
  return new;
end$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();
```

- [ ] **Step 2: 마이그레이션 등록**

Run:
```bash
npx prisma migrate dev --create-only --name on_auth_user_created
```
생성된 마이그레이션 SQL을 위 내용으로 교체 후:
```bash
npx prisma migrate dev
```
Expected: 트리거 생성됨.

- [ ] **Step 3: 수동 검증 (Supabase Auth로 테스트 가입)**

Run: Supabase 대시보드 Authentication > Users > Add user로 테스트 계정 1개 생성 후, SQL Editor에서:
```sql
select u.email, u.topup_code, w.balance_krw
from users u join wallets w on w.user_id = u.id;
```
Expected: 방금 만든 사용자가 `topup_code` 4자리 + 잔액 0으로 1행. (검증 후 테스트 사용자 삭제)

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: 가입 시 User+Wallet+topup_code 자동 생성 트리거"
```

---

## Task 7: SQL — RLS 정책

**Files:**
- Create: `db/sql/rls/policies.sql`, 마이그레이션

- [ ] **Step 1: RLS 정책 SQL (설계 §3)**

Create: `db/sql/rls/policies.sql`
```sql
-- 헬퍼: 현재 사용자가 admin인지
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from users where id = auth.uid() and role = 'ADMIN');
$$;

-- users
alter table users enable row level security;
create policy users_self_select on users for select
  using (id = auth.uid() or is_admin());
create policy users_self_update on users for update
  using (id = auth.uid());

-- wallets
alter table wallets enable row level security;
create policy wallets_self_select on wallets for select
  using (user_id = auth.uid() or is_admin());

-- wallet_transactions
alter table wallet_transactions enable row level security;
create policy wtx_self_select on wallet_transactions for select
  using (
    exists(select 1 from wallets w where w.id = wallet_id
           and (w.user_id = auth.uid() or is_admin()))
  );

-- topup_requests
alter table topup_requests enable row level security;
create policy topup_self_select on topup_requests for select
  using (user_id = auth.uid() or is_admin());
create policy topup_self_insert on topup_requests for insert
  with check (user_id = auth.uid());

-- generations
alter table generations enable row level security;
create policy gen_self_select on generations for select
  using (user_id = auth.uid() or is_admin());
create policy gen_self_insert on generations for insert
  with check (user_id = auth.uid());

-- models: 모두 읽기, 쓰기 admin
alter table models enable row level security;
create policy models_read on models for select using (true);
create policy models_admin_write on models for all
  using (is_admin()) with check (is_admin());

-- fx_rates: 모두 읽기, 쓰기 admin
alter table fx_rates enable row level security;
create policy fx_read on fx_rates for select using (true);
create policy fx_admin_write on fx_rates for all
  using (is_admin()) with check (is_admin());

-- admin_actions: admin만
alter table admin_actions enable row level security;
create policy admin_actions_admin on admin_actions for all
  using (is_admin()) with check (is_admin());
```

> 주의: Server Action에서 service_role 클라이언트(`createAdminClient`)를 쓰면 RLS를 우회한다. 일반 사용자 경로는 사용자 세션 기반 supabase 클라이언트 또는 Prisma(서버 신뢰)로 접근하되, 권한 가드(`requireUser`/`requireAdmin`)를 L2에서 반드시 건다. RLS는 최종 방어선이다.

- [ ] **Step 2: 마이그레이션 등록·적용**

Run:
```bash
npx prisma migrate dev --create-only --name rls_policies
```
SQL 교체 후:
```bash
npx prisma migrate dev
```
Expected: 정책 생성됨.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: 테이블별 RLS 정책 + is_admin 헬퍼 추가"
```

---

## Task 8: 인증 가드 + 로그인/가입/콜백

**Files:**
- Create: `lib/auth/guards.ts`, `lib/auth/session.ts`, `app/auth/callback/route.ts`, `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `lib/actions/auth.ts`
- Test: `tests/unit/auth/guards.test.ts`

- [ ] **Step 1: 세션 헬퍼 (현재 사용자/역할 조회)**

Create: `lib/auth/session.ts`
```typescript
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'

export type SessionUser = {
  id: string
  email: string
  role: 'USER' | 'ADMIN'
  display_name: string | null
  topup_code: string
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!dbUser) return null

  return {
    id: dbUser.id,
    email: dbUser.email,
    role: dbUser.role,
    display_name: dbUser.display_name,
    topup_code: dbUser.topup_code,
  }
}
```

- [ ] **Step 2: 가드 함수 작성**

Create: `lib/auth/guards.ts`
```typescript
import { getSessionUser, type SessionUser } from './session'

export class AuthError extends Error {
  constructor(public code: 'UNAUTHENTICATED' | 'FORBIDDEN') {
    super(code)
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new AuthError('UNAUTHENTICATED')
  return user
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role !== 'ADMIN') throw new AuthError('FORBIDDEN')
  return user
}
```

- [ ] **Step 3: 가드 단위 테스트 (모킹)**

Create: `tests/unit/auth/guards.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/session', () => ({
  getSessionUser: vi.fn(),
}))

import { getSessionUser } from '@/lib/auth/session'
import { requireUser, requireAdmin, AuthError } from '@/lib/auth/guards'

const mockGet = getSessionUser as unknown as ReturnType<typeof vi.fn>

describe('guards', () => {
  beforeEach(() => mockGet.mockReset())

  it('requireUser: 세션 없으면 UNAUTHENTICATED', async () => {
    mockGet.mockResolvedValue(null)
    await expect(requireUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('requireAdmin: USER면 FORBIDDEN', async () => {
    mockGet.mockResolvedValue({ id: '1', email: 'a@b.c', role: 'USER', display_name: null, topup_code: 'AAAA' })
    await expect(requireAdmin()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('requireAdmin: ADMIN이면 통과', async () => {
    const admin = { id: '1', email: 'a@b.c', role: 'ADMIN' as const, display_name: null, topup_code: 'AAAA' }
    mockGet.mockResolvedValue(admin)
    await expect(requireAdmin()).resolves.toEqual(admin)
  })
})
```

- [ ] **Step 4: 테스트 실행 (FAIL → 구현 확인)**

Run: `npm test -- tests/unit/auth/guards.test.ts`
Expected: 3 passed (구현이 이미 있으므로 통과). 만약 import 경로 에러면 `vitest.config.ts`의 alias 확인.

- [ ] **Step 5: 인증 Server Actions (로그인/가입/로그아웃)**

Create: `lib/actions/auth.ts`
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type ActionResult = { ok: true } | { ok: false; message: string }

export async function signInWithPassword(email: string, password: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' }
  return { ok: true }
}

export async function signUpWithPassword(email: string, password: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  })
  if (error) return { ok: false, message: '가입에 실패했습니다: ' + error.message }
  return { ok: true }
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/auth/login')
}

export async function signInWithGoogle(): Promise<ActionResult & { url?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  })
  if (error || !data.url) return { ok: false, message: 'Google 로그인에 실패했습니다.' }
  return { ok: true, url: data.url }
}
```

- [ ] **Step 6: OAuth 콜백 라우트**

Create: `app/auth/callback/route.ts`
```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/models'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }
  return NextResponse.redirect(`${origin}/auth/login?error=auth`)
}
```

- [ ] **Step 7: 인증 레이아웃 + 로그인/가입 페이지 (Client)**

Create: `app/(auth)/layout.tsx`
```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">NS Field</h1>
          <p className="text-[var(--text-muted)] text-sm">Not Script.</p>
        </div>
        {children}
      </div>
    </div>
  )
}
```

Create: `app/(auth)/login/page.tsx`
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signInWithPassword, signInWithGoogle } from '@/lib/actions/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await signInWithPassword(email, password)
    setLoading(false)
    if (res.ok) router.push('/models')
    else setError(res.message)
  }

  async function onGoogle() {
    const res = await signInWithGoogle()
    if (res.ok && res.url) window.location.href = res.url
    else if (!res.ok) setError(res.message)
  }

  return (
    <div className="space-y-4">
      <button
        onClick={onGoogle}
        className="w-full py-2.5 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)] hover:bg-[var(--bg-surface)]"
      >
        Google로 계속하기
      </button>
      <div className="text-center text-xs text-[var(--text-dim)]">또는</div>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="email" required placeholder="이메일" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)]"
        />
        <input
          type="password" required placeholder="비밀번호" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)]"
        />
        {error && <p className="text-[var(--danger)] text-sm">{error}</p>}
        <button
          type="submit" disabled={loading}
          className="w-full py-2.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {loading ? '로그인 중…' : '로그인'}
        </button>
      </form>
      <p className="text-center text-sm text-[var(--text-muted)]">
        계정이 없으신가요? <Link href="/auth/signup" className="text-[var(--accent)]">가입하기</Link>
      </p>
    </div>
  )
}
```

Create: `app/(auth)/signup/page.tsx` (로그인과 동일 구조, `signUpWithPassword` 호출, 성공 시 안내 메시지 "확인 메일을 확인하세요" 또는 자동 로그인되면 `/models`로). 코드는 login 페이지에서 `signInWithPassword`→`signUpWithPassword`, 버튼 문구만 "가입하기"로 바꾸고 성공 시:
```tsx
// onSubmit 성공 분기
if (res.ok) {
  setError(null)
  router.push('/models') // 이메일 확인 비활성 설정이면 즉시. 활성이면 안내 페이지로.
}
```

- [ ] **Step 8: 빌드 + 테스트 + Commit**

Run: `npm run build && npm test`
Expected: 빌드 성공, 모든 테스트 통과.

```bash
git add -A && git commit -m "feat: 인증(로그인/가입/OAuth 콜백) + 권한 가드 추가"
```

---

## Task 9: 앱 셸 레이아웃 (사용자 TopBar + 관리자 Sidebar)

**Files:**
- Create: `app/(app)/layout.tsx`, `components/layout/TopBar.tsx`, `components/layout/BalanceChip.tsx`, `app/admin/layout.tsx`, `components/layout/AdminSidebar.tsx`, `components/common/MoneyText.tsx`
- Test: `tests/unit/components/MoneyText.test.tsx`

- [ ] **Step 1: MoneyText 컴포넌트 (실패 테스트 먼저)**

Create: `tests/unit/components/MoneyText.test.tsx`
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MoneyText } from '@/components/common/MoneyText'

describe('MoneyText', () => {
  it('KRW 주표기 + 천단위 콤마', () => {
    render(<MoneyText krw={30000} />)
    expect(screen.getByText('₩30,000')).toBeInTheDocument()
  })

  it('USD 주표기는 $ + 소수 2자리', () => {
    render(<MoneyText usd={0.5} primary="usd" />)
    expect(screen.getByText('$0.50')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 테스트 실행 (FAIL 확인)**

Run: `npm test -- tests/unit/components/MoneyText.test.tsx`
Expected: FAIL — `MoneyText` 모듈 없음.

- [ ] **Step 3: MoneyText 구현**

Create: `components/common/MoneyText.tsx`
```tsx
type Props = {
  krw?: number
  usd?: number
  primary?: 'krw' | 'usd'
  className?: string
}

export function formatKrw(n: number): string {
  return '₩' + Math.round(n).toLocaleString('ko-KR')
}

export function formatUsd(n: number): string {
  return '$' + n.toFixed(2)
}

export function MoneyText({ krw, usd, primary = 'krw', className }: Props) {
  const showKrwFirst = primary === 'krw'
  const krwStr = krw !== undefined ? formatKrw(krw) : null
  const usdStr = usd !== undefined ? formatUsd(usd) : null
  const primaryStr = showKrwFirst ? krwStr : usdStr
  const secondaryStr = showKrwFirst ? usdStr : krwStr

  return (
    <span className={className}>
      <span className="font-mono">{primaryStr}</span>
      {secondaryStr && (
        <span className="text-[var(--text-dim)] text-sm ml-1">≈ {secondaryStr}</span>
      )}
    </span>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- tests/unit/components/MoneyText.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: BalanceChip (Server Component — 잔액 조회)**

Create: `components/layout/BalanceChip.tsx`
```tsx
import Link from 'next/link'
import { prisma } from '@/lib/db/prisma'
import { formatKrw } from '@/components/common/MoneyText'

export async function BalanceChip({ userId }: { userId: string }) {
  const wallet = await prisma.wallet.findUnique({ where: { user_id: userId } })
  const balance = wallet?.balance_krw ?? 0
  return (
    <Link
      href="/wallet"
      className="px-3 py-1.5 rounded-full bg-[var(--bg-surface-2)] border border-[var(--border)] text-sm font-mono hover:bg-[var(--bg-surface)]"
    >
      {formatKrw(balance)}
    </Link>
  )
}
```

- [ ] **Step 6: TopBar**

Create: `components/layout/TopBar.tsx`
```tsx
import Link from 'next/link'
import { BalanceChip } from './BalanceChip'
import type { SessionUser } from '@/lib/auth/session'

export function TopBar({ user }: { user: SessionUser }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg-base)]/80 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <nav className="flex items-center gap-6">
          <Link href="/models" className="font-bold">NS Field</Link>
          <Link href="/models" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">모델</Link>
          <Link href="/library" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">라이브러리</Link>
        </nav>
        <div className="flex items-center gap-3">
          <BalanceChip userId={user.id} />
          {user.role === 'ADMIN' && (
            <Link href="/admin" className="text-sm text-[var(--accent)]">관리자</Link>
          )}
          <Link href="/account" className="text-sm">{user.display_name ?? '계정'}</Link>
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 7: 사용자 영역 레이아웃**

Create: `app/(app)/layout.tsx`
```tsx
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { TopBar } from '@/components/layout/TopBar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/auth/login')
  return (
    <div>
      <TopBar user={user} />
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 8: 관리자 Sidebar + 레이아웃 (requireAdmin)**

Create: `components/layout/AdminSidebar.tsx`
```tsx
import Link from 'next/link'

const items = [
  { href: '/admin/dashboard', label: '대시보드' },
  { href: '/admin/topups', label: '충전' },
  { href: '/admin/users', label: '사용자' },
  { href: '/admin/models', label: '모델' },
  { href: '/admin/generations', label: '생성내역' },
  { href: '/admin/fx-rates', label: '환율' },
  { href: '/admin/audit', label: '감사로그' },
]

export function AdminSidebar({ pendingTopups }: { pendingTopups: number }) {
  return (
    <aside className="w-48 shrink-0 border-r border-[var(--border)] min-h-screen p-4">
      <div className="font-bold mb-6">NS Admin</div>
      <nav className="space-y-1">
        {items.map((it) => (
          <Link key={it.href} href={it.href}
            className="flex items-center justify-between px-3 py-2 rounded-md text-sm text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]">
            <span>{it.label}</span>
            {it.href === '/admin/topups' && pendingTopups > 0 && (
              <span className="text-xs bg-[var(--warning)] text-black rounded-full px-1.5">{pendingTopups}</span>
            )}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
```

Create: `app/admin/layout.tsx`
```tsx
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'
import { AdminSidebar } from '@/components/layout/AdminSidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/auth/login')
  if (user.role !== 'ADMIN') redirect('/')

  const pending = await prisma.topupRequest.count({ where: { status: 'PENDING' } })

  return (
    <div className="flex">
      <AdminSidebar pendingTopups={pending} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 9: 빌드 + 테스트 + Commit**

Run: `npm run build && npm test`
Expected: 빌드 성공, 전체 테스트 통과.

```bash
git add -A && git commit -m "feat: 사용자 TopBar + 관리자 Sidebar 셸 레이아웃 + MoneyText"
```

---

# P1 — 금전 코어

## Task 10: money 포맷·환산 유틸 + 가격 엔진

**Files:**
- Create: `lib/money/format.ts`, `lib/constants.ts`, `lib/models/pricing.ts`, `lib/models/types.ts`
- Test: `tests/unit/money/format.test.ts`, `tests/unit/models/pricing.test.ts`

- [ ] **Step 1: 환산 유틸 실패 테스트**

Create: `tests/unit/money/format.test.ts`
```typescript
import { describe, it, expect } from 'vitest'
import { usdToKrw, roundCeilUsd } from '@/lib/money/format'

describe('money/format', () => {
  it('usdToKrw: 반올림 정수', () => {
    expect(usdToKrw(0.5, 1380)).toBe(690)
    expect(usdToKrw(0.04, 1380)).toBe(55) // 55.2 → 55
  })

  it('roundCeilUsd: 4자리 올림 (운영자 손해 방지)', () => {
    expect(roundCeilUsd(0.040000001, 4)).toBe(0.0401)
    expect(roundCeilUsd(0.044, 4)).toBe(0.044)
  })
})
```

- [ ] **Step 2: 실행 (FAIL)**

Run: `npm test -- tests/unit/money/format.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

Create: `lib/money/format.ts`
```typescript
export function usdToKrw(usd: number, fxRate: number): number {
  return Math.round(usd * fxRate)
}

export function roundCeilUsd(usd: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.ceil(usd * f) / f
}
```

Run: `npm test -- tests/unit/money/format.test.ts` → 2 passed.

- [ ] **Step 4: 상수 + 어댑터 타입**

Create: `lib/constants.ts`
```typescript
export const ALLOWED_DURATIONS_SEC = [3, 5, 10, 15, 30, 60] as const
export type DurationSec = (typeof ALLOWED_DURATIONS_SEC)[number]

export const FX_PAIR = 'USDKRW'
export const FX_MAX_AGE_MS = 60 * 60 * 1000 // 1시간
```

Create: `lib/models/types.ts`
```typescript
export type ModelKind = 'IMAGE' | 'VIDEO'

export type GenerationParams = {
  prompt: string
  count?: number
  duration_sec?: number
  [key: string]: unknown
}

export type PricingJson =
  | { kind: 'per_image'; usd_per_unit: number; options?: Record<string, unknown> }
  | { kind: 'per_token'; usd_per_unit: number; options?: Record<string, unknown> }
  | { kind: 'per_second'; usd_per_unit: number; options: { allowed_durations_sec: number[]; polling_interval_sec: number } }
  | { kind: 'per_video_fixed'; tiers: Record<string, number>; options: { allowed_durations_sec: number[]; polling_interval_sec: number } }

export type ModelMeta = {
  id: string
  kind: ModelKind
  display_name: string
  provider: string
  is_active: boolean
  margin_pct: number
  pricing_json: PricingJson
}
```

- [ ] **Step 5: 가격 엔진 실패 테스트 (설계 §7b)**

Create: `tests/unit/models/pricing.test.ts`
```typescript
import { describe, it, expect } from 'vitest'
import { estimateRawUsd, estimateBilledUsd } from '@/lib/models/pricing'
import type { ModelMeta } from '@/lib/models/types'

const imageModel: ModelMeta = {
  id: 'gpt-image-2.0', kind: 'IMAGE', display_name: 'GPT', provider: 'openai',
  is_active: true, margin_pct: 10,
  pricing_json: { kind: 'per_image', usd_per_unit: 0.04 },
}

const videoFixed: ModelMeta = {
  id: 'veo3', kind: 'VIDEO', display_name: 'Veo3', provider: 'google',
  is_active: true, margin_pct: 10,
  pricing_json: { kind: 'per_video_fixed', tiers: { '5': 0.45, '10': 0.82 },
    options: { allowed_durations_sec: [5, 10], polling_interval_sec: 60 } },
}

describe('pricing', () => {
  it('이미지 장당 원가', () => {
    expect(estimateRawUsd(imageModel, { prompt: 'x', count: 2 })).toBeCloseTo(0.08)
  })

  it('이미지 마진 10% 포함', () => {
    expect(estimateBilledUsd(imageModel, { prompt: 'x' })).toBeCloseTo(0.044)
  })

  it('영상 고정가 tier', () => {
    expect(estimateRawUsd(videoFixed, { prompt: 'x', duration_sec: 5 })).toBe(0.45)
  })

  it('영상 미지원 길이는 예외', () => {
    expect(() => estimateRawUsd(videoFixed, { prompt: 'x', duration_sec: 15 }))
      .toThrowError('UNSUPPORTED_DURATION')
  })
})
```

- [ ] **Step 6: 실행 (FAIL)**

Run: `npm test -- tests/unit/models/pricing.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 7: 가격 엔진 구현**

Create: `lib/models/pricing.ts`
```typescript
import type { ModelMeta, GenerationParams } from './types'
import { roundCeilUsd } from '@/lib/money/format'

export class UnsupportedDurationError extends Error {
  constructor() {
    super('UNSUPPORTED_DURATION')
  }
}

export function estimateRawUsd(model: ModelMeta, params: GenerationParams): number {
  const p = model.pricing_json

  if (model.kind === 'VIDEO' && 'options' in p && 'allowed_durations_sec' in p.options) {
    const d = params.duration_sec
    if (d === undefined || !p.options.allowed_durations_sec.includes(d)) {
      throw new UnsupportedDurationError()
    }
  }

  switch (p.kind) {
    case 'per_image':
      return p.usd_per_unit * (params.count ?? 1)
    case 'per_token':
      return p.usd_per_unit * (typeof params.tokens === 'number' ? params.tokens : 1)
    case 'per_second':
      return p.usd_per_unit * (params.duration_sec ?? 0)
    case 'per_video_fixed': {
      const tier = p.tiers[String(params.duration_sec)]
      if (tier === undefined) throw new UnsupportedDurationError()
      return tier
    }
  }
}

export function estimateBilledUsd(model: ModelMeta, params: GenerationParams): number {
  const raw = estimateRawUsd(model, params)
  return roundCeilUsd(raw * (1 + model.margin_pct / 100), 4)
}
```

- [ ] **Step 8: 통과 + Commit**

Run: `npm test`
Expected: 전체 통과.

```bash
git add -A && git commit -m "feat: money 환산 유틸 + 가격 엔진(견적/마진) + 어댑터 타입"
```

---

## Task 11: fx 서비스 + 환율 갱신 cron

**Files:**
- Create: `lib/fx/provider.ts`, `lib/fx/service.ts`, `lib/http/fetch.ts`, `app/api/cron/fx-update/route.ts`, `vercel.json`
- Test: `tests/unit/fx/service.test.ts`

- [ ] **Step 1: timeout fetch 래퍼**

Create: `lib/http/fetch.ts`
```typescript
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30000,
): Promise<Response> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}
```

- [ ] **Step 2: 환율 provider**

Create: `lib/fx/provider.ts`
```typescript
import { fetchWithTimeout } from '@/lib/http/fetch'

// exchangerate.host: GET /live 또는 /latest?base=USD&symbols=KRW
export async function fetchUsdKrw(): Promise<number> {
  const base = process.env.EXCHANGE_RATE_API_URL ?? 'https://api.exchangerate.host'
  const res = await fetchWithTimeout(`${base}/latest?base=USD&symbols=KRW`)
  if (!res.ok) throw new Error('FX_FETCH_FAILED')
  const json = (await res.json()) as { rates?: { KRW?: number } }
  const rate = json.rates?.KRW
  if (!rate || rate <= 0) throw new Error('FX_INVALID')
  return rate
}
```

- [ ] **Step 3: fx 서비스 (캐시 우선 + 폴백) — 실패 테스트**

Create: `tests/unit/fx/service.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({
  prisma: { fxRate: { findFirst: vi.fn(), create: vi.fn() } },
}))
vi.mock('@/lib/fx/provider', () => ({ fetchUsdKrw: vi.fn() }))

import { prisma } from '@/lib/db/prisma'
import { fetchUsdKrw } from '@/lib/fx/provider'
import { getCurrentFxRate } from '@/lib/fx/service'

const findFirst = prisma.fxRate.findFirst as unknown as ReturnType<typeof vi.fn>
const create = prisma.fxRate.create as unknown as ReturnType<typeof vi.fn>
const fetchMock = fetchUsdKrw as unknown as ReturnType<typeof vi.fn>

describe('getCurrentFxRate', () => {
  beforeEach(() => {
    findFirst.mockReset(); create.mockReset(); fetchMock.mockReset()
  })

  it('1시간 이내 캐시가 있으면 그것을 반환', async () => {
    findFirst.mockResolvedValue({ rate: { toNumber: () => 1380 }, fetched_at: new Date() })
    const r = await getCurrentFxRate()
    expect(r).toBe(1380)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('캐시 없으면 외부 호출 후 저장', async () => {
    findFirst.mockResolvedValue(null)
    fetchMock.mockResolvedValue(1400)
    create.mockResolvedValue({})
    const r = await getCurrentFxRate()
    expect(r).toBe(1400)
    expect(create).toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: 실행 (FAIL)**

Run: `npm test -- tests/unit/fx/service.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 5: fx 서비스 구현**

Create: `lib/fx/service.ts`
```typescript
import { prisma } from '@/lib/db/prisma'
import { fetchUsdKrw } from './provider'
import { FX_PAIR, FX_MAX_AGE_MS } from '@/lib/constants'

export async function getCurrentFxRate(): Promise<number> {
  const latest = await prisma.fxRate.findFirst({
    where: { pair: FX_PAIR },
    orderBy: { fetched_at: 'desc' },
  })

  if (latest && Date.now() - new Date(latest.fetched_at).getTime() < FX_MAX_AGE_MS) {
    return Number(latest.rate)
  }

  // 폴백: 외부 즉시 호출 후 저장
  const rate = await fetchUsdKrw()
  await prisma.fxRate.create({
    data: { pair: FX_PAIR, rate, source: 'exchangerate.host' },
  })
  return rate
}

export async function refreshFxRate(): Promise<number> {
  const rate = await fetchUsdKrw()
  await prisma.fxRate.create({
    data: { pair: FX_PAIR, rate, source: 'exchangerate.host' },
  })
  return rate
}
```

Run: `npm test -- tests/unit/fx/service.test.ts` → 2 passed.

- [ ] **Step 6: 환율 갱신 cron 라우트**

Create: `app/api/cron/fx-update/route.ts`
```typescript
import { NextResponse } from 'next/server'
import { refreshFxRate } from '@/lib/fx/service'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  try {
    const rate = await refreshFxRate()
    return NextResponse.json({ ok: true, rate })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 7: vercel.json cron 등록**

Create: `vercel.json`
```json
{
  "crons": [
    { "path": "/api/cron/fx-update", "schedule": "0 * * * *" }
  ]
}
```

> poll-generations, cleanup-expired cron은 Plan 2/3에서 추가.

- [ ] **Step 8: 빌드 + 테스트 + Commit**

Run: `npm run build && npm test`
Expected: 성공.

```bash
git add -A && git commit -m "feat: 환율 서비스(캐시+폴백) + 시간당 갱신 cron"
```

---

## Task 12: seed — 모델 카탈로그 + 관리자 + 초기 환율

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json`(tsx 설치)

- [ ] **Step 1: tsx 설치**

Run:
```bash
npm install -D tsx
```

- [ ] **Step 2: seed 스크립트 (7개 모델 + 초기 환율)**

Create: `prisma/seed.ts`
```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 초기 환율 (실제값은 cron이 갱신)
  await prisma.fxRate.create({
    data: { pair: 'USDKRW', rate: 1380, source: 'seed' },
  })

  // 모델 카탈로그 (단가는 운영 중 /admin/models에서 조정)
  const models = [
    { id: 'gpt-image-2.0', kind: 'IMAGE', display_name: 'GPT-Image-2.0', provider: 'openai',
      pricing_json: { kind: 'per_image', usd_per_unit: 0.04 } },
    { id: 'seedream-4.5', kind: 'IMAGE', display_name: 'Seedream 4.5', provider: 'bytedance',
      pricing_json: { kind: 'per_image', usd_per_unit: 0.03 } },
    { id: 'nanobanana-2.0', kind: 'IMAGE', display_name: 'Nanobanana-2.0', provider: 'nanobanana',
      pricing_json: { kind: 'per_image', usd_per_unit: 0.02 } },
    { id: 'nanobanana-pro', kind: 'IMAGE', display_name: 'Nanobanana Pro', provider: 'nanobanana',
      pricing_json: { kind: 'per_image', usd_per_unit: 0.05 } },
    { id: 'veo3', kind: 'VIDEO', display_name: 'Veo3', provider: 'google',
      pricing_json: { kind: 'per_video_fixed', tiers: { '3': 0.3, '5': 0.45, '10': 0.82 },
        options: { allowed_durations_sec: [3, 5, 10], polling_interval_sec: 60 } } },
    { id: 'kling', kind: 'VIDEO', display_name: 'Kling', provider: 'kuaishou',
      pricing_json: { kind: 'per_second', usd_per_unit: 0.07,
        options: { allowed_durations_sec: [5, 10], polling_interval_sec: 60 } } },
    { id: 'seedance-2.0', kind: 'VIDEO', display_name: 'Seedance 2.0', provider: 'bytedance',
      pricing_json: { kind: 'per_video_fixed', tiers: { '5': 0.4, '10': 0.7, '15': 1.0 },
        options: { allowed_durations_sec: [5, 10, 15], polling_interval_sec: 60 } } },
  ] as const

  for (const m of models) {
    await prisma.model.upsert({
      where: { id: m.id },
      update: { pricing_json: m.pricing_json, display_name: m.display_name, provider: m.provider },
      create: { ...m, margin_pct: 10, is_active: true },
    })
  }

  console.log('seed 완료:', models.length, '개 모델')
}

main().then(() => prisma.$disconnect())
```

- [ ] **Step 3: seed 실행**

Run:
```bash
npm run db:seed
```
Expected: `seed 완료: 7 개 모델`. 에러 없음.

- [ ] **Step 4: 관리자 지정 안내 (수동)**

본인 계정을 ADMIN으로 지정한다. 먼저 본인 이메일로 가입(앱 또는 Supabase 대시보드) 후 SQL Editor에서:
```sql
update users set role = 'ADMIN' where email = '<본인이메일>';
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: 모델 카탈로그 + 초기 환율 seed 스크립트"
```

---

## Task 13: 지갑 페이지 (잔액 + 거래 내역)

**Files:**
- Create: `lib/actions/wallet.ts`, `app/(app)/wallet/page.tsx`, `components/wallet/BalanceCard.tsx`, `components/wallet/TransactionTable.tsx`
- Test: `tests/unit/actions/wallet.test.ts`

- [ ] **Step 1: wallet 조회 액션 — 실패 테스트**

Create: `tests/unit/actions/wallet.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/guards', () => ({ requireUser: vi.fn() }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    wallet: { findUnique: vi.fn() },
    walletTransaction: { findMany: vi.fn() },
  },
}))

import { requireUser } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { getMyWallet } from '@/lib/actions/wallet'

const reqUser = requireUser as unknown as ReturnType<typeof vi.fn>
const findUnique = prisma.wallet.findUnique as unknown as ReturnType<typeof vi.fn>

describe('getMyWallet', () => {
  beforeEach(() => { reqUser.mockReset(); findUnique.mockReset() })

  it('내 지갑 잔액을 반환', async () => {
    reqUser.mockResolvedValue({ id: 'u1' })
    findUnique.mockResolvedValue({ id: 'w1', user_id: 'u1', balance_krw: 30000 })
    const w = await getMyWallet()
    expect(w.balance_krw).toBe(30000)
    expect(findUnique).toHaveBeenCalledWith({ where: { user_id: 'u1' } })
  })
})
```

- [ ] **Step 2: 실행 (FAIL)**

Run: `npm test -- tests/unit/actions/wallet.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: wallet 액션 구현**

Create: `lib/actions/wallet.ts`
```typescript
'use server'

import { requireUser } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'

export async function getMyWallet() {
  const user = await requireUser()
  const wallet = await prisma.wallet.findUnique({ where: { user_id: user.id } })
  return wallet ?? { id: '', user_id: user.id, balance_krw: 0, updated_at: new Date() }
}

export async function listMyTransactions(limit = 30, cursor?: string) {
  const user = await requireUser()
  const wallet = await prisma.wallet.findUnique({ where: { user_id: user.id } })
  if (!wallet) return { items: [], nextCursor: null as string | null }

  const items = await prisma.walletTransaction.findMany({
    where: { wallet_id: wallet.id },
    orderBy: { created_at: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  const hasMore = items.length > limit
  return {
    items: hasMore ? items.slice(0, limit) : items,
    nextCursor: hasMore ? items[limit - 1]!.id : null,
  }
}
```

Run: `npm test -- tests/unit/actions/wallet.test.ts` → 1 passed.

- [ ] **Step 4: BalanceCard + TransactionTable + 페이지**

Create: `components/wallet/BalanceCard.tsx`
```tsx
import Link from 'next/link'
import { MoneyText } from '@/components/common/MoneyText'

export function BalanceCard({ balanceKrw, fxRate, topupCode }: {
  balanceKrw: number; fxRate: number; topupCode: string
}) {
  const usd = balanceKrw / fxRate
  return (
    <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] p-6 flex items-start justify-between">
      <div>
        <div className="text-sm text-[var(--text-muted)]">현재 잔액</div>
        <div className="text-3xl font-bold font-mono mt-1">
          <MoneyText krw={balanceKrw} usd={usd} primary="krw" />
        </div>
        <div className="text-xs text-[var(--text-dim)] mt-2">
          1USD = {fxRate.toLocaleString('ko-KR')}₩ · 식별 코드 <span className="font-mono">{topupCode}</span>
        </div>
      </div>
      <Link href="/wallet/topup"
        className="px-4 py-2 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm">
        충전하기
      </Link>
    </div>
  )
}
```

Create: `components/wallet/TransactionTable.tsx`
```tsx
import { formatKrw } from '@/components/common/MoneyText'

type Tx = {
  id: string; type: string; amount_krw: number; balance_after: number
  memo: string | null; created_at: Date
}

const typeLabel: Record<string, string> = {
  TOPUP: '충전', CHARGE: '차감', REFUND: '환불', ADJUSTMENT: '조정',
}

export function TransactionTable({ items }: { items: Tx[] }) {
  if (items.length === 0) {
    return <p className="text-[var(--text-dim)] text-sm py-8 text-center">거래 내역이 없습니다.</p>
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-[var(--text-muted)] text-left">
        <tr className="border-b border-[var(--border)]">
          <th className="py-2">일시</th><th>유형</th><th className="text-right">금액</th>
          <th className="text-right">잔액</th><th>비고</th>
        </tr>
      </thead>
      <tbody>
        {items.map((t) => (
          <tr key={t.id} className="border-b border-[var(--border)]">
            <td className="py-2 font-mono text-xs">{new Date(t.created_at).toLocaleString('ko-KR')}</td>
            <td>{typeLabel[t.type] ?? t.type}</td>
            <td className={`text-right font-mono ${t.amount_krw < 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
              {t.amount_krw > 0 ? '+' : ''}{formatKrw(t.amount_krw)}
            </td>
            <td className="text-right font-mono">{formatKrw(t.balance_after)}</td>
            <td className="text-[var(--text-muted)]">{t.memo ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

Create: `app/(app)/wallet/page.tsx`
```tsx
import { getSessionUser } from '@/lib/auth/session'
import { getMyWallet, listMyTransactions } from '@/lib/actions/wallet'
import { getCurrentFxRate } from '@/lib/fx/service'
import { BalanceCard } from '@/components/wallet/BalanceCard'
import { TransactionTable } from '@/components/wallet/TransactionTable'

export default async function WalletPage() {
  const user = await getSessionUser()
  const [wallet, txs, fx] = await Promise.all([
    getMyWallet(),
    listMyTransactions(),
    getCurrentFxRate(),
  ])
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">지갑</h1>
      <BalanceCard balanceKrw={wallet.balance_krw} fxRate={fx} topupCode={user!.topup_code} />
      <div>
        <h2 className="text-sm font-semibold mb-3">거래 내역</h2>
        <TransactionTable items={txs.items} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 빌드 + 테스트 + Commit**

Run: `npm run build && npm test`
Expected: 성공.

```bash
git add -A && git commit -m "feat: 지갑 페이지(잔액 카드 + 거래 내역)"
```

---

## Task 14: 충전 요청 (검증 + 액션 + 폼 + 내역)

**Files:**
- Create: `lib/validation/topup.ts`, `lib/actions/topup.ts`, `app/(app)/wallet/topup/page.tsx`, `components/wallet/TopupForm.tsx`, `components/wallet/MyTopupList.tsx`
- Test: `tests/unit/validation/topup.test.ts`, `tests/unit/actions/topup.test.ts`

- [ ] **Step 1: zod 설치 + 검증 스키마 — 실패 테스트**

Run: `npm install zod`

Create: `tests/unit/validation/topup.test.ts`
```typescript
import { describe, it, expect } from 'vitest'
import { topupRequestSchema } from '@/lib/validation/topup'

describe('topupRequestSchema', () => {
  it('정상 입력 통과', () => {
    const r = topupRequestSchema.safeParse({
      amount_krw: 30000, depositor_name: '김철수9A2K',
      transferred_at: '2026-05-30T14:00', note: '',
    })
    expect(r.success).toBe(true)
  })

  it('1000 미만 금액 거부', () => {
    const r = topupRequestSchema.safeParse({
      amount_krw: 500, depositor_name: '김철수', transferred_at: '2026-05-30T14:00',
    })
    expect(r.success).toBe(false)
  })

  it('100만 초과 금액 거부', () => {
    const r = topupRequestSchema.safeParse({
      amount_krw: 2000000, depositor_name: '김철수', transferred_at: '2026-05-30T14:00',
    })
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 2: 실행 (FAIL) → 구현**

Run: `npm test -- tests/unit/validation/topup.test.ts` → FAIL.

Create: `lib/validation/topup.ts`
```typescript
import { z } from 'zod'

export const topupRequestSchema = z.object({
  amount_krw: z.coerce.number().int().min(1000).max(1000000),
  depositor_name: z.string().trim().min(1).max(50),
  transferred_at: z.string().min(1),
  note: z.string().max(200).optional().or(z.literal('')),
})

export type TopupRequestInput = z.infer<typeof topupRequestSchema>
```

Run: `npm test -- tests/unit/validation/topup.test.ts` → 3 passed.

- [ ] **Step 3: 충전 요청 액션 — 실패 테스트**

Create: `tests/unit/actions/topup.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/guards', () => ({ requireUser: vi.fn() }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: { topupRequest: { create: vi.fn(), findMany: vi.fn() } },
}))

import { requireUser } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { createTopupRequest } from '@/lib/actions/topup'

const reqUser = requireUser as unknown as ReturnType<typeof vi.fn>
const create = prisma.topupRequest.create as unknown as ReturnType<typeof vi.fn>

describe('createTopupRequest', () => {
  beforeEach(() => { reqUser.mockReset(); create.mockReset() })

  it('유효 입력이면 PENDING 요청 생성', async () => {
    reqUser.mockResolvedValue({ id: 'u1' })
    create.mockResolvedValue({ id: 'r1' })
    const res = await createTopupRequest({
      amount_krw: 30000, depositor_name: '김철수', transferred_at: '2026-05-30T14:00', note: '',
    })
    expect(res.ok).toBe(true)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ user_id: 'u1', amount_krw: 30000, status: 'PENDING' }),
    }))
  })

  it('잘못된 금액이면 실패 반환', async () => {
    reqUser.mockResolvedValue({ id: 'u1' })
    const res = await createTopupRequest({
      amount_krw: 100, depositor_name: '김철수', transferred_at: '2026-05-30T14:00',
    })
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 4: 실행 (FAIL) → 구현**

Run: `npm test -- tests/unit/actions/topup.test.ts` → FAIL.

Create: `lib/actions/topup.ts`
```typescript
'use server'

import { requireUser } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { topupRequestSchema, type TopupRequestInput } from '@/lib/validation/topup'
import { revalidatePath } from 'next/cache'

export type ActionResult = { ok: true } | { ok: false; message: string }

export async function createTopupRequest(input: TopupRequestInput): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = topupRequestSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: '입력값을 확인해주세요. (금액 1,000~1,000,000원)' }
  }
  const d = parsed.data
  await prisma.topupRequest.create({
    data: {
      user_id: user.id,
      amount_krw: d.amount_krw,
      depositor_name: d.depositor_name,
      transferred_at: new Date(d.transferred_at),
      note: d.note || null,
      status: 'PENDING',
    },
  })
  revalidatePath('/wallet/topup')
  return { ok: true }
}

export async function listMyTopups() {
  const user = await requireUser()
  return prisma.topupRequest.findMany({
    where: { user_id: user.id },
    orderBy: { created_at: 'desc' },
    take: 20,
  })
}
```

Run: `npm test -- tests/unit/actions/topup.test.ts` → 2 passed.

- [ ] **Step 5: TopupForm (Client) + MyTopupList + 페이지**

Create: `components/wallet/TopupForm.tsx`
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTopupRequest } from '@/lib/actions/topup'

export function TopupForm({ topupCode }: { topupCode: string }) {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [name, setName] = useState('')
  const [at, setAt] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setMsg(null)
    const res = await createTopupRequest({
      amount_krw: Number(amount), depositor_name: name, transferred_at: at, note,
    })
    setLoading(false)
    if (res.ok) {
      setMsg({ ok: true, text: '관리자 확인 후 잔액에 반영됩니다.' })
      setAmount(''); setName(''); setAt(''); setNote('')
      router.refresh()
    } else {
      setMsg({ ok: false, text: res.message })
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="number" required placeholder="입금 금액 (₩)" value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)]" />
      <input type="text" required placeholder={`입금자명 (예: 홍길동${topupCode})`} value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)]" />
      <input type="datetime-local" required value={at}
        onChange={(e) => setAt(e.target.value)}
        className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)]" />
      <input type="text" placeholder="메모 (선택)" value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full px-3 py-2 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)]" />
      {msg && <p className={msg.ok ? 'text-[var(--success)] text-sm' : 'text-[var(--danger)] text-sm'}>{msg.text}</p>}
      <button type="submit" disabled={loading}
        className="w-full py-2.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50">
        {loading ? '제출 중…' : '충전 요청 제출'}
      </button>
    </form>
  )
}
```

Create: `components/wallet/MyTopupList.tsx`
```tsx
import { formatKrw } from '@/components/common/MoneyText'

type Topup = {
  id: string; amount_krw: number; status: string
  created_at: Date; reject_reason: string | null
}

const statusLabel: Record<string, string> = {
  PENDING: '대기 중 ⏳', APPROVED: '승인됨 ✅', REJECTED: '거절됨 ❌',
}

export function MyTopupList({ items }: { items: Topup[] }) {
  if (items.length === 0) return <p className="text-[var(--text-dim)] text-sm">충전 요청 내역이 없습니다.</p>
  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t.id} className="flex items-center justify-between text-sm border-b border-[var(--border)] py-2">
          <span className="font-mono text-xs">{new Date(t.created_at).toLocaleString('ko-KR')}</span>
          <span className="font-mono">{formatKrw(t.amount_krw)}</span>
          <span>
            {statusLabel[t.status] ?? t.status}
            {t.status === 'REJECTED' && t.reject_reason && (
              <span className="text-[var(--text-dim)] ml-2">({t.reject_reason})</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
```

Create: `app/(app)/wallet/topup/page.tsx`
```tsx
import Link from 'next/link'
import { getSessionUser } from '@/lib/auth/session'
import { listMyTopups } from '@/lib/actions/topup'
import { TopupForm } from '@/components/wallet/TopupForm'
import { MyTopupList } from '@/components/wallet/MyTopupList'

export default async function TopupPage() {
  const user = await getSessionUser()
  const topups = await listMyTopups()
  return (
    <div className="max-w-lg space-y-6">
      <Link href="/wallet" className="text-sm text-[var(--text-muted)]">← 지갑</Link>
      <h1 className="text-xl font-bold">충전하기</h1>

      <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] p-5 text-sm space-y-1">
        <div className="font-semibold mb-2">1) 아래 계좌로 입금해주세요</div>
        <div>은행: 농협</div>
        <div>계좌: 000-0000-0000-00</div>
        <div>예금주: 홍길동</div>
        <p className="text-[var(--text-dim)] mt-3">
          ⓘ 입금자명 뒤에 식별 코드 <span className="font-mono text-[var(--accent)]">{user!.topup_code}</span> 를
          붙이면 처리가 빨라집니다.
        </p>
      </div>

      <div>
        <div className="font-semibold text-sm mb-3">2) 입금 정보 입력</div>
        <TopupForm topupCode={user!.topup_code} />
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-3">내 충전 요청 내역</h2>
        <MyTopupList items={topups} />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: 빌드 + 테스트 + Commit**

Run: `npm run build && npm test`
Expected: 성공.

```bash
git add -A && git commit -m "feat: 충전 요청(검증/액션/폼/내역) 추가"
```

---

## Task 15: 관리자 충전 승인/거절 + apply_topup SQL + 감사 로그

**Files:**
- Create: `db/sql/functions/apply_topup.sql`(마이그레이션), `lib/audit/record.ts`, `lib/actions/admin-topup.ts`, `app/admin/topups/page.tsx`, `components/admin/TopupQueue.tsx`
- Test: `tests/unit/actions/admin-topup.test.ts`, `tests/sql/apply_topup.test.sql`

- [ ] **Step 1: apply_topup 함수 SQL (트랜잭션 — 설계 §4.2)**

Create: `db/sql/functions/apply_topup.sql`
```sql
-- 충전 요청 승인: 상태 변경 + 잔액 적용을 한 트랜잭션으로.
create or replace function apply_topup(
  p_request_id uuid,
  p_admin_id   uuid
) returns void
language plpgsql as $$
declare
  v_req topup_requests;
  v_wallet_id uuid;
begin
  select * into v_req from topup_requests where id = p_request_id for update;
  if not found then raise exception 'TOPUP_NOT_FOUND'; end if;
  if v_req.status <> 'PENDING' then raise exception 'TOPUP_NOT_PENDING'; end if;

  select id into v_wallet_id from wallets where user_id = v_req.user_id;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  update topup_requests
    set status = 'APPROVED', reviewed_by = p_admin_id, reviewed_at = now()
    where id = p_request_id;

  perform wallet_apply_tx(
    v_wallet_id, 'TOPUP', v_req.amount_krw, 'topup_request', p_request_id, '계좌이체 충전'
  );
end$$;
```

- [ ] **Step 2: 마이그레이션 등록·적용**

Run:
```bash
npx prisma migrate dev --create-only --name apply_topup
```
SQL 교체 후 `npx prisma migrate dev`.

- [ ] **Step 3: pgTAP 테스트 (승인 시 잔액 반영)**

Create: `tests/sql/apply_topup.test.sql`
```sql
begin;
create extension if not exists pgtap;
select plan(3);

insert into users(id, email, topup_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@x.com', 'AAA1'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'admin@x.com', 'ADM1');
update users set role='ADMIN' where id='bbbbbbbb-0000-0000-0000-000000000002';
insert into wallets(id, user_id, balance_krw) values
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 0);
insert into topup_requests(id, user_id, amount_krw, depositor_name, transferred_at, status)
  values ('dddddddd-0000-0000-0000-000000000004',
          'aaaaaaaa-0000-0000-0000-000000000001', 50000, 'A', now(), 'PENDING');

select lives_ok(
  $$ select apply_topup('dddddddd-0000-0000-0000-000000000004','bbbbbbbb-0000-0000-0000-000000000002') $$,
  '승인 성공');
select is((select balance_krw from wallets where id='cccccccc-0000-0000-0000-000000000003'),
  50000, '승인 후 잔액 50000');
select throws_ok(
  $$ select apply_topup('dddddddd-0000-0000-0000-000000000004','bbbbbbbb-0000-0000-0000-000000000002') $$,
  'TOPUP_NOT_PENDING', '이미 승인된 요청 재승인 차단');

select finish();
rollback;
```

Run: `psql "$DIRECT_URL" -f tests/sql/apply_topup.test.sql`
Expected: ok 1..3.

- [ ] **Step 4: 감사 로그 기록 헬퍼**

Create: `lib/audit/record.ts`
```typescript
import { prisma } from '@/lib/db/prisma'

export async function recordAdminAction(params: {
  adminId: string
  action: string
  targetType?: string
  targetId?: string
  before?: unknown
  after?: unknown
  reason?: string
}) {
  await prisma.adminAction.create({
    data: {
      admin_id: params.adminId,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      before_json: params.before === undefined ? undefined : (params.before as object),
      after_json: params.after === undefined ? undefined : (params.after as object),
      reason: params.reason ?? null,
    },
  })
}
```

- [ ] **Step 5: 관리자 충전 액션 — 실패 테스트**

Create: `tests/unit/actions/admin-topup.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/guards', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $executeRawUnsafe: vi.fn(),
    $executeRaw: vi.fn(),
    topupRequest: { findUnique: vi.fn(), update: vi.fn() },
    adminAction: { create: vi.fn() },
  },
}))
vi.mock('@/lib/audit/record', () => ({ recordAdminAction: vi.fn() }))

import { requireAdmin } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { recordAdminAction } from '@/lib/audit/record'
import { approveTopup, rejectTopup } from '@/lib/actions/admin-topup'

const reqAdmin = requireAdmin as unknown as ReturnType<typeof vi.fn>
const execRaw = prisma.$executeRaw as unknown as ReturnType<typeof vi.fn>
const findUnique = prisma.topupRequest.findUnique as unknown as ReturnType<typeof vi.fn>
const update = prisma.topupRequest.update as unknown as ReturnType<typeof vi.fn>
const audit = recordAdminAction as unknown as ReturnType<typeof vi.fn>

describe('admin-topup', () => {
  beforeEach(() => {
    reqAdmin.mockReset(); execRaw.mockReset(); findUnique.mockReset(); update.mockReset(); audit.mockReset()
  })

  it('approveTopup: apply_topup 호출 + 감사 기록', async () => {
    reqAdmin.mockResolvedValue({ id: 'admin1' })
    findUnique.mockResolvedValue({ id: 'r1', amount_krw: 50000, status: 'PENDING', user_id: 'u1' })
    execRaw.mockResolvedValue(1)
    const res = await approveTopup('r1')
    expect(res.ok).toBe(true)
    expect(execRaw).toHaveBeenCalled()
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'approve_topup' }))
  })

  it('rejectTopup: 사유와 함께 거절 + 감사 기록', async () => {
    reqAdmin.mockResolvedValue({ id: 'admin1' })
    findUnique.mockResolvedValue({ id: 'r1', status: 'PENDING', user_id: 'u1' })
    update.mockResolvedValue({})
    const res = await rejectTopup('r1', '입금 확인 안 됨')
    expect(res.ok).toBe(true)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'REJECTED', reject_reason: '입금 확인 안 됨' }),
    }))
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'reject_topup' }))
  })
})
```

- [ ] **Step 6: 실행 (FAIL) → 구현**

Run: `npm test -- tests/unit/actions/admin-topup.test.ts` → FAIL.

Create: `lib/actions/admin-topup.ts`
```typescript
'use server'

import { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/auth/guards'
import { prisma } from '@/lib/db/prisma'
import { recordAdminAction } from '@/lib/audit/record'
import { revalidatePath } from 'next/cache'

export type ActionResult = { ok: true } | { ok: false; message: string }

export async function listPendingTopups() {
  await requireAdmin()
  return prisma.topupRequest.findMany({
    where: { status: 'PENDING' },
    orderBy: { created_at: 'asc' },
    include: { user: { select: { email: true, display_name: true, topup_code: true } } },
  })
}

export async function approveTopup(requestId: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  const req = await prisma.topupRequest.findUnique({ where: { id: requestId } })
  if (!req || req.status !== 'PENDING') {
    return { ok: false, message: '이미 처리되었거나 존재하지 않는 요청입니다.' }
  }
  try {
    await prisma.$executeRaw`SELECT apply_topup(${requestId}::uuid, ${admin.id}::uuid)`
  } catch {
    return { ok: false, message: '승인 처리에 실패했습니다.' }
  }
  await recordAdminAction({
    adminId: admin.id, action: 'approve_topup', targetType: 'topup_request',
    targetId: requestId, after: { amount_krw: req.amount_krw },
  })
  revalidatePath('/admin/topups')
  return { ok: true }
}

export async function rejectTopup(requestId: string, reason: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  const req = await prisma.topupRequest.findUnique({ where: { id: requestId } })
  if (!req || req.status !== 'PENDING') {
    return { ok: false, message: '이미 처리되었거나 존재하지 않는 요청입니다.' }
  }
  await prisma.topupRequest.update({
    where: { id: requestId },
    data: { status: 'REJECTED', reject_reason: reason, reviewed_by: admin.id, reviewed_at: new Date() },
  })
  await recordAdminAction({
    adminId: admin.id, action: 'reject_topup', targetType: 'topup_request',
    targetId: requestId, reason,
  })
  revalidatePath('/admin/topups')
  return { ok: true }
}
```

Run: `npm test -- tests/unit/actions/admin-topup.test.ts` → 2 passed.

- [ ] **Step 7: TopupQueue (Client) + 페이지**

Create: `components/admin/TopupQueue.tsx`
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveTopup, rejectTopup } from '@/lib/actions/admin-topup'
import { formatKrw } from '@/components/common/MoneyText'

type Item = {
  id: string; amount_krw: number; depositor_name: string; transferred_at: Date
  created_at: Date; note: string | null
  user: { email: string; display_name: string | null; topup_code: string }
}

export function TopupQueue({ items }: { items: Item[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function onApprove(id: string) {
    if (!confirm('이 충전 요청을 승인하시겠습니까? 잔액에 즉시 반영됩니다.')) return
    setBusy(id)
    const res = await approveTopup(id)
    setBusy(null)
    if (!res.ok) alert(res.message)
    else router.refresh()
  }

  async function onReject(id: string) {
    const reason = prompt('거절 사유를 입력하세요 (예: 입금 확인 안 됨)')
    if (reason === null) return
    setBusy(id)
    const res = await rejectTopup(id, reason || '사유 없음')
    setBusy(null)
    if (!res.ok) alert(res.message)
    else router.refresh()
  }

  if (items.length === 0) {
    return <p className="text-[var(--text-dim)] text-sm py-8 text-center">대기 중인 충전 요청이 없습니다.</p>
  }

  return (
    <div className="space-y-3">
      {items.map((t) => {
        const codeMatch = t.depositor_name.includes(t.user.topup_code)
        return (
          <div key={t.id} className="rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">
                  {t.user.display_name ?? t.user.email}
                  <span className="text-[var(--text-dim)] text-sm ml-2">{t.user.email}</span>
                </div>
                <div className="text-sm mt-1">
                  요청액 <span className="font-mono">{formatKrw(t.amount_krw)}</span>
                  · 입금자 &quot;{t.depositor_name}&quot;
                  {codeMatch
                    ? <span className="text-[var(--success)] ml-1">식별코드 ✅</span>
                    : <span className="text-[var(--warning)] ml-1">⚠ 식별코드 누락</span>}
                </div>
                <div className="text-xs text-[var(--text-dim)] mt-1">
                  입금 {new Date(t.transferred_at).toLocaleString('ko-KR')}
                  {t.note && ` · 메모: ${t.note}`}
                </div>
              </div>
              <div className="flex gap-2">
                <button disabled={busy === t.id} onClick={() => onReject(t.id)}
                  className="px-3 py-1.5 rounded-md border border-[var(--border)] text-sm hover:bg-[var(--bg-surface-2)] disabled:opacity-50">
                  거절
                </button>
                <button disabled={busy === t.id} onClick={() => onApprove(t.id)}
                  className="px-3 py-1.5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-sm disabled:opacity-50">
                  승인
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

Create: `app/admin/topups/page.tsx`
```tsx
import { listPendingTopups } from '@/lib/actions/admin-topup'
import { TopupQueue } from '@/components/admin/TopupQueue'

export default async function AdminTopupsPage() {
  const items = await listPendingTopups()
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">충전 요청</h1>
      <div>
        <h2 className="text-sm font-semibold mb-3 text-[var(--text-muted)]">대기 중 ({items.length})</h2>
        <TopupQueue items={items} />
      </div>
    </div>
  )
}
```

- [ ] **Step 8: 빌드 + 테스트 + Commit**

Run: `npm run build && npm test`
Expected: 성공.

```bash
git add -A && git commit -m "feat: 관리자 충전 승인/거절 + apply_topup 트랜잭션 + 감사 로그"
```

---

## Task 16: E2E 게이트 — 가입 → 충전 요청 → 승인 → 잔액 반영

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/topup-flow.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Playwright 설치**

Run:
```bash
npm install -D @playwright/test && npx playwright install chromium
```

- [ ] **Step 2: playwright 설정**

Create: `playwright.config.ts`
```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000' },
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
```

Modify: `package.json` `scripts`:
```json
{ "scripts": { "test:e2e": "playwright test" } }
```

- [ ] **Step 3: E2E 시나리오 작성**

> 전제: Supabase에서 이메일 확인(Confirm email) 비활성화(개발용). 관리자 계정은 seed/SQL로 사전 지정된 `ADMIN_E2E_EMAIL`/`ADMIN_E2E_PASSWORD` 사용. 신규 사용자는 타임스탬프 이메일로 가입.

Create: `tests/e2e/topup-flow.spec.ts`
```typescript
import { test, expect } from '@playwright/test'

const adminEmail = process.env.ADMIN_E2E_EMAIL!
const adminPw = process.env.ADMIN_E2E_PASSWORD!

test('가입 → 충전 요청 → 관리자 승인 → 잔액 반영', async ({ browser }) => {
  const stamp = Date.now()
  const userEmail = `e2e_${stamp}@example.com`
  const userPw = 'Test1234!'

  // 1) 신규 사용자 가입
  const userCtx = await browser.newContext()
  const u = await userCtx.newPage()
  await u.goto('/auth/signup')
  await u.getByPlaceholder('이메일').fill(userEmail)
  await u.getByPlaceholder('비밀번호').fill(userPw)
  await u.getByRole('button', { name: '가입하기' }).click()
  await u.waitForURL('**/models')

  // 2) 충전 요청 제출
  await u.goto('/wallet/topup')
  await u.getByPlaceholder('입금 금액 (₩)').fill('30000')
  await u.getByPlaceholder(/입금자명/).fill('E2E테스트')
  await u.locator('input[type="datetime-local"]').fill('2026-05-30T14:00')
  await u.getByRole('button', { name: '충전 요청 제출' }).click()
  await expect(u.getByText('관리자 확인 후 잔액에 반영됩니다.')).toBeVisible()

  // 3) 관리자 로그인 후 승인
  const adminCtx = await browser.newContext()
  const a = await adminCtx.newPage()
  await a.goto('/auth/login')
  await a.getByPlaceholder('이메일').fill(adminEmail)
  await a.getByPlaceholder('비밀번호').fill(adminPw)
  await a.getByRole('button', { name: '로그인' }).click()
  await a.waitForURL('**/models')
  await a.goto('/admin/topups')
  a.on('dialog', (d) => d.accept()) // confirm 자동 수락
  await a.getByText('E2E테스트').waitFor()
  await a.getByRole('button', { name: '승인' }).first().click()

  // 4) 사용자 잔액 반영 확인
  await u.goto('/wallet')
  await expect(u.getByText('₩30,000')).toBeVisible()

  await userCtx.close()
  await adminCtx.close()
})
```

- [ ] **Step 4: 관리자 E2E 계정 준비 (수동, 1회)**

Supabase에 E2E용 관리자 계정 1개 생성 후 `update users set role='ADMIN' where email='<ADMIN_E2E_EMAIL>'`. `.env.local`에 `ADMIN_E2E_EMAIL`/`ADMIN_E2E_PASSWORD` 추가.

- [ ] **Step 5: E2E 실행**

Run:
```bash
npm run test:e2e
```
Expected: 1 passed. (실패 시 셀렉터/이메일 확인 설정 점검)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "test: 충전 플로우 E2E 게이트(가입→요청→승인→반영)"
```

---

## 완료 기준 (Plan 1 Definition of Done)

- [ ] `npm run typecheck` 통과
- [ ] `npm run lint` 통과
- [ ] `npm test` 전체 통과 (단위 + pgTAP)
- [ ] `npm run test:e2e` 충전 플로우 통과
- [ ] 본인 계정 ADMIN 지정 완료, `/admin/topups`에서 실제 승인 1회 검증
- [ ] 7개 모델 seed 완료 (`/models`는 Plan 2에서 렌더 — 현재는 데이터만)

이 Plan 완료 시 "가입 → 충전 요청 → 관리자 승인 → 잔액 반영"이 실제로 도는, 독립 검증 가능한 SW가 산출된다. 다음은 **Plan 2 (P2 첫 종단 생성: 모델 어댑터 + 생성 스튜디오 + 차감 + 라이브러리)**.

---

## Self-Review 결과

- **Spec 커버리지**: 인증(§3), 지갑/충전/승인(§4), 가격 엔진(§7b), 환율(§7b), RLS·가드(§3,§10), 트리거(§3) 모두 태스크로 매핑됨. 생성·영상·스토리지·관리자 나머지는 명시적으로 Plan 2~4로 분리.
- **Placeholder 스캔**: 모든 코드 스텝에 실제 코드 포함. "적절히 처리" 류 표현 없음.
- **타입 일관성**: `ActionResult`(auth/topup/admin-topup 공통 형태), `ModelMeta`/`PricingJson`(pricing↔types), `getCurrentFxRate(): number`, `wallet_apply_tx` 시그니처(SQL↔호출) 일치 확인.
- **알려진 수동 의존**: Supabase 프로젝트 생성, 이메일 확인 비활성(개발), ADMIN 지정, E2E 계정 — 각 Task에 명시.
