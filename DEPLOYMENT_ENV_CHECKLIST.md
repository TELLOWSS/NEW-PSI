# PSI 배포 환경변수 체크리스트 (2026-03-14)

이 문서는 현재 코드 기준으로 실제 참조되는 환경변수만 정리합니다.

## 1) 필수 (운영)

- `VITE_SUPABASE_URL`
  - 용도: 프론트/서버리스 Supabase URL
  - 참조: `lib/supabaseClient.ts`, `api/admin/*.ts`

- `VITE_SUPABASE_ANON_KEY`
  - 용도: 프론트/서버리스 Supabase anon key
  - 참조: `lib/supabaseClient.ts`, `api/admin/*.ts`

- `VITE_PSI_ADMIN_SECRET`
  - 용도: 관리자 요청 헤더 및 관리 기능 보호
  - 참조: `lib/supabaseClient.ts`, `api/admin/*.ts`, `pages/WorkerManagement.tsx`

- `GOOGLE_TTS_API_KEY`
  - 용도: 다국어 음성(TTS) 생성
  - 참조: `api/admin/create-training.ts`

- `TRAINING_LINK_SECRET`
  - 용도: 근로자 서명 링크 HMAC 서명/검증(권장: 독립 비밀키)
  - 참조: `lib/server/trainingLinkToken.ts`

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
  - 참조: `api/admin/*.ts`, `lib/server/trainingLinkToken.ts`

## 3) 호환/대체 키

코드는 아래 키를 폴백으로도 읽습니다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

권장 정책: 운영에서는 `VITE_*` 키를 표준으로 쓰고, 폴백은 비상용으로만 유지합니다.

## 4) 로컬 `.env.local` 예시

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxx
VITE_PSI_ADMIN_SECRET=xxxx
GOOGLE_TTS_API_KEY=xxxx
TRAINING_LINK_SECRET=xxxx
NEXT_PUBLIC_APP_BASE_URL=http://localhost:5173
TRAINING_LINK_TTL_MINUTES=720
```

## 5) 배포 전 점검 순서

1. 환경변수 입력 후 `npm run build` 성공 확인
2. 관리자 화면에서 다국어 링크 생성 확인
3. 생성된 링크로 근로자 페이지 접속 확인 (`exp`, `sig` 포함)
4. 만료 링크 차단 동작 확인
5. 관리자 `링크 재발급` 후 재접속 확인
6. 동일 이름 재서명(중복 제출) 차단 확인

## 6) 실패 시 빠른 진단

- 링크 접속 즉시 차단
  - `TRAINING_LINK_SECRET` 불일치 가능성 확인
  - 링크의 `exp`, `sig` 누락 여부 확인

- 음성 생성 실패
  - `GOOGLE_TTS_API_KEY` 확인
  - API 쿼터/권한 상태 확인

- 관리자 기능 접근 실패
  - `VITE_PSI_ADMIN_SECRET` 및 관리자 PIN 설정 확인

