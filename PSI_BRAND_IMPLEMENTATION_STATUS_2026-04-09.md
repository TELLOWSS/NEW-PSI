# PSI 브랜딩 구현 현황 및 다음 실행안

기준일: 2026-04-09
기준 버전: PSI v2.2.0
상태: 1차 구조 확장 완료 (주요 운영/분석/보고/설정/소개 화면 반영 완료)

## 1. 이번 토론의 최종 합의 문장

### 브랜드 한 문장
PSI는 현장의 신호를 정확하게 읽고, 사람을 보호하는 안전 파트너입니다.

### 페르소나 한 문장
깐깐하지만 내 편인 현장 안전 코치

### UX 한 문장
평가보다 해석, 지적보다 보완, 감시보다 보호

### UI 한 문장
차분하고 신뢰감 있는 화면 위에, 필요한 위험 신호만 또렷하게 드러내기

---

## 2. 지금까지 실제로 반영된 항목

### A. 브랜드 정의/문서화 완료
다음 문서를 통해 브랜드 원칙과 역할별 톤을 정리함.

- PSI_BRAND_VOICE_GUIDE.md
- PSI_ROLE_BASED_UX_COPY_GUIDE.md
- patent/10_프로그램_정체성_및_권리화_요약.md

문서화된 핵심 원칙:
- 금지어/권장어 분리
- 근로자/관리자/경영진 톤 분리
- 상태어를 하드코딩하지 않고 코드 상수로 관리
- 감시형 표현 대신 보호형/코칭형 표현 사용

### B. 브랜드 카피 1차 적용 완료
다음 주요 화면에서 강한 평가/실패/오류 중심 표현을 보완형 표현으로 정리함.

- pages/Introduction.tsx
- pages/OcrAnalysis.tsx
- pages/WorkerManagement.tsx
- pages/WorkerTraining.tsx
- pages/AdminTraining.tsx
- pages/Feedback.tsx
- pages/IndividualReport.tsx
- pages/Reports.tsx
- pages/FieldSafetyComplianceHub.tsx
- pages/SafetyBehaviorManagement.tsx
- pages/SiteIssueManagement.tsx
- pages/SafetyChecks.tsx
- pages/Dashboard.tsx
- pages/PerformanceAnalysis.tsx
- pages/PredictiveAnalysis.tsx
- pages/Settings.tsx
- components/shared/BestPracticeSyncBadge.tsx
- components/modals/RecordDetailModal.tsx

적용 방향:
- 실패 → 확인 필요 / 추가 확인 / 보완 검토
- 재시도 → 다시 확인 / 재분석
- 벌점/감시형 어휘 축소
- 사용자 다음 행동 제안 강화

### C. 상태어 시스템화 완료
공통 상태어/행동어 상수 파일을 도입함.

- utils/brandLabels.ts

핵심 상수:
- BRAND_STATUS_LABELS
- BRAND_ACTION_LABELS
- TRAFFIC_LIGHT_BRAND_LABELS
- VIOLATION_BRAND_LABELS

대표 매핑 예시:
- 확인 필요
- 확인 필요/보류
- 추가 확인/대기
- 보완 검토
- 즉시 확인 필요
- 조치 필요
- 조치 진행중
- 조치완료
- 스마트 재분석
- 직접 재분석
- 다시 확인

### E. 해석형 정보 구조 1차 확장 완료
다음 주요 화면에 `지금 상태 / 판단 근거 / 다음 행동` 구조와 공통 해석형 카드 패턴을 적용함.

- pages/OcrAnalysis.tsx
- components/modals/RecordDetailModal.tsx
- pages/WorkerManagement.tsx
- pages/AdminTraining.tsx
- pages/WorkerTraining.tsx
- pages/Feedback.tsx
- pages/SafetyChecks.tsx
- pages/SiteIssueManagement.tsx
- pages/SafetyBehaviorManagement.tsx
- pages/FieldSafetyComplianceHub.tsx
- pages/Reports.tsx
- pages/IndividualReport.tsx
- pages/Dashboard.tsx
- pages/PerformanceAnalysis.tsx
- pages/PredictiveAnalysis.tsx
- pages/Settings.tsx
- pages/Introduction.tsx

공통 기반:
- components/shared/InterpretationCardGrid.tsx

### D. 특허 문서 정합성 반영 완료
브랜드/표현 정책이 특허 문서 세트에도 반영됨.

특히 반영된 축:
- 역할 적응형 표현 정책
- 의미 상태 변환
- 메시지 정책 버전 관리
- 프로그램 정체성과 권리화 논리 정합성

---

## 3. 현재까지 완료로 봐도 되는 범위

다음 항목은 1차 구현 완료로 판단함.

### 완료 1) 브랜드 보이스 가이드
완료

### 완료 2) 금지어/권장어 체계
완료

### 완료 3) 상태 체계 통일
완료
- 공통 상태어 상수 도입
- 다수 페이지 연결 완료
- 주요 하드코딩 상태어 정리 완료

### 완료 4) 근로자/관리자/경영진 톤의 기본 분리
부분 완료
- 카피와 일부 화면 톤은 반영됨
- 그러나 구조적 레이아웃 분리는 아직 2차 과제임

### 완료 5) 브랜드와 특허 서사의 일치
완료

---

## 4. 아직 남아 있는 핵심 과제

지금부터는 카피 정리 단계를 넘어, 정보 구조와 컴포넌트 구조를 실제로 바꿔야 함.

### 다음 과제 1. 잔여 비-페이지 컴포넌트 정리
가장 우선순위가 높음.

목표:
- 페이지 단위 반영을 넘어, 모달/배지/요약 패널 등 비-페이지 컴포넌트까지 해석형 패턴 정리

현재 한계:
- 일부 보조 컴포넌트는 아직 기존 상태 배지/요약 블록 구조를 유지함
- 페이지는 정리됐지만 작은 상호작용 단위에서는 표현 편차가 남아 있음

우선 대상:
- components/shared/*
- components/* modal / badge / status panel 계열

### 다음 과제 2. 역할별 화면 구조 미세 분리
목표:
- 같은 데이터를 같은 방식으로 보여주지 않기

필요 방향:
- 근로자: 의미/행동 중심
- 관리자: 근거/우선순위/수정 중심
- 경영진: 추세/리스크/이행률 중심

필요 작업:
- 역할별 view model 분리
- 공통 컴포넌트라도 노출 순서와 설명 블록 분리

우선 대상:
- pages/Dashboard.tsx
- pages/Reports.tsx
- pages/WorkerManagement.tsx
- pages/FieldSafetyComplianceHub.tsx

### 다음 과제 3. Explainable UX 컴포넌트 고도화
목표:
- 점수만 보여주지 않고, 왜 이런 결과가 나왔는지 구조적으로 설명

현재 상태:
- `InterpretationCardGrid` 도입 완료

추가 권장 컴포넌트:
- StatusEvidenceActionPanel
- RoleAwareSummaryBlock
- WhyThisResultPanel
- NextActionChecklist

필요 이유:
- PSI는 판정형 AI가 아니라 해석형 파트너로 보여야 함

### 다음 과제 4. 디자인 토큰/세맨틱 토큰 확장
현재 상태:
- 상태 문구 상수는 도입됨

다음 단계:
- 상태별 색/배지/강조도까지 세맨틱 토큰으로 통일

필요 항목 예시:
- safe
- caution
- supplementaryReview
- attention
- immediateAttention
- completed

### 다음 과제 5. 섹션 렌더러 정리
목표:
- AI raw text를 그대로 뿌리지 않고 구조화된 UI 섹션으로 렌더링

필요 방향:
- 강점
- 보완점
- 위험 신호
- 관리자 메모
- 후속 행동

---

## 5. 다음 스프린트 우선순위

### P1. 비-페이지 컴포넌트 정리
가장 먼저 실행

실행 항목:
- 공통 배지/상태 패널 정리
- 모달/인라인 상태 블록을 세맨틱 토큰 기반으로 통일
- 반복되는 `상태/근거/행동` 블록을 더 작은 공통 컴포넌트로 추출

### P2. 역할별 대시보드 미세 분화
실행 항목:
- 근로자용/관리자용/경영진용 노출 순서 차등화
- 대시보드와 보고서 화면에서 역할별 우선 카드 분기

### P3. 세맨틱 토큰 확장
실행 항목:
- 상태 배지 컬러/톤/강조 강도 통일
- 상태별 컴포넌트 props 표준화

---

## 6. 바로 다음 구현 권장 순서

### Step 1
공통 인라인 상태 블록 컴포넌트 설계
- StatusEvidenceActionPanel
- WhyThisResultPanel

### Step 2
모달/보조 패널에 세맨틱 토큰 적용 확대

### Step 3
역할별 view model 분리
- workerViewModel
- managerViewModel
- executiveViewModel

---

## 7. 현재 시점 결론

지금까지 한 작업은 "브랜드 보이스와 해석형 정보 구조를 제품 전반에 심는 1단계"로서 충분히 의미 있음.

다음부터 진짜 중요한 단계는 다음 둘임.

1. 비-페이지 컴포넌트 구조 정리
2. 역할별 경험 미세 분리

즉, 이제부터는 페이지 확장보다 세부 컴포넌트 규칙과 역할별 렌더링 차이를 다듬는 작업이 핵심임.

---

## 8. 다음 작업 시작점 제안

다음 구현 시작 파일:
- components/shared/*
- components/modals/*

다음 작업 목표 문장:
"PSI의 세부 상호작용 단위까지도 평가 도구가 아니라 보호 중심 해석 도구처럼 느껴지게 정리한다."
