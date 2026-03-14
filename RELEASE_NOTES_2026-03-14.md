# PSI 릴리즈 노트 (2026-03-14)

## 1) 요약

이번 릴리즈는 현장 오조작 방지와 관리자/근로자 모드 분리를 핵심으로 안정화되었습니다.

- 관리자 모드와 근로자 모드 분리
- 근로자 서명 링크 보안(서명 + 만료)
- 재서명(중복 제출) 서버 차단
- 관리자 링크 재발급 및 이력 확인
- 근로자 화면 단순화 UI 적용
- 운영 문서(배포/운영 매뉴얼) 정비

## 2) 주요 변경사항

### 2.1 모드 분리 및 관리자 잠금

- 관리자/근로자 앱 모드 분리
- 근로자 모드에서 관리자 셸(사이드바/헤더) 비노출
- 관리자 수동 잠금 버튼 추가
- 관리자 유휴 10분 자동 잠금

영향 파일:
- `App.tsx`
- `components/Layout.tsx`
- `utils/adminPinUtils.ts`
- `pages/Settings.tsx`

### 2.2 근로자 링크 보안 강화

- 링크에 `sessionId + exp + sig` 서명값 포함
- 만료/위변조 링크 차단
- 링크 재발급 API 추가

영향 파일:
- `api/shared/trainingLinkToken.ts`
- `api/admin/create-training.ts`
- `api/admin/reissue-training-link.ts`

### 2.3 제출 무결성 강화

- 제출 API에서 링크 토큰/만료 검증
- 동일 세션 + 동일 이름 재제출(중복 서명) 차단

영향 파일:
- `api/training/submit-signature.ts`

### 2.4 관리자 운영 UX

- 링크 만료 시각 표시
- 만료 배지 표시
- 링크 재발급 버튼
- 링크 생성/재발급 이력 패널 (최근 30건)

영향 파일:
- `pages/AdminTraining.tsx`

### 2.5 근로자 UX 단순화

- 근로자 모드에서 단순화 UI 사용
- 긴 드롭다운 대신 언어 버튼 중심 선택
- 이탈(뒤로가기/새로고침) 주의 강화
- 제출 완료 후 재제출 버튼 비활성

영향 파일:
- `pages/WorkerTraining.tsx`
- `App.tsx`

## 3) 운영 문서 추가

- 배포 환경변수 체크리스트: `DEPLOYMENT_ENV_CHECKLIST.md`
- 관리자 운영 매뉴얼: `ADMIN_OPERATION_GUIDE.md`

README 링크 추가 완료:
- `README.md`

## 4) 환경변수/운영 정책

핵심 운영 변수:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_PSI_ADMIN_SECRET`
- `GOOGLE_TTS_API_KEY`
- `TRAINING_LINK_SECRET`
- `TRAINING_LINK_TTL_MINUTES` (기본 720분)

## 5) 검증 결과

- 변경 파일 타입 오류 없음
- `npm run build` 성공
- 잔여 경고: 번들 크기 경고(기능 영향 없음)

## 6) 다음 권장 작업

- 서버측 RBAC(역할 기반 접근제어) 고도화
- 링크 재발급 이력의 서버 저장(감사 추적 강화)
- 번들 분할 최적화(500KB+ 경고 완화)
