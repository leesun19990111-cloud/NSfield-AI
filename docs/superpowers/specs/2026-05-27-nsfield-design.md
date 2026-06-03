# NS Field — 설계 문서

- **작성일**: 2026-05-27
- **상태**: 설계 확정 (구현 계획 수립 직전)
- **레벨**: bkit Dynamic (Next.js + Supabase + Prisma)

---

## 0. 제품 한 줄 요약

**NS Field**는 구독제 이미지·영상 AI에 지친 지인 그룹을 위한 **사용한 만큼만 충전·차감하는 통합 생성 웹앱**이다.
NS = **Not Script** — 정기 결제 없음, 자동 청구 없음, 사용자가 직접 충전한 잔액만 사용된다.

지원 모델(MVP):
- **이미지 (text-to-image)**: GPT-Image-2.0, Seedream 4.5, Nanobanana-2.0, Nanobanana Pro
- **영상**: Seedance 2.0, Kling, Veo3

---

## 1. 시스템 개요

```
[Browser]
    │   HTTPS
    ▼
┌───────────────────────────────┐
│  Next.js 15 (Vercel)          │
│  - Server Actions              │  ──►  외부 AI API
│  - Route Handlers              │      (OpenAI / ByteDance /
│  - /admin (관리자)              │       Google / Kuaishou)
│  - /api/cron/poll-generations  │
│  - /api/cron/fx-update         │
│  - /api/cron/cleanup-expired   │
└───────────────┬───────────────┘
                │
                ▼
        ┌───────────────┐
        │   Supabase    │
        │  - Auth       │
        │  - Postgres   │   ◄──►  Browser (Realtime 작업 상태 푸시)
        │  - Storage    │
        │  - Realtime   │
        └───────────────┘
                ▲
                │ 1분마다
[Vercel Cron] ──┘  pending 영상 job 폴링
```

### 핵심 설계 원리

1. **이미지는 동기 호출, 영상은 비동기 큐**. 영상은 외부 API에 작업 등록만 하고 즉시 응답 → Vercel Cron(1분 주기)이 진행 중 작업을 폴링 → 완료 시 결과 다운로드 + DB 갱신 + Realtime 푸시.
2. **금전 관련 모든 변동은 Postgres 트랜잭션 + Wallet ledger(거래 원장) 패턴**. 잔액 직접 수정 절대 금지, 항상 `wallet_apply_tx()` SQL 함수만 사용. 잔액 = Σ(거래) 불변식 강제.
3. **표기 USD, 차감 KRW, 차감 시점 실시간 환율 적용**. 환율은 시간당 갱신, 차감 시점 스냅샷을 Generation에 저장.
4. **모델은 어댑터 패턴으로 격리**. 신규 모델은 어댑터 파일 1개 + DB `Model` 행 1개 추가만으로 도입.

---

## 2. 데이터 모델 (Prisma)

```prisma
// ───── 사용자 / 인증 ─────
model User {
  id            String   @id @default(uuid())   // = auth.users.id
  email         String   @unique
  display_name  String?
  role          Role     @default(USER)
  topup_code    String   @unique                 // '9A2K' 등 4자리 영숫자
  created_at    DateTime @default(now())

  wallet         Wallet?
  generations    Generation[]
  topup_requests TopupRequest[]
}

// ───── 지갑 ─────
model Wallet {
  id           String   @id @default(uuid())
  user_id      String   @unique
  balance_krw  Int      @default(0)              // 원 단위 정수
  updated_at   DateTime @updatedAt

  user         User @relation(fields: [user_id], references: [id])
  transactions WalletTransaction[]
}

model WalletTransaction {
  id            String   @id @default(uuid())
  wallet_id     String
  type          TxType                            // TOPUP|CHARGE|REFUND|ADJUSTMENT
  amount_krw    Int                               // 충전 +, 차감 -
  balance_after Int                               // 거래 후 잔액 스냅샷
  ref_type      String?                           // 'topup_request' | 'generation'
  ref_id        String?
  memo          String?
  created_at    DateTime @default(now())

  @@index([wallet_id, created_at(sort: Desc)])
}

// ───── 충전 요청 ─────
model TopupRequest {
  id              String   @id @default(uuid())
  user_id         String
  amount_krw      Int
  depositor_name  String                          // 계좌이체 표기명
  transferred_at  DateTime                        // 사용자 입력 입금 일시
  note            String?
  status          TopupStatus @default(PENDING)   // PENDING|APPROVED|REJECTED
  reviewed_by     String?                         // 관리자 user_id
  reviewed_at     DateTime?
  reject_reason   String?
  created_at      DateTime @default(now())

  @@index([status, created_at])
}

// ───── 모델 카탈로그 ─────
model Model {
  id            String   @id                      // 'gpt-image-2.0', 'veo3', ...
  kind          ModelKind                         // IMAGE | VIDEO
  display_name  String
  provider      String                            // 'openai'|'bytedance'|'google'|'kuaishou'
  is_active     Boolean  @default(true)
  margin_pct    Decimal  @default(10)             // 마진율(%)
  pricing_json  Json                              // 가격 규칙 (아래 참고)
}

// ───── 생성 작업 ─────
model Generation {
  id              String   @id @default(uuid())
  user_id         String
  model_id        String
  kind            ModelKind
  prompt          String
  input_image_url String?                         // 참조 이미지 (Storage)
  params_json     Json                            // 해상도·길이·시드 등

  status          GenStatus @default(PENDING)     // PENDING|RUNNING|SUCCEEDED|FAILED|CANCELED
  external_job_id String?                         // 영상 폴링용
  last_polled_at  DateTime?

  result_urls       String[]
  result_meta_json  Json?

  // 비용 (USD 우선, KRW는 차감 결과)
  cost_usd_raw    Decimal?                        // 외부 API 실제 원가
  cost_usd_billed Decimal?                        // 마진 포함 USD (사용자 표기 금액)
  margin_pct      Decimal?                        // 스냅샷
  fx_rate         Decimal?                        // 차감 순간 환율
  charged_krw     Int?                            // KRW 정수 차감액

  created_at    DateTime  @default(now())
  started_at    DateTime?
  finished_at   DateTime?
  expires_at    DateTime?                         // = finished_at + 30일
  failed_reason String?

  @@index([user_id, created_at(sort: Desc)])
  @@index([status, kind, last_polled_at])         // Cron 폴링 쿼리용
  @@index([expires_at])                           // Cleanup cron용
}

// ───── 환율 캐시 ─────
model FxRate {
  id         String   @id @default(uuid())
  pair       String                                // 'USDKRW'
  rate       Decimal                               // 1 USD = N KRW
  source     String                                // 'exchangerate.host' 등
  fetched_at DateTime @default(now())

  @@index([pair, fetched_at(sort: Desc)])
}

// ───── 관리자 감사 로그 ─────
model AdminAction {
  id          String   @id @default(uuid())
  admin_id    String
  action      String                                // 'approve_topup' | 'reject_topup' |
                                                    // 'adjust_balance' | 'update_model' |
                                                    // 'force_refund' | 'toggle_model' ...
  target_type String?
  target_id   String?
  before_json Json?
  after_json  Json?
  reason      String?
  created_at  DateTime @default(now())

  @@index([admin_id, created_at(sort: Desc)])
}

enum Role         { USER ADMIN }
enum ModelKind    { IMAGE VIDEO }
enum TxType       { TOPUP CHARGE REFUND ADJUSTMENT }
enum TopupStatus  { PENDING APPROVED REJECTED }
enum GenStatus    { PENDING RUNNING SUCCEEDED FAILED CANCELED }
```

### 핵심 스키마 결정

- **잔액 단위 = KRW 정수**. USD 원가는 `Decimal`로 보존 후 차감 시점에 KRW 정수로 반올림. 사용자에게 보이는 한국 잔액은 모두 원 단위.
- **모델 정보는 DB 관리**. 코드 하드코딩 금지. 마진율/활성 여부/단가 모두 DB. 배포 없이 변경 가능.
- **`Generation` 한 테이블로 이미지·영상 통합**. `kind`로 구분. 보관 정책·결제 원장 연결 동일.
- **`charged_krw`, `fx_rate`, `margin_pct`는 차감 시점 스냅샷**. 사후에 마진율을 바꿔도 과거 거래 안 흔들림.

---

## 3. 인증 + 권한

### 인증 스택

- Supabase Auth + `@supabase/ssr`
- 로그인: Google OAuth (주력) + 이메일/패스워드 (보조)
- 세션: HTTP-only 쿠키, Server Component에서 검증
- 첫 가입 시 Postgres trigger로 `auth.users` insert → 같은 트랜잭션에 `User` + `Wallet(balance=0)` + `topup_code` 자동 생성

### 권한 매트릭스

| 화면 / 액션 | 비로그인 | USER | ADMIN |
|---|:---:|:---:|:---:|
| `/`, `/models` (카탈로그 둘러보기) | ✅ | ✅ | ✅ |
| `/auth/login`, `/auth/signup` | ✅ | – | – |
| `/wallet` (잔액·거래내역·충전 요청) | ❌ | ✅ | ✅ |
| `/generate/:modelId` (생성) | ❌ | ✅ | ✅ |
| `/library` (내 생성 결과 30일) | ❌ | ✅ | ✅ |
| `/admin/*` | ❌ | ❌ | ✅ |

### 이중 권한 방어

1. **Server Action / Route Handler 단**: `requireUser()` / `requireAdmin()` 헬퍼.
2. **Postgres RLS**: 최종 방어선.
   - `wallet`, `wallet_transaction`, `generation`, `topup_request`: `auth.uid() = user_id`만 SELECT/INSERT/UPDATE.
   - `model`, `fx_rate`: 모두 SELECT, INSERT/UPDATE는 ADMIN만.
   - ADMIN 식별: JWT 클레임 `role=admin`.

---

## 4. 지갑 + 충전 흐름

### 4.1 사용자 충전 플로우

```
1. /wallet  →  [충전하기] 클릭
2. /wallet/topup 페이지 표시:
     - 계좌이체 안내: 은행 / 계좌 / 예금주
     - 입금자 식별 코드 (예: "9A2K") 안내
       "입금하실 때 이름 뒤에 '9A2K'를 붙여주세요. 예: 김철수9A2K"
       (강제하지 않음 — 안 붙이면 입금자명만으로 매칭)
3. 폼 제출:
   - 입금 금액 (₩)
   - 입금자명 (계좌 표기명 그대로)
   - 입금 일시
   - 메모 (선택)
4. TopupRequest 생성 (status=PENDING)
5. 관리자 콘솔 알림 (인앱 + 옵션 이메일)
```

### 4.2 관리자 승인 플로우

`/admin/topups` — PENDING 요청 목록. 각 항목에 [승인] / [거절] 버튼.

**승인** → 단일 트랜잭션:
1. `TopupRequest.status = APPROVED, reviewed_by, reviewed_at`
2. `wallet_apply_tx(wallet_id, 'TOPUP', +amount_krw, 'topup_request', request_id, ...)`
3. `AdminAction` 기록

**거절** → 거절 사유 입력 → `status=REJECTED, reject_reason`. 잔액 변동 없음.

### 4.3 잔액 변동의 단일 진입점 — `wallet_apply_tx()`

```sql
create function wallet_apply_tx(
  p_wallet_id   uuid,
  p_type        tx_type,
  p_amount_krw  int,
  p_ref_type    text,
  p_ref_id      uuid,
  p_memo        text
) returns wallet_transaction
language plpgsql as $$
declare
  v_new_balance int;
begin
  -- 1) 행 잠금
  perform 1 from wallet where id = p_wallet_id for update;

  -- 2) 차감 후 잔액 계산
  select balance_krw + p_amount_krw into v_new_balance
    from wallet where id = p_wallet_id;

  -- 3) 음수 금지 (ADJUSTMENT만 예외)
  if v_new_balance < 0 and p_type <> 'ADJUSTMENT' then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  -- 4) ledger insert + 잔액 update
  insert into wallet_transaction(...) values (...);
  update wallet set balance_krw = v_new_balance, updated_at = now()
    where id = p_wallet_id;

  return ...;
end$$;
```

**불변식**: 잔액 = Σ(거래). 코드 어느 곳에서 호출해도 깨질 수 없음.

### 4.4 관리자 직접 조정 (`ADJUSTMENT`)

`/admin/users/:id` → 잔액 +/- 입력 + 사유 → `wallet_apply_tx(type='ADJUSTMENT', ...)`. 환불 자동화로 잡히지 않는 예외 케이스 처리. 음수 잔액 허용 (의도된 경우만).

---

## 5. 모델 어댑터 인터페이스

7개 모델의 API 차이를 흡수하는 통합 인터페이스.

```typescript
// lib/models/types.ts
export interface ModelAdapter {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  mode: 'sync' | 'async';

  estimate(params: GenerationParams): { cost_usd_raw: number };

  start(params: GenerationParams): Promise<StartResult>;

  poll?(externalJobId: string): Promise<PollResult>;
}

type StartResult =
  | { mode: 'sync';  result_urls: string[]; cost_usd_raw: number; meta?: any }
  | { mode: 'async'; external_job_id: string };

type PollResult =
  | { status: 'running' }
  | { status: 'succeeded'; result_urls: string[]; cost_usd_raw: number; meta?: any }
  | { status: 'failed';    reason: string };
```

### 폴더 구조

```
lib/models/
  ├─ types.ts
  ├─ registry.ts            // id → adapter 매핑
  ├─ pricing.ts             // 견적/마진/환율 계산 (외부 API 모름)
  ├─ image/
  │   ├─ gpt-image.ts       // OpenAI Images
  │   ├─ seedream.ts        // ByteDance Seedream
  │   └─ nanobanana.ts      // 2.0 / Pro 옵션 분기
  └─ video/
      ├─ seedance.ts        // ByteDance Seedance 2.0
      ├─ kling.ts           // Kuaishou Kling
      └─ veo3.ts            // Google Veo3
```

### 책임 분담

- **`pricing.ts`**: DB의 `pricing_json` 보고 USD 견적. 외부 API 포맷 모름.
- **어댑터**: 외부 API 호출 + 응답 파싱 + `cost_usd_raw` 추출. 환율·마진·KRW 모름.

---

## 6. 이미지 생성 흐름 (동기)

```
사용자                  Server Action                  외부 API
  │                         │                              │
  │  ① 견적 요청              │                              │
  ├────────────────────────►│ adapter.estimate()           │
  │                         │ + 현재 fx_rate 조회           │
  │ ② 견적 응답               │                              │
  │  "$0.04 ≈ ₩55"          │                              │
  │◄────────────────────────│                              │
  │                         │                              │
  │ ③ 생성 확정               │                              │
  ├────────────────────────►│ Tx:                          │
  │                         │  ・Generation 생성 (PENDING)  │
  │                         │  ・wallet_apply_tx(CHARGE,    │
  │                         │     견적 금액)                │
  │                         │  ・잔액 부족 → 400 반환        │
  │                         │  ・status=RUNNING             │
  │                         │                              │
  │                         │ adapter.start() ────────────►│
  │                         │◄──── 결과 URL + cost_usd_raw │
  │                         │                              │
  │                         │ ・결과 다운로드                │
  │                         │ ・Supabase Storage 업로드     │
  │                         │ ・Generation 갱신             │
  │                         │   (SUCCEEDED, result_urls,   │
  │                         │    cost_usd_raw/billed,      │
  │                         │    expires_at = now+30d)     │
  │                         │ ・정산                         │
  │                         │   - 실제 > 견적: 차액 CHARGE  │
  │                         │     (잔액 부족이면 흡수)        │
  │                         │   - 실제 ≤ 견적: 그대로        │
  │ ④ 결과 표시                │                              │
  │◄────────────────────────│                              │
```

Vercel 함수 timeout: `maxDuration = 60`. **MVP의 이미지 4개(GPT-Image-2.0, Seedream 4.5, Nanobanana-2.0, Nanobanana Pro)는 모두 동기 호출(`mode='sync'`)** 로 분류한다. 60초 초과 가능성이 확인되면 그 모델만 어댑터에서 `mode='async'`로 재등록 + Cron 폴링 조건을 `kind='VIDEO' OR mode='async'`로 확장. 이 시점에는 영상 흐름과 같은 경로를 그대로 재사용.

---

## 7. 영상 생성 흐름 (비동기 + Cron 폴링)

### 시작 단계 (사용자 요청)

```
사용자 ── ① 생성 요청 ──► Server Action
                          ├─ adapter.estimate() + fx_rate
                          ├─ Tx:
                          │   ・Generation 생성 (PENDING)
                          │   ・wallet_apply_tx(CHARGE, 견적)
                          │   ・잔액 부족 → 400
                          ├─ adapter.start() → external_job_id
                          ├─ Generation {status=RUNNING, external_job_id}
                          └─ ② 응답: "작업 등록 완료, /library/:id"

사용자 ── ③ /library/:id 진입 → Supabase Realtime으로 row 구독
```

### 폴링 단계 (Vercel Cron, 1분 주기)

```
/api/cron/poll-generations
  ├─ SELECT * FROM generation
  │   WHERE status='RUNNING'
  │     AND kind='VIDEO'
  │     AND (last_polled_at IS NULL
  │          OR now() - last_polled_at > polling_interval)
  │   LIMIT 50
  │
  ├─ For each:
  │   ├─ adapter.poll(external_job_id)
  │   │
  │   ├─ running:
  │   │    UPDATE last_polled_at=now()
  │   │
  │   ├─ succeeded:
  │   │    ・결과 다운로드 → Storage 업로드
  │   │    ・Generation 갱신 (SUCCEEDED, 결과, 비용, expires_at)
  │   │    ・정산 (실제 vs 견적): 차액 CHARGE 또는 흡수
  │   │    → Realtime 자동 푸시
  │   │
  │   └─ failed:
  │        ・Generation status=FAILED, failed_reason
  │        ・wallet_apply_tx(REFUND, +charged_krw) — 전액 환불
  │        → Realtime 자동 푸시
  │
  └─ 30분 타임아웃 처리:
      WHERE status='RUNNING' AND now() - started_at > '30 min'
      → 자동 FAILED + REFUND
```

### 폴링 설계 결정

- **`last_polled_at` + 모델별 폴링 간격**: 모든 RUNNING을 매분 폴링하면 외부 rate limit 위험. `Model.pricing_json.polling_interval_sec` 기반.
- **Idempotent**: 같은 작업에 `poll()`을 두 번 호출해도 잔액·환불 1회만. 상태 전이 `RUNNING → SUCCEEDED|FAILED` 단방향, UPDATE는 WHERE status='RUNNING' 조건.
- **30분 타임아웃**: 외부 API 무응답 시 자동 FAILED + 전액 환불.
- **클라이언트는 Realtime 구독만**. 클라이언트에 폴링 코드 없음.

### 환불 정책

| 상황 | 처리 |
|---|---|
| 외부 호출 전 잔액 부족 | 차감 없이 400 |
| 외부 API 호출 실패 (네트워크) | 즉시 REFUND |
| 영상 RUNNING → FAILED | 자동 REFUND |
| 영상 RUNNING → 30분 타임아웃 | FAILED + 자동 REFUND |
| 결과 다운로드 실패 | REFUND + 관리자 알림 (외부 과금 발생 가능성) |
| SUCCEEDED 후 사용자 불만 | 관리자 수동 ADJUSTMENT |

---

## 7b. 가격 엔진

### 표기 vs 차감

```
표기:    "Veo3 — 5초 영상  $0.50"   ← API 원가 × (1 + margin)/100, USD 유지
잔액 표시:  "₩30,000  (≈ $21.74 @ 1USD=1,380₩)"
견적 미리보기: "예상 차감: $0.50  ≈ ₩690 (현재 환율 1USD=1,380₩)"
차감 결과:    "₩690 차감됨  (= $0.50 @ 1,380₩, 마진 10% 포함)"
```

### `pricing_json` 스키마 (가격 패턴)

**이미지 — 장당 단가**
```json
{
  "kind": "per_image",
  "usd_per_unit": 0.04,
  "options": { "max_resolution": "1024x1024" }
}
```

**영상 — 초당 단가**
```json
{
  "kind": "per_second",
  "usd_per_unit": 0.10,
  "options": {
    "allowed_durations_sec": [5, 10],
    "polling_interval_sec": 60
  }
}
```

**영상 — 길이별 고정가**
```json
{
  "kind": "per_video_fixed",
  "tiers": { "5": 0.50, "10": 0.90, "30": 2.40, "60": 4.50 },
  "options": {
    "allowed_durations_sec": [5, 10, 30, 60],
    "polling_interval_sec": 60
  }
}
```

### 견적 함수

```typescript
function estimateRawUsd(model: Model, params: GenerationParams): number {
  const p = model.pricing_json;

  if (model.kind === 'VIDEO'
      && !p.options.allowed_durations_sec.includes(params.duration_sec)) {
    throw new Error('UNSUPPORTED_DURATION');
  }

  switch (p.kind) {
    case 'per_image':       return p.usd_per_unit * (params.count ?? 1);
    case 'per_second':      return p.usd_per_unit * params.duration_sec;
    case 'per_video_fixed': return p.tiers[String(params.duration_sec)];
    case 'per_token':       return p.usd_per_unit * estimateTokens(params);
  }
}

function estimateBilledUsd(model: Model, params: GenerationParams): number {
  const raw = estimateRawUsd(model, params);
  return roundCeil(raw * (1 + Number(model.margin_pct) / 100), 4);
}

function toKrw(billedUsd: number, fxRate: number): number {
  return Math.round(billedUsd * fxRate);
}
```

### 환율 운영

- **갱신**: 시간당 (Vercel Cron `/api/cron/fx-update`, 외부 환율 API 호출 → `FxRate` insert)
- **사용**: 차감 시점 가장 최근 행. 1시간 이내가 없으면 외부 즉시 호출 폴백.
- **출처(MVP)**: `https://api.exchangerate.host` (무료, 시간당 갱신 지원)

---

## 7c. 영상 길이 정책

### 사용자 선택 옵션
**3 · 5 · 10 · 15 · 30 · 60초** (총 6개)

### 모델별 지원

- UI: 6개 옵션을 항상 노출, **지원 안 하는 길이는 disabled + 툴팁**
- 서버: Server Action 진입부에서 `allowed_durations_sec` 화이트리스트 검증
- 어댑터: 외부 API 파라미터 변환은 어댑터가 담당 (Veo3는 `duration` 정수, Kling은 `mode`+`duration` 등)

### 모델 카탈로그 표기 예시

```
Veo3        영상 모델
─────────────────────────────────
• 3초   $0.30   (≈ ₩410)
• 5초   $0.50   (≈ ₩690)
• 10초  $1.00   (≈ ₩1,380)
• 15초  [지원 안 함]
• 30초  [지원 안 함]
• 1분   [지원 안 함]
─────────────────────────────────
현재 환율 1USD = 1,380₩ · 마진 10% 포함
```

---

## 8. 스토리지 + 30일 자동 삭제

### 버킷 구조

```
generations/                     [private, 인증 사용자만]
  {user_id}/
    {generation_id}/
      input.jpg
      output_0.png
      output_0.mp4
      thumb_0.jpg

avatars/                         [public, 옵션]
```

### 접근 제어

- 버킷 private.
- 다운로드는 **Signed URL** (TTL 5분).
- Storage RLS: 객체 metadata의 `user_id`가 `auth.uid()`와 같은 행만 SELECT.

### 30일 자동 삭제

**1단계: DB cron `/api/cron/cleanup-expired` (매일 04:00 KST)**
```
SELECT id, result_urls, input_image_url, user_id
  FROM generation
 WHERE expires_at < now()
   AND result_urls IS NOT NULL
 LIMIT 500;

For each:
  ・Storage DELETE (input + outputs)
  ・Generation { result_urls=NULL, input_image_url=NULL }
  ・메타데이터·비용·프롬프트는 보존 (정산 추적용)
```

**2단계: Storage TTL 폴리시 (안전망)**
객체 metadata `expires_at` 태깅 → 만료 객체 강제 삭제. DB cron 실패해도 결국 지워짐.

### 잔존 데이터 vs 삭제 데이터

| 항목 | 30일 후 |
|---|---|
| 결과·입력 이미지 파일 | **삭제** |
| `Generation`의 prompt/params/비용 필드 | **보존** |
| `WalletTransaction` 모든 거래 | **영구 보존** |
| User, Model, FxRate | **영구 보존** |

라이브러리 화면에서는 만료된 행도 "프롬프트만 남음" 형태로 계속 보임.

---

## 9. 관리자 페이지

`/admin/*` — ADMIN 역할만. middleware + RLS 이중 방어.

```
/admin
├─ /dashboard          오늘/이번달 매출, 신규 가입, 대기 충전 N건, 진행 영상 N건
├─ /topups             충전 요청 승인/거절 (PENDING 우선)
├─ /users              사용자 목록·검색·잔액 조회/조정
│   └─ /:id            상세: 잔액·거래원장·생성 이력
├─ /models             모델 카탈로그: margin_pct / pricing_json / is_active
│   └─ /:id            상세 편집 + 가격 시뮬레이터
├─ /generations        전체 작업 모니터 (status/kind/model/user/기간 필터)
│   └─ /:id            상세: 외부 응답 로그, 비용, 결과, 강제 환불 버튼
├─ /fx-rates           환율 이력 + 수동 갱신
└─ /audit              관리자 액션 감사 로그
```

### 알림

- **인앱**: `/admin/dashboard` 상단 배지 (대기 충전, 30분 초과 RUNNING)
- **이메일 (옵션)**: 신규 충전 요청 시 Resend로 본인에게 1통. `ADMIN_EMAIL_NOTIFY=true`로 켬.
- **Slack/Discord webhook**: Phase 2.

---

## 10. 에러 + 보안

### 10.1 API 키 관리

- 모든 외부 모델 API 키는 **서버 환경변수**. 클라이언트 노출 절대 금지.
- `NEXT_PUBLIC_*` 접두사 안 씀.
- 어댑터는 Server Action / Route Handler에서만 호출.

### 10.2 Rate Limiting (사용자당, Postgres 토큰 버킷)

| 액션 | 한도 |
|---|---|
| 이미지 생성 시작 | 10/min, 100/hour |
| 영상 생성 시작 | 3/min, 20/hour |
| 충전 요청 제출 | 5/hour |
| 환율 조회 (캐시 우회) | 60/hour |

초과 시 429 + `Retry-After`. ADMIN 면제.

### 10.3 외부 API 호출 안전망

- HTTP timeout 30초 (어댑터 단위)
- **재시도 0회** (이미지·영상 시작 단계). 중복 호출은 이중 과금 위험 → 실패 처리 + 환불.
- 폴링은 재시도 OK (idempotent — 같은 `external_job_id` 상태 조회만)

### 10.4 콘텐츠 안전

- 자체 필터 안 함. 외부 API의 안전 정책에 의존.
- 외부 API가 차단 응답 → `status=FAILED, failed_reason='content_blocked: ...'` → 전액 환불.
- 운영자 보호용 **차단 키워드 사전 차단 리스트**는 환경변수. MVP 빈 리스트, 운영 중 추가.

### 10.5 입력 검증

| 입력 | 제약 |
|---|---|
| `prompt` | 1~2000자 trim |
| 참조 이미지 | jpg/png/webp, ≤10MB, ≤4096×4096 |
| `duration_sec` | `{3,5,10,15,30,60}` 화이트리스트 + 모델별 지원 검증 |
| 충전 금액 | 1,000 ≤ x ≤ 1,000,000 KRW |

### 10.6 보안 헤더 + CSP

`next.config.js` headers:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy`: self + Supabase + Vercel + 결과 이미지 도메인. inline script 금지.

### 10.7 시크릿 운영

- `.env.local` (로컬), Vercel Env Vars (배포). git 추적 금지.
- Supabase `service_role` 키는 Server Action에서만. 클라이언트는 `anon` 키만. 절대 혼동 금지.
- `DATABASE_URL` 서버 전용.

### 10.8 백업

- Supabase Free: 7일 PITR 자동 백업 포함.
- 추가: 매주 일요일 03:00 KST에 `Wallet`/`WalletTransaction`/`TopupRequest`/`Generation`(메타) JSON dump → `backups/` 버킷 90일 보관.

---

## 11. 테스트 전략

### 11.1 레이어별

| 레이어 | 도구 | 대상 |
|---|---|---|
| Postgres 함수 | pgTAP | `wallet_apply_tx()` — 동시 차감, 음수 차단, ADJUSTMENT 예외, 잠금 |
| Unit (TS) | Vitest | 가격 엔진, 어댑터 (외부 API mock fixture) |
| Integration | Vitest + 테스트 DB | Server Action 전체 — 충전 승인, 이미지 동기, 영상 비동기 transition, 환불 |
| E2E | Playwright | 가입 → 충전 요청 → (DB seed 승인) → 이미지 생성 → 라이브러리 |

### 11.2 외부 API

- **Mock 우선**: 어댑터 단위 fixture로 mock. CI 매번 외부 호출 안 함.
- **Smoke** (별도 nightly workflow):
  - 이미지: 매일 1회 가장 싼 이미지 1장 실호출
  - 영상: 주 1회 (비용 때문)

### 11.3 불변식 (Property tests)

`@fast-check/vitest`:
- 잔액 = Σ(거래) (임의 순서 N건 후 검증)
- 음수 잔액 안 됨 (어떤 차감 시퀀스에도, ADJUSTMENT 제외)
- 폴링 idempotent (5번 연속 호출해도 잔액·환불 1회만)

### 11.4 CI

GitHub Actions:
1. lint (eslint + prettier check)
2. typecheck (`tsc --noEmit`)
3. unit + integration (Vitest, Postgres 16 docker-compose)
4. e2e (Playwright on Vercel Preview)
5. Smoke — 별도 nightly

PR 머지 게이트: 1~4 필수.

### 11.5 배포 전 수동 QA (bkit `/zero-script-qa`)

- 가입 → 충전 요청 → 승인 → 잔액 반영
- 이미지 4종 각 1회 생성 + 비용 확인
- 영상 3종 각 1회 생성 + Realtime 푸시
- 환율 갱신 후 환산값 변경
- 30일 만료 시뮬레이션 (수동 `expires_at` 과거 → cron 트리거)
- 외부 API 강제 실패 → 자동 환불

---

## 12. MVP 제외 범위 (Phase 2+)

| 항목 | 분류 | 이유 |
|---|---|---|
| 결제 게이트웨이 (Toss/Kakao Pay) | Phase 2 | 수동 승인으로 가설 검증 우선 |
| 자동 결제 / 정기구독 | **절대 안 함** | NS = Not Script. 제품 철학 충돌 |
| 다국어 (i18n) | Phase 2 | 한국어 단일 |
| 모바일 앱 | Phase 3+ | 반응형 웹 우선 |
| 영상 편집 (트림/크롭/자막) | Phase 2 | 외부 결과 그대로 제공 |
| 프롬프트 라이브러리·템플릿 | Phase 2 | 자유 입력만 |
| 사용자 간 공유·갤러리·소셜 | Phase 2 | 본인이 결과물 외부 공유 |
| Slack/Discord/이메일 봇 | Phase 2 | 관리자 인앱 알림만 |
| 사용자 통계 대시보드 | Phase 2 | 잔액·이력만 |
| 모델 비교/A/B 테스트 UI | Phase 2 | 한 번에 한 모델 |
| API 공개 (외부 개발자용) | **안 함** | 비공개 운영 |
| 마진율 사용자별 차등 | MVP 안 함 | 균일 마진 |
| 음수 잔액 (외상) | **안 함** | 운영 부담 |
| 환불 자동 계좌 입금 | Phase 3+ | 잔액 적립만 |

### Phase 2 트리거

- 동시 활성 사용자 20명 초과 → 결제 게이트웨이 도입 검토
- 영상 폴링 1분이 답답해짐 → Approach B (별도 워커)
- 콘텐츠 분쟁 발생 → 사전 차단 키워드 강화
- 결과 공유 요청 빈발 → 공유 링크

---

## 13. 환경변수 목록 (배포 전 확정)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # 서버 전용
DATABASE_URL=                    # Prisma direct connection
DIRECT_URL=                      # Prisma migrate

# 외부 AI API
OPENAI_API_KEY=
BYTEDANCE_API_KEY=               # Seedance + Seedream
KLING_API_KEY=
GOOGLE_API_KEY=                  # Veo3
NANOBANANA_API_KEY=              # 가상 키명 (실제 provider 결정 후 갱신)

# 환율
EXCHANGE_RATE_API_URL=https://api.exchangerate.host

# 운영
ADMIN_EMAIL=
ADMIN_EMAIL_NOTIFY=false
RESEND_API_KEY=
CONTENT_BLOCK_KEYWORDS=          # 콤마 구분
CRON_SECRET=                     # Vercel Cron 보호용

# 기타
NEXT_PUBLIC_SITE_URL=
```

---

## 14. 폴더 구조 초안

```
NSfield/
├─ app/                                  # Next.js App Router
│   ├─ (public)/
│   │   ├─ page.tsx                       # 랜딩
│   │   ├─ models/page.tsx                # 카탈로그
│   │   └─ models/[id]/page.tsx
│   ├─ (auth)/
│   │   ├─ login/page.tsx
│   │   └─ signup/page.tsx
│   ├─ wallet/
│   │   ├─ page.tsx
│   │   └─ topup/page.tsx
│   ├─ generate/[modelId]/page.tsx
│   ├─ library/
│   │   ├─ page.tsx
│   │   └─ [genId]/page.tsx
│   ├─ admin/
│   │   ├─ dashboard/page.tsx
│   │   ├─ topups/page.tsx
│   │   ├─ users/...
│   │   ├─ models/...
│   │   ├─ generations/...
│   │   ├─ fx-rates/page.tsx
│   │   └─ audit/page.tsx
│   └─ api/
│       └─ cron/
│           ├─ poll-generations/route.ts
│           ├─ fx-update/route.ts
│           └─ cleanup-expired/route.ts
├─ lib/
│   ├─ supabase/                          # SSR/server/client 헬퍼
│   ├─ auth/                              # requireUser / requireAdmin
│   ├─ wallet/                            # wallet_apply_tx 래퍼
│   ├─ models/                            # 어댑터 (위 섹션 5 참조)
│   ├─ fx/                                # 환율 조회/캐시
│   ├─ storage/                           # Signed URL, 업로드 헬퍼
│   └─ rate-limit/
├─ prisma/
│   ├─ schema.prisma
│   ├─ migrations/
│   └─ seed.ts
├─ db/sql/                                # Postgres 함수, RLS, 트리거
├─ tests/
│   ├─ unit/
│   ├─ integration/
│   ├─ e2e/
│   └─ fixtures/
├─ middleware.ts
├─ next.config.js                         # 보안 헤더 + CSP
├─ vercel.json                            # cron schedule
└─ package.json
```

---

## 15. 다음 단계

1. 본 설계 문서 사용자 최종 확인
2. **writing-plans** 스킬로 구현 계획서 작성 → 작업을 단위 task로 쪼개고 의존성 정의
3. (또는 bkit `/pdca plan nsfield`로 동일 작업을 PDCA 흐름에 안착)
4. 작업 우선순위: DB 스키마 + auth + wallet → 가격 엔진 + 어댑터 1개(가장 단순한 이미지) → 첫 종단 흐름 → 나머지 어댑터 → 영상 비동기 → 관리자 페이지 → 보안/테스트 보강

---

**문서 끝**
