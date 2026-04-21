# SESSION RESUME HANDOFF (2026-04-20) · OCR 재분석/원본비교/국가별 언어검증 트랙

## 0) 내일 시작 즉시 할 일 (3분)
1. [SESSION_RESUME_HANDOFF_2026-04-20_OCR_VERIFICATION.md](SESSION_RESUME_HANDOFF_2026-04-20_OCR_VERIFICATION.md) 이 문서 먼저 확인
2. [pages/OcrAnalysis.tsx](pages/OcrAnalysis.tsx) 의 재분석 실패 게이트(구조 검증) 확인
3. [components/modals/RecordDetailModal.tsx](components/modals/RecordDetailModal.tsx) 에서 국가별 검증 배지 확인
4. 전체 일괄재분석 1회 실행 후 샘플 레코드 즉시 검수

---

## 1) 오늘 완료한 핵심 작업

### ✅ A. API 키/보안 정리
- [.env](.env) 의 실키 제거 완료
  - VITE_GEMINI_API_KEY_FREE=
  - VITE_GEMINI_API_KEY_PAID=
  - VITE_ADMIN_PIN=
- [.gitignore](.gitignore) 정리
  - .env
  - .env.local
  - .env.*.local

### ✅ B. 원본비교 0건/모국어 공란 문제의 구조적 보강
- 서버 OCR 재분석 경로에서 필드 요구 강화
  - 문항형(1~5) 문서인데 문항 답변 누락 시 실패 처리
  - 문항 한국어 해석 누락 시 실패 처리
  - aiInsights_native 누락 시 실패 처리
- 브라우저 OCR 경로도 동일한 구조 검증을 적용해 부분성공 통과 차단

### ✅ C. 국가별 언어 검증 공통 유틸 신설
- 신규 파일: [utils/ocrVerificationLanguageUtils.ts](utils/ocrVerificationLanguageUtils.ts)
- 포함 내용
  - 국적 판정: 대한민국/베트남/중국/태국/우즈베키스탄/인도네시아/캄보디아/몽골/카자흐스탄/러시아/네팔/미얀마
  - 안내 언어 라벨 계산
  - 국가별 폴백 안내/판정 문구
  - 원본비교/모국어 안내 완전성 검사 함수

### ✅ D. UI 검증 가시화 보강
- [components/modals/RecordDetailModal.tsx](components/modals/RecordDetailModal.tsx)
  - 작업자 안내 언어 표시
  - 모국어 안내 상태 표시(추출 완료/폴백)
  - 검증 상태 표시(정상/누락 사유)
- [components/ReportTemplate.tsx](components/ReportTemplate.tsx)
  - aiInsights_native 공란 시 국가별 폴백 판정문 자동 사용

### ✅ E. 재분석/서비스/서버 경로 연동
- [api/gateway.ts](api/gateway.ts)
  - 서버 OCR 결과에 완전성 검증 적용
- [services/geminiService.ts](services/geminiService.ts)
  - 브라우저 OCR 결과에 완전성 검증 적용
- [pages/OcrAnalysis.tsx](pages/OcrAnalysis.tsx)
  - 재분석 루프에서 완전성 미달 시 실패 처리 후 재시도/실패 경로로 이관

---

## 2) 오늘 트랙에서 실제 변경된 주요 파일
- [utils/ocrVerificationLanguageUtils.ts](utils/ocrVerificationLanguageUtils.ts) (신규)
- [api/gateway.ts](api/gateway.ts)
- [services/geminiService.ts](services/geminiService.ts)
- [pages/OcrAnalysis.tsx](pages/OcrAnalysis.tsx)
- [components/modals/RecordDetailModal.tsx](components/modals/RecordDetailModal.tsx)
- [components/ReportTemplate.tsx](components/ReportTemplate.tsx)
- [.env](.env)
- [.gitignore](.gitignore)

참고:
- 터미널 git status에는 본 트랙 외 기존 변경 파일이 다수 존재함.
- 내일 커밋 시 본 트랙 파일만 선별 커밋 필요.

---

## 3) 오늘 검증 결과
- 정적 오류 검사: 수정 파일 모두 오류 없음
- 프로덕션 빌드: 성공
  - 실행: npm run build
  - 결과: vite build 성공

---

## 4) 내일 바로 실행할 체크리스트 (실행 순서 고정)

### 4-1. 배포 전 로컬 스모크
1. 앱 실행
2. OCR 재분석 대상 3건 열기
   - 한국 1건
   - 중국 1건
   - 베트남 1건
3. 기록 상세 검증에서 아래 확인
   - 원본 비교 탭 문항 카운트 0이 아닌지
   - 작업자 전달용 모국어 안내 공란 아닌지
   - 검증 상태가 정상인지

### 4-2. 전체 일괄재분석 실행
1. OcrAnalysis에서 전체 일괄재분석 실행
2. 실패 건 발생 시 상세 사유 확인
   - 문항별 원문 답변 누락
   - 문항별 한국어 해석 누락
   - 모국어 보호 안내 누락
3. 누락 건은 즉시 재시도 또는 수동 보정

### 4-3. 국가별 면밀 검증 (최소 샘플)
아래 국가군에서 각 1건 이상 확인 권장
- 대한민국
- 중국
- 베트남
- 태국
- 우즈베키스탄
- 인도네시아
- 캄보디아
- 몽골
- 카자흐스탄
- 러시아
- 네팔
- 미얀마

확인 포인트(공통):
1. 원본 비교 문항 추출 유무
2. 문항별 한국어 해석 유무
3. 모국어 보호 안내 유무
4. 리포트 Native 문구 공란/깨짐 여부

---

## 5) 커밋/푸시 가이드 (내일)
1. 본 트랙 파일만 스테이징
2. 빌드 재실행 후 푸시
3. 본 트랙 외 기존 변경 파일은 분리 커밋

권장 커밋 메시지 예시:
- feat(ocr): enforce verification completeness and multilingual fallback
- fix(verification): prevent empty original-comparison/native-support outputs

---

## 6) 현재 상태 요약
- API 키 문제는 해결됨(환경변수 경로 정상)
- 현재 남은 실제 리스크는 기능 구현이 아니라 데이터 품질 확인(재분석 후 샘플 검수)
- 내일은 문서 기준으로 바로 실행 가능

---

## 7) 2026-04-21 추가 개선 로그 (역할별 즉시 이해 + 무료 API 한도 보호)

### 7-1. 대시보드 역할별 보기 즉시 이해 보강
- `utils/roleViewModel.ts`
  - 관리자(`manager`) 전용 분기 신설/강화
    - `buildOverviewStatCards`
    - `buildDashboardSummaryCards`
    - `buildOperationalFocusCards`
    - `buildMobileInsightTabs`
    - `buildComparisonSectionMeta`
  - 신규 함수: `buildAudienceQuickGuide(...)`
    - 역할 전환 직후 3칸 가이드(지금 보는 대상/판단 기준/첫 클릭 행동)
- `pages/Dashboard.tsx`
  - 역할 토글 하단에 역할별 즉시 이해 가이드 카드 3개 노출
  - 기존 설명 1줄 + 버튼 구조를 보완해 전환 직후 행동 경로를 즉시 제시

### 7-2. 무료 API 한도(Vercel/Gemini) 보호 및 중단 복구
- `pages/OcrAnalysis.tsx`
  - 신규 체크포인트 키: `psi_ocr_batch_checkpoint_v1`
  - 일괄 재분석(`runBatchAnalysis`) 자동 재개 지원
    - 동일 실행 조건(제목/모드/총건수)에서 중단 인덱스부터 자동 재개
    - 성공/실패/서버성공/폴백성공/사전실패 등 집계값도 함께 복원
  - 무료 플랜 보호 로직 추가
    - 기본 대기 버퍼 상향(기본 5초, quota 회복 대기 상태면 8초)
    - `QUOTA` 실패가 반복될 경우(2회) 일괄 재분석 자동 중단
  - 정상 완주 시 체크포인트 자동 삭제 (중단/비정상 종료 시 유지)

### 7-3. 운영자 재개 지침 (프로그램 강제 종료 대비)
1. `OcrAnalysis` 진입 후 동일 버튼으로 재분석 재실행
2. 체크포인트가 남아 있으면 중단 지점부터 자동 재개됨
3. 자동 재개 메시지 예시:
   - `[제목] 이전 중단 지점(n/total)부터 자동 재개 중...`
4. 작업 완료 후 체크포인트는 자동 삭제됨

### 7-4. 오늘 기준 검증 결과
- `utils/roleViewModel.ts` 오류 없음
- `pages/Dashboard.tsx` 오류 없음
- `pages/OcrAnalysis.tsx` 오류 없음
- `npm run build` 성공

### 7-5. 3초 이해형 문구 미세튜닝 (2026-04-21 추가)
- `utils/roleViewModel.ts`
  - `DASHBOARD_AUDIENCE_META.description`를 역할별 행동 문구로 압축
    - 근로자: 누가 위험한지 보고 바로 행동
    - 관리자: 근거로 오늘 처리 순서 결정
    - 경영진: 추세로 자원 배분 우선순위 결정
  - `buildAudienceInsightMessage`를 1문장 행동 지시형으로 축약
    - 긴 설명 제거, 역할별 우선 행동만 즉시 제시

운영 메모:
- 역할 전환 직후 텍스트 이해 부담을 줄여, 상단 가이드 카드와 함께 첫 행동(클릭) 유도가 더 빠르게 작동하도록 조정함.
