# 오늘의 건강 · health-web

Oura, 오늘러닝(healthTask), 인바디와 삼성 헬스를 한 화면에서 확인하는 개인용 건강 대시보드입니다. Next.js App Router · TypeScript · Tailwind CSS · Recharts · Supabase를 사용합니다.

## 실행

Node.js 24와 pnpm 11.25.0을 사용합니다. 의존성은 `pnpm-lock.yaml`에 고정했습니다.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Windows에서는 `.env.example`을 `.env.local`로 복사해도 됩니다. 현재 작업 환경에는 프로젝트 URL과 요청한 허용 이메일만 `.env.local`에 설정되어 있습니다. 공개 키는 현재 작업 환경에 입력되어 API 연결을 확인했습니다. 기존 `.env.local`을 덮어쓰지 마세요.

- [데모](http://localhost:3000/demo): 자격 증명 없이 샘플 데이터를 확인합니다. 실제 데이터 쓰기·연결 기능은 비활성화됩니다.
- [로그인](http://localhost:3000/login): Supabase 설정 후 허용된 이메일의 OTP로 로그인합니다.
- `/`: 로그인한 사용자의 실제 데이터만 표시합니다. 연결 실패·빈 데이터에 샘플을 대신 표시하지 않습니다.

## Supabase 연결

프로젝트 ID: `hykgvrbsvldrjdoxxlnl`. 2026-10-20에 실제 DB 마이그레이션·RLS·허용 이메일·공개 가입 차단·수집/기기 연결 함수 배포를 완료했습니다. Gmail SMTP, 한국어 OTP 메일, 소유자 계정 로그인과 실제 DB 조회를 확인했습니다. 수집 데이터가 없는 대시보드와 연결 상태도 정상 표시됩니다. 상세 상태와 CLI 이력 보정은 [백엔드 안내](docs/backend.md)를 참고하세요.

1. 기존 테이블과 마이그레이션 이력을 확인합니다. 같은 이름의 객체가 있으면 적용 전에 조정합니다. 로컬 테스트 외에 `db reset`을 사용하지 않습니다.
2. Supabase CLI로 프로젝트를 연결하고 `supabase/migrations`의 추가 마이그레이션을 적용합니다. 자세한 명령과 함수 설정은 [백엔드 안내](docs/backend.md)를 참고하세요.
3. Supabase Auth에서 본인 이메일을 초대하고, 받은 메일의 초대 수락으로 최초 이메일 인증을 완료합니다. 공개 가입은 비활성화합니다. 미인증 초대 계정은 OTP 요청에서 `signup_disabled` 오류가 발생하므로 초대 수락을 먼저 완료해야 합니다. `public.allowed_emails`에 같은 이메일을 소문자로 등록합니다. 웹의 `ALLOWED_EMAILS`와 DB의 허용 목록을 모두 설정해야 합니다.
4. 이 Free 프로젝트에서는 템플릿 편집을 위해 Authentication → Emails → SMTP Settings에서 메일 발송 서버를 먼저 설정해야 합니다. 그 다음 Auth → Email Templates → Magic Link 템플릿에 `{{ .Token }}`을 포함해 인증 코드를 받도록 설정합니다. 웹은 링크 콜백 대신 OTP 입력을 사용하며 새 계정을 자동 생성하지 않습니다.
5. `.env.local`의 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`에 프로젝트 공개 키를 넣습니다. 서버 전용 `ALLOWED_EMAILS`에는 허용 이메일을 쉼표로 구분해 입력합니다.
6. Edge Functions와 Oura 비밀값, 시간별 수집 예약을 설정합니다. 서비스 역할 키와 Oura Secret/암호화 키를 `NEXT_PUBLIC_*` 변수에 넣지 않습니다.

로그인 후 **연결 · 설정 → 기기 연결 코드 발급**을 누르고, 업데이트한 오늘러닝 앱의 **설정 → health-web 클라우드 연결**에 코드를 붙여넣습니다. 코드만으로 연결하며 앱에서 Supabase 키를 입력할 필요가 없습니다.

## 데이터 연결

| 데이터    | 수집 경로                            | 이번 구현                                                                |
| --------- | ------------------------------------ | ------------------------------------------------------------------------ |
| Oura      | OAuth → Supabase Edge Function       | 수면·준비도·활동·걸음·안정 심박·HRV, 최초 1년 수집·수동/시간별 증분 갱신 |
| 오늘러닝  | Android → 인증된 배치 수집           | 러닝·경로·랩·저장된 센서와 중복 연결 정보                                |
| 인바디    | 오늘러닝 → 같은 배치 수집            | 수치 지표, 측정 시간·시간대·CSV 원본 필드                                |
| 삼성 헬스 | Health Connect → 오늘러닝 → Supabase | 러닝·체성분·선택 권한의 수면·걸음·심박                                   |
| 애플 건강 | 후속 iOS/수집 앱 → 공통 API          | 공통 수집 계약과 준비 상태만 제공                                        |

오늘러닝의 상세 JSON(schemaVersion 5 / analysis 3)도 웹에서 가져올 수 있습니다. 자동 전송과 같은 출처·ID를 사용합니다. 다른 사용자 파일을 업로드하면 현재 로그인한 계정에 저장되므로 본인의 파일만 선택하세요.

원본 출처와 수치를 보존합니다. 같은 날 여러 체성분 측정은 합치지 않으며, 서로 다른 출처의 수면·걸음을 합산하지 않습니다. 알려지지 않은 수치는 `—`로 표시합니다. 기준 시간대는 Asia/Seoul입니다. 이 화면은 건강 기록 조회용이며 진단 기능을 제공하지 않습니다.

## 검증

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm test`는 PostgreSQL WASM 엔진(PGlite)에서 실제 마이그레이션/RLS/배치 트랜잭션을 실행하고, 단위·누락 값·중복 집계·JSON 가져오기·대용량 원본 분할을 검증합니다. Supabase의 Auth/게이트웨이 동작을 대체하지는 않습니다. Edge 테스트는 [백엔드 안내](docs/backend.md)를 따릅니다.

Android 변경과 검증 명령은 인접 `healthTask` 저장소의 `docs/CLOUD_SYNC.md`에 있습니다. 사용자 요청에 따라 Android 개발 환경은 이 PC에 설치하지 않고, APK 빌드와 실기기 검증은 다른 PC에서 진행합니다. 준비하던 개발 도구는 정리했습니다.

## Vercel 배포

1. Vercel에 이 GitHub 저장소를 연결하고 Next.js 프레임워크, Node.js 24, `pnpm build`를 사용합니다.
2. `.env.example`의 환경 변수를 Vercel에도 설정합니다. `NEXT_PUBLIC_APP_URL`에는 실제 HTTPS 배포 주소를 사용합니다. 프리뷰 배포는 개인 건강 데이터용 운영 프로젝트와 연결하지 않는 것을 기본으로 합니다.
3. Supabase Auth Site URL을 실제 주소로, Edge Secret `WEB_ORIGIN`도 같은 origin으로 설정합니다. Oura 개발자 앱에는 `https://hykgvrbsvldrjdoxxlnl.supabase.co/functions/v1/oura-connect`를 정확히 등록합니다.
4. 배포 후 OTP·Oura 연결·기기 업로드·권한 폐기·재전송을 실제 계정으로 확인합니다. 정기 수집은 `supabase/schedule.sql` 적용 후 동작합니다.

현재 Supabase DB와 수집/기기 연결 함수는 배포되었고 SMTP·OTP 로그인과 실제 DB 조회를 확인했습니다. 실제 Android 기기 연결·건강 기록 업로드, Oura 함수·자격 증명·정기 수집, Vercel 배포는 남아 있습니다.
