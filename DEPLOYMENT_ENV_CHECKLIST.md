# PSI 배포 환경변수 체크리스트 (2026-08-31)

이 문서는 현재 코드 기준으로 실제 참조되는 환경변수만 정리합니다.

## 1) 필수 (운영)

- `VITE_SUPABASE_URL`
  - 용도: 프론트/서버리스 Supabase URL
  - 참조: `lib/supabaseClient.ts`, `api/admin/*.ts`, `api/gateway.ts`, `lib/server/harness/persistence.ts`

- `VITE_SUPABASE_ANON_KEY`
  - 용도: 프론트/서버리스 Supabase anon key
  - 참조: `lib/supabaseClient.ts`, `api/admin/*.ts`, `api/gateway.ts`, `lib/server/harness/persistence.ts`

- `SUPABASE_SERVICE_ROLE_KEY`
  - 용도: 관리자/하네스 서버 쓰기 작업용 Supabase service role key
  - 폴백: `SUPABASE_SERVICE_KEY`, `SERVICE_ROLE_KEY`
  - 참조: `api/admin/*.ts`, `api/gateway.ts`, `lib/server/harness/persistence.ts`

- `VITE_PSI_ADMIN_SECRET`
  - 용도: 관리자 요청 헤더 및 관리 기능 보호
  - 참조: `lib/supabaseClient.ts`, `api/admin/*.ts`, `api/gateway.ts`, `pages/WorkerManagement.tsx`

- `ADMIN_LOGIN_PASSWORD`
  - 용도: 관리자 모드 진입 비밀번호
  - 대체: `PSI_ADMIN_PASSWORD`
  - 참조: `lib/server/adminAuthGuard.ts`, `api/admin/auth.ts`
  - 비고: 코드에 하드코딩하지 않고 Vercel 환경변수에서만 관리

- `ADMIN_SESSION_SECRET`
  - 용도: 관리자 로그인 세션 서명키
  - 대체: `ADMIN_API_AUTH_TOKEN`, `PSI_ADMIN_SECRET`, `VITE_PSI_ADMIN_SECRET`
  - 참조: `lib/server/adminAuthGuard.ts`, `api/admin/auth.ts`
  - 비고: 로그인 비밀번호와 다른 긴 임의 문자열 권장

- `GOOGLE_TTS_API_KEY`
  - 용도: 다국어 음성(TTS) 생성
  - 참조: `api/admin/create-training.ts`

- `GEMINI_API_KEY`
  - 용도: 하네스 분석/재분석 및 다국어 처리용 기존 Gemini 호출
  - 권장값: `GEMINI_API_KEY_FREE`와 같은 무료 프로젝트 키
  - 폴백: `GOOGLE_GEMINI_API_KEY`, `GOOGLE_API_KEY`
  - 참조: `api/gateway.ts`, `api/admin/create-training.ts`, `lib/server/shared/multilingualIntegrityEmbedding.ts`

- `GEMINI_API_KEY_FREE`
  - 용도: 서버 OCR 기본 실행용 무료 프로젝트 키
  - 정책: 모든 OCR은 이 키로 먼저 시작하며 유료 키로 자동 전환하지 않음
  - 비고: OCR 경로는 과금 등급 혼동을 막기 위해 generic `GEMINI_API_KEY`로 폴백하지 않음
  - 참조: `api/gateway.ts`

- `GEMINI_API_KEY_PAID`
  - 용도: 무료 공급자 할당량 소진 후 관리자가 해당 문서 비용을 명시 승인한 1회 요청
  - 정책: 서버 전용 비밀변수로만 저장하고 `VITE_` 접두사를 사용하지 않음
  - 승인 조건: 현재 관리자 접속 비밀번호 재확인 + 문서/이미지/금액에 결속된 5분 승인 토큰 + 데이터베이스의 원자적 1회 소비 기록
  - 안전 차단: 승인 저장소가 연결되지 않거나 비밀번호가 틀리면 유료 API를 호출하지 않음
  - 참조: `api/gateway.ts`

- 키 회전 원칙
  - 과거 `VITE_GEMINI_API_KEY_FREE`/`VITE_GEMINI_API_KEY_PAID`로 배포된 키는 브라우저 공개 이력이 있는 것으로 간주하고 재사용하지 않음
  - 새 무료·유료 키를 각각 발급해 서버 전용 변수에 등록한 뒤 옛 Vercel 변수와 옛 Google 키를 폐기
  - 유료 키는 Production에만 등록하고, Preview에는 실제 과금 키를 두지 않는 것을 기본으로 함

- `OCR_PAID_APPROVAL_SECRET`
  - 용도: 유료 OCR 승인 토큰 서명
  - 비고: 관리자 비밀번호·Gemini 키와 다른 긴 임의 문자열 권장
  - 운영: Production/Preview에 Secret으로 등록하고 변경 후 반드시 재배포

- `OCR_MAX_USD_PER_DOCUMENT`
  - 용도: 승인된 유료 OCR도 넘을 수 없는 문서당 최대 비용(USD)
  - 기본값: `0.05`

- `TRAINING_LINK_SECRET`
  - 용도: 근로자 서명 링크 HMAC 서명/검증(권장: 독립 비밀키)
  - 참조: `lib/server/trainingLinkToken.ts`

## 1-1) 유료 OCR 승인 저장소 (필수)

- 적용 파일: `supabase/migrations/20260831000000_paid_ocr_security_gate.sql`
- 필수 객체: `api_security_events`, `api_usage_events`, `psi_consume_api_quota(...)`
- 권한 기준: 두 테이블은 RLS 활성화, RPC는 `service_role`만 실행 가능, `anon`/`authenticated` 실행 불가
- 원자성 기준: 같은 승인 해시와 `max_requests=1`로 두 번 호출하면 첫 호출만 `allowed=true`, 두 번째는 `allowed=false`
- 배포 원칙: 마이그레이션 적용과 권한/원자성 검증이 끝나기 전에는 유료 OCR을 활성화하지 않음. 앱은 저장소가 없거나 권한이 틀리면 유료 호출 전에 503으로 안전 차단해야 함
- 주의: 루트의 `supabase_api_security_migration.sql` 전체는 다른 PSI 테이블 의존 구간을 포함합니다. 신규/복구 프로젝트의 유료 OCR 게이트에는 위 정식 migration 파일을 우선 적용합니다.

## 2) 권장 (운영 안정화)

- `NEXT_PUBLIC_APP_BASE_URL`
  - 용도: QR/공유 링크의 기준 URL 고정
  - 예: `https://your-domain.com`
  - 참조: `api/admin/create-training.ts`, `api/admin/reissue-training-link.ts`

- `TRAINING_LINK_TTL_MINUTES`
  - 용도: 근로자 링크 만료 시간(분)
  - 기본값: `720` (12시간)
  - 참조: `lib/server/trainingLinkToken.ts`

- `PSI_ADMIN_SECRET`
  - 용도: 서버리스 측 대체 관리자 시크릿(백업키)
  - 참조: `api/admin/*.ts`, `api/gateway.ts`, `lib/server/trainingLinkToken.ts`

- `VERCEL_TOKEN`
  - 용도: 로컬/CI에서 `vercel build`, `vercel pull`, `vercel deploy` 사전 검증 수행
  - 비고: 런타임 필수값은 아니지만 현재 배포 프리플라이트 완료를 위해 필요

## 3) 호환/대체 키

코드는 아래 키를 폴백으로도 읽습니다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `SERVICE_ROLE_KEY`
- `GOOGLE_GEMINI_API_KEY`
- `GOOGLE_API_KEY`

권장 정책: 브라우저 공개 설정만 `VITE_*`를 사용합니다. Gemini 비밀키·관리자 서명키·서비스 역할 키는 서버 전용 이름만 사용하고 `VITE_GEMINI_API_KEY_FREE`, `VITE_GEMINI_API_KEY_PAID`는 제거합니다.

## 4) 로컬 `.env.local` 예시

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxx
SUPABASE_SERVICE_ROLE_KEY=xxxx
VITE_PSI_ADMIN_SECRET=xxxx
ADMIN_LOGIN_PASSWORD=xxxx
ADMIN_SESSION_SECRET=xxxx
GOOGLE_TTS_API_KEY=xxxx
GEMINI_API_KEY_FREE=xxxx
GEMINI_API_KEY_PAID=xxxx
GEMINI_API_KEY=xxxx
OCR_PAID_APPROVAL_SECRET=xxxx
OCR_MAX_USD_PER_DOCUMENT=0.05
TRAINING_LINK_SECRET=xxxx
NEXT_PUBLIC_APP_BASE_URL=http://localhost:5173
TRAINING_LINK_TTL_MINUTES=720
VERCEL_TOKEN=xxxx
```

## 5) 배포 전 점검 순서

1. Supabase 프로젝트가 실행 중이며 프로젝트 URL이 DNS/HTTPS에서 응답하는지 확인
2. `supabase/migrations/20260831000000_paid_ocr_security_gate.sql` 적용 후 RLS·RPC 권한·1회 소비 원자성 확인
3. Production에 `SUPABASE_SERVICE_ROLE_KEY`가 설정되고 서버 헬스가 `keyMode=service_role`, `tablesReady=true`인지 확인
4. 환경변수 입력 후 `npm run build` 성공 확인
5. `api/*` 함수 구성이 `admin 10 + gateway 1` 이내로 유지되는지 확인
6. `vercel build` 또는 CI preflight가 인증 오류 없이 완료되는지 확인
7. 무료 OCR 실문서 1건이 `X-PSI-Quota-Mode: database`, `billingTier=free`, `paidCalls=0`으로 성공하는지 확인
8. 관리자 화면에서 다국어 링크 생성 확인
9. 생성된 링크로 근로자 페이지 접속 확인 (`exp`, `sig` 포함)
10. 만료 링크 차단 동작 확인
11. 관리자 `링크 재발급` 후 재접속 확인
12. 동일 이름 재서명(중복 제출) 차단 확인

## 5-1) 현재 함수 인벤토리 기준선

- `api/gateway.ts` : 하네스 및 공통 gateway 1개
- `api/admin/*.ts` : 관리자 함수 10개
- `api/harness/` : 현재 비어 있어야 함
- `api/shared/` : 현재 비어 있어야 함

권장 정책:
- 새로운 서버 로직은 가능하면 `api/gateway.ts` 액션 또는 `lib/server/*` 공유 모듈로 먼저 검토
- `api/*`에 파일을 추가할 때는 Vercel Hobby 함수 수 제한 영향을 먼저 확인

## 6) 실패 시 빠른 진단

- 링크 접속 즉시 차단
  - `TRAINING_LINK_SECRET` 불일치 가능성 확인
  - 링크의 `exp`, `sig` 누락 여부 확인

- 음성 생성 실패
  - `GOOGLE_TTS_API_KEY` 확인
  - API 쿼터/권한 상태 확인

- 관리자 기능 접근 실패
  - 관리자 모드 진입 실패: `ADMIN_LOGIN_PASSWORD` 또는 `PSI_ADMIN_PASSWORD` 설정 확인
  - 로그인 후 관리자 기능 호출 실패: `ADMIN_SESSION_SECRET`, `VITE_PSI_ADMIN_SECRET`, `PSI_ADMIN_SECRET` 설정 확인
  - 운영자 로그인 세션과 배포 환경변수 반영 여부 확인

- 하네스 분석/재분석 실패
  - `GEMINI_API_KEY` 또는 폴백 키 설정 확인
  - `SUPABASE_SERVICE_ROLE_KEY` 누락 여부 확인

- `vercel build` 사전 검증 실패
  - `VERCEL_TOKEN` 유효성 확인
  - 프로젝트 연결 상태(`vercel pull`)와 함수 수 제한 초과 여부 확인

