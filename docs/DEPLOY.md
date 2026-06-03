# 배포 가이드 (소유주 전용)

이 문서는 NS Field를 Vercel에 배포하기 위한 절차를 정리한다.
**실제 배포 명령(`vercel deploy` 등)은 소유주가 직접 실행한다.** 이 저장소는
배포에 필요한 설정(`vercel.json`, `.env.example`)과 본 가이드만 준비한다.

스택: Next.js 16 (App Router) + Supabase + Prisma 6.19.3 + Vercel.

---

## 1. 사전 준비

- **Supabase 프로젝트**: 이미 생성되어 있음. 프로젝트 URL / anon key /
  service_role key / DB 접속 문자열(pooler·session)을 준비한다.
- **GitHub 저장소**: `leesun19990111-cloud/NSfield-AI`.
  배포 대상 코드가 push 되어 있어야 한다.
- **GitHub CLI(`gh`)**: GitHub 관련 작업 전 `gh --version`으로 설치 확인.

---

## 2. Vercel 프로젝트 생성

1. `vercel.com` 로그인 후 **Add New… > Project**.
2. GitHub 저장소 `leesun19990111-cloud/NSfield-AI`를 **Import**.
3. Framework는 **Next.js**가 자동 감지된다. 별도 변경 불필요.

---

## 3. 환경변수 등록

Vercel 프로젝트 **Settings > Environment Variables**에 `.env.example`의
모든 키를 등록한다. 환경(Production / Preview / Development)을 적절히 선택한다.

주의사항:

- **DATABASE_URL** = Supabase **pooler** 연결(포트 `6543`, 쿼리스트링에
  `?pgbouncer=true`). 서버리스 함수의 커넥션 폭주를 막는다.
- **DIRECT_URL** = Supabase **세션** 연결(포트 `5432`, pgbouncer 없음).
  Prisma 마이그레이션이 사용한다.
- **SUPABASE_SERVICE_ROLE_KEY**, **CRON_SECRET** = 비밀값. 클라이언트에
  노출되지 않도록 `NEXT_PUBLIC_` 접두사를 절대 붙이지 않는다.
- **NEXT_PUBLIC_SITE_URL** = 실제 배포 도메인(`https://...`). OAuth 콜백과
  이메일 링크 생성에 사용되므로 로컬값(`http://localhost:3000`)을 그대로
  두면 안 된다.
- **외부 AI 키**(OPENAI / GOOGLE / KLING / BYTEDANCE / ATLASCLOUD): 보유한
  것만 등록한다. 미등록 시 해당 모델만 동작하지 않고 나머지 기능은 정상.
- **NEXT_PUBLIC_BANK_\*** = 사용자에게 표시되는 입금 계좌 정보(비밀 아님).

전체 키 목록과 그룹은 `.env.example`을 기준으로 한다.

---

## 4. 빌드 설정

- **Build Command**: `next build` (Vercel 기본값).
- **Install Command**: `npm install`. `postinstall`에서 `prisma generate`가
  자동 실행되므로 Prisma Client가 빌드 시점에 준비된다.
- **DB 마이그레이션은 Vercel 빌드에 포함하지 않는다.** 빌드 단계에서
  `prisma migrate deploy`를 돌리면 빌드 환경/권한 문제와 동시 배포 시
  마이그레이션 충돌 위험이 있다.
  - 로컬에서: `npm run db:migrate` (`dotenv -e .env.local`로 로컬 env 사용).
  - 또는 배포 파이프라인(CI)에서 배포 **직전** 단계로 `prisma migrate deploy`를
    `DIRECT_URL`(5432) 대상으로 수동 실행.
  - 권장: 배포 전에 로컬 또는 CI에서 마이그레이션을 먼저 적용하고, 그 다음
    Vercel 배포를 트리거한다.

---

## 5. Supabase 설정 확인

배포 전 다음이 적용돼 있는지 확인한다(대부분 마이그레이션으로 이미 반영됨).

- **Realtime publication**에 `generations` 테이블이 포함돼 있어야 한다
  (생성 상태 실시간 갱신용 — 마이그레이션으로 추가됨).
- **Storage** `generations` 버킷이 존재해야 한다(생성 결과물 저장).
- **Auth**: 이메일 확인을 비활성화하려면 Supabase Auth 설정에서 조정,
  또는 OAuth 공급자를 구성한다. `NEXT_PUBLIC_SITE_URL`을 Auth의
  Redirect URL 허용 목록에 추가한다.

---

## 6. Cron 활성화 (중요: 인증 한계 주의)

Vercel은 `vercel.json`의 `crons` 배열을 **배포 시 자동 등록**한다. 현재 4개:

| path | schedule | 의미 |
| --- | --- | --- |
| `/api/cron/fx-update` | `0 * * * *` | 매시 정각 환율 갱신 |
| `/api/cron/poll-generations` | `* * * * *` | 매분 비동기 영상 생성 상태 폴링 |
| `/api/cron/cleanup-expired` | `0 19 * * *` | 매일 만료 정리 |
| `/api/cron/backup` | `0 18 * * 0` | 매주 일요일 백업 |

### 인증 한계 (반드시 읽을 것)

현재 4개 cron 라우트는 모두 다음과 같이 가드된다:

```ts
const auth = request.headers.get('authorization')
if (!secret || auth !== `Bearer ${secret}`) { return 401 }
```

즉 요청에 `Authorization: Bearer <CRON_SECRET>` 헤더가 있어야 통과한다.

**핵심 제약**: `vercel.json`의 cron 정의에는 임의의 `Authorization` 헤더를
지정할 수 없다. Vercel Cron은 호출 헤더를 운영자가 자유롭게 설정하는 기능을
제공하지 않는다.

Vercel은 프로젝트에 `CRON_SECRET` 환경변수가 설정돼 있으면 자체 Cron 호출에
`Authorization: Bearer <CRON_SECRET>`를 자동으로 포함하도록 동작한다(공식 문서
기준). 따라서 **`CRON_SECRET`을 Vercel 환경변수로 등록하면** 위 가드를 그대로
통과할 수 있다. 다만 이 동작은 환경변수명이 정확히 `CRON_SECRET`일 때만 적용되며,
플랫폼 동작에 의존한다.

### 권장 조치 (후속 작업 — 이 태스크에서는 코드 변경 안 함)

플랫폼 의존을 줄이고 견고하게 만들려면 라우트 가드를 다음 중 하나로 보강한다:

- **(a) Vercel Cron 헤더 검증 추가**: Vercel Cron 호출에는 `x-vercel-cron`
  헤더가 붙는다. 가드를 `Bearer 검증 OR request.headers.get('x-vercel-cron')
  존재 확인`으로 확장한다. (권장 후속 작업)
- **(b) 외부 스케줄러 사용**: Vercel Cron 대신 외부 스케줄러(예: cron-job.org,
  GitHub Actions)가 `Authorization: Bearer <CRON_SECRET>`를 직접 보내도록 한다.
  이 경우 헤더 제어가 가능하므로 현재 가드를 그대로 쓸 수 있다.

운영 시작 시점에는 (1) Vercel 환경변수에 `CRON_SECRET` 등록 → Vercel 자동
Bearer 헤더로 통과를 확인하고, 배포 후 cron 로그에서 401이 발생하면 위 (a)
보강을 **후속 작업(follow-up)** 으로 진행한다.

---

## 7. 첫 배포 후 본인 ADMIN 승격

가입(첫 로그인)으로 `users` 행이 생성된 뒤, Supabase SQL Editor에서 본인을
관리자로 승격한다:

```sql
update users set role = 'ADMIN' where email = '<본인이메일>';
```

이후 `/admin` 접근이 가능해진다.

---

## 8. 입금 계좌 설정

`NEXT_PUBLIC_BANK_NAME`, `NEXT_PUBLIC_BANK_ACCOUNT`, `NEXT_PUBLIC_BANK_HOLDER`를
실제 입금 계좌 정보로 등록한다. 이 값은 충전 요청 화면에서 사용자에게
표시되므로 정확히 입력한다(비밀값 아님).

---

## 9. 배포 후 스모크 체크리스트

- [ ] **가입 → 충전 요청 → (관리자 승인) → 잔액 반영** 전체 흐름이 동작.
- [ ] **이미지 생성**이 동작(`OPENAI_API_KEY` 필요). 잔액 차감 확인.
- [ ] **영상 생성** 비동기 흐름: 생성 시작 → `poll-generations` cron으로 상태
      갱신 → 완료 시 결과물 표시(해당 모델 키 필요).
- [ ] **/admin** 접근 가능(ADMIN 승격 후), 충전 승인/조정 동작.
- [ ] cron 로그에 401이 없는지 확인(6번 인증 한계 참고).
- [ ] `NEXT_PUBLIC_SITE_URL`이 실제 도메인으로 설정돼 OAuth/이메일 링크가
      올바른 도메인을 가리키는지 확인.
