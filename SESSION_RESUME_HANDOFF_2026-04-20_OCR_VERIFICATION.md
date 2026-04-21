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

---

## 8) 2026-04-21 추가 점검 로그 (근로자 QR/국적별 MP3 오매칭 방지)

### 8-1. 점검 결과(원인)
- `pages/WorkerTraining.tsx`에서 세션 로드 시 언어를 `ko-KR`로 고정 초기화하는 효과가 존재했음.
- 동시에 오디오 선택 후보가 `선택 언어 → alias → 베트남어(vi-VN) → 영어(en-US) → 한국어(ko-KR)` 순서였고,
  선택 언어 음성이 없을 때 임의 첫 가용 오디오로 추가 폴백하는 로직이 있어,
  특정 국적(예: 러시아)에서 의도와 다른 언어 음성이 선택될 가능성이 확인됨.

### 8-2. 적용한 수정
- `pages/WorkerTraining.tsx`
  - 언어 초기화 로직을 세션당 1회로 제한하고, 우선순위를 아래로 변경:
    1) URL `lang`
    2) URL `nationality`
    3) 세션 가용 언어(`ko-KR`/`en-US` 우선)
    4) 가용 첫 언어
  - 세션 로드 시 `ko-KR` 강제 지정 제거.
  - 오디오 선택 로직에서 `vi-VN` 강제 폴백 제거.
  - 선택 언어/안전 폴백(`en-US`, `ko-KR`) 외에는 자동 오디오 연결 금지(임의 첫 오디오 폴백 제거).

### 8-3. 기대 동작
- 러시아 근로자처럼 비기본 언어 사용자의 경우, 해당 언어 오디오가 없으면 임의 타국가 음성이 자동 재생되지 않음.
- 관리자가 제공한 `lang` 또는 `nationality` 쿼리가 있으면 해당 정보가 초기 언어 선택에 반영됨.

### 8-4. 검증
- `npm run build` 성공(회귀 오류 없음).
- 추가 운영 검증 권장:
  - 실제 링크 시나리오 4건(`ko`, `vi`, `cmn`, `ru`)에서 초기 언어/오디오 선택 결과를 현장 재확인.

---

## 9) 2026-04-21 추가 로그 (대시보드 용어 롤백 + QA 완료)

### 9-1. 용어 롤백 배경
- 현장 운영 맥락(골조회사 최적화) 기준에서 `개선 필요한 분야` 표현이 도메인 적합성이 낮아,
  기존 용어인 `취약 공종`으로 즉시 롤백 결정.

### 9-2. 적용한 수정
- `pages/Dashboard.tsx`
  - 아래 문구를 `취약 공종` 기준으로 롤백:
    - `개선 필요한 분야 바로가기...` → `취약 공종 바로가기...`
    - `먼저 개선 필요한 분야 또는 팀을 선택하세요.` → `먼저 취약 공종 또는 팀을 선택하세요.` (3개 분기)

### 9-3. 품질 검증(QA)
- 정적/타입/컨트랙트 검증: `npm run verify:fast` 통과
- 단위 테스트: `npm run test` 통과 (34/34)
- 프로덕션 빌드: `npm run build` 통과

### 9-4. 다음 세션 시작 체크(누락 방지)
1. `pages/Dashboard.tsx`에서 `취약 공종` 용어 유지 상태 재확인
2. 골조 현장 기준 용어(예: 레이더/개인별 트렌드) 추가 정제 필요 여부 점검
3. 변경 후 스모크(대시보드 > 팀 비교 > 개인 트렌드) 1회 재검증

---

## 10) 2026-04-21 추가 로그 (골조 현장형 용어 정제)

### 10-1. 적용 배경
- 골조 현장 운영 맥락에서 `레이더`, `개인별 트렌드` 표현이 기술 용어 중심으로 읽혀
  현장 실무자 기준의 직관 문구로 정제 진행.

### 10-2. 적용한 수정
- `pages/Dashboard.tsx`
  - `레이더` → `역량 분포도`
  - `개인 추이` / `개인별 트렌드` → `개인별 평가 기록`
  - 섹션 주석/안내 문구: `개인추이 해석 기준` → `개인별 평가 기록 해석 기준`
- `pages/PerformanceAnalysis.tsx`
  - `시계열, 레이더, 히트맵...` → `시계열, 역량 분포도, 히트맵...`
- `components/charts/WorkerTrendPanel.tsx`
  - 상단 주석/빈 상태 문구의 `개인별 트렌드` 표현을 `개인별 평가 기록`으로 통일

### 10-3. 검증 결과
- `npm run verify:fast` 통과
- `npm run build` 통과

### 10-4. 다음 체크
1. 현장 사용자 대상 문구 체감 확인(역량 분포도/개인별 평가 기록)
2. 필요 시 `공종` 관련 보조 설명(툴팁)만 추가 검토

---

## 11) 2026-04-21 추가 로그 (공종 용어 보조 설명 최소 적용)

### 11-1. 적용 배경
- `공종` 용어는 유지하되, 초사용자/신규 사용자 혼선을 줄이기 위해 최소 보조 설명을 병기.

### 11-2. 적용한 수정
- `pages/Dashboard.tsx`
  - 비교 근거 문구에 `공종(작업 종류)` 병기 (3개 카드 분기)
  - 비교 섹션 상단 배지 `공종` → `공종(작업 종류)`
- `pages/PerformanceAnalysis.tsx`
  - 핵심 안내 문구에 `공종(작업 종류)` 병기

### 11-3. 검증 결과
- `npm run verify:fast` 통과
- `npm run build` 통과

### 11-4. 다음 세션 체크
1. 현장 관리자 대상 A/B 반응 확인: `공종` 단독 vs `공종(작업 종류)` 병기
2. 병기 문구 길이로 모바일 줄바꿈 부담이 있는지 점검

---

## 12) 2026-04-21 추가 로그 (모바일 가독성 미세 보정)

### 12-1. 적용 배경
- `공종(작업 종류)` 병기로 인한 모바일 배지 줄바꿈 부담을 줄이기 위해 반응형 라벨 축약 적용.

### 12-2. 적용한 수정
- `pages/Dashboard.tsx`
  - 비교 섹션 배지 라벨 반응형 처리
    - 모바일: `공종`
    - `sm` 이상: `공종(작업 종류)`
  - 비교 근거 문구 3개를 `·` 구분자로 압축해 같은 의미에서 길이만 축소

### 12-3. 검증 결과
- `npm run build` 통과

### 12-4. 다음 세션 체크
1. 실제 모바일(320px/360px)에서 공종 배지 한 줄 유지 여부 확인
2. 비교 근거 카드 문구 가독성(1~2줄) 현장 피드백 수집

---

## 13) 2026-04-21 추가 로그 (모바일 QA 체크리스트 확장)

### 13-1. 적용 내용
- `MOBILE_VIEWPORT_QA_CHECKLIST.md` 확장
  - 대상 뷰포트 추가: `320x568`, `360x800`
  - Dashboard 전용 항목 추가:
    - 팀 비교 상단 배지 1줄 유지 여부 (`공종` 라벨)
    - 비교 근거 카드 문구 2줄 내 가독성 유지 여부
  - 결과 기록 템플릿에 320/360 결과 블록 추가

### 13-2. 목적
- `공종` 보조 문구 반영 이후 모바일 초소형 화면에서 줄바꿈/가독성 누락을 사전 차단.

---

## 14) 2026-04-21 추가 로그 (Dashboard 3분 점검 스크립트 추가)

### 14-1. 적용 내용
- `MOBILE_VIEWPORT_QA_CHECKLIST.md`에 `Dashboard 3분 점검 스크립트` 섹션 추가
  - 320x568 기준 시작 → 상단 가독성 → 비교 카드 → 드릴다운 → 360x800 재확인 순서
  - 현장 점검자가 3분 내 핵심 항목만 빠르게 확인하도록 단계형 체크로 구성

### 14-2. 기대 효과
- 모바일 QA를 "문서 읽기"가 아니라 "순서 실행" 방식으로 전환해 누락률 감소
- 교대/인수인계 상황에서도 동일 절차로 재현 가능한 점검 흐름 확보

---

## 15) 2026-04-21 추가 로그 (3분 점검 스크립트 범위 확장)

### 15-1. 적용 내용
- `MOBILE_VIEWPORT_QA_CHECKLIST.md`에 아래 섹션 추가:
  - `8) OcrAnalysis 3분 점검 스크립트`
  - `9) WorkerManagement 3분 점검 스크립트`
- 각 스크립트는 `320x568` 시작 → 핵심 UI 확인 → `360x800` 재확인 → 콘솔 에러 확인 순서로 통일.

### 15-2. 목적
- Dashboard에만 있던 실행형 점검 절차를 OCR/근로자관리 화면까지 확장해, 현장 QA를 동일한 시간·절차로 표준화.
