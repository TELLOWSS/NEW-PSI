# 역할별 언어 체계 및 정보 노출 재설계 실행계획 (2026-06-04)

## 0) 왜 이 작업이 필요한가
- 현재 저장소에는 실무자 언어 가이드와 역할별 정보 분리 원칙이 이미 존재한다.
- 그러나 실제 제품에는 메뉴/진입점 수준의 분리만 일부 적용되어 있고, 화면 본문 카드/설명/운영 패널/QA 패널까지는 정책이 내려가지 않았다.
- 그 결과 다음 문제가 반복된다.
  - 개발자/운영 용어가 실무자 화면 본문에 남아 있음
  - 관리자용 상세 정보가 실무자 흐름 안에 그대로 노출됨
  - 같은 의미의 정보를 역할별로 다르게 감추지 못해 과밀 화면이 유지됨

## 1) 현재 확인된 기반 자산

### 이미 있는 것
- 역할별 정보 구조 문서
  - `INFORMATION_ARCHITECTURE_BY_ROLE_2026-05-28.md`
- 실무자 정보 최소화 원칙
  - `PRACTITIONER_UI_INFORMATION_MINIMIZATION_PLAN_2026-05-07.md`
- 역할별 카피 가이드
  - `PSI_ROLE_BASED_UX_COPY_GUIDE.md`
- 메뉴/타이틀 역할 모드 기반 구조
  - `config/routeMeta.ts`
  - `components/Layout.tsx`
  - `components/Sidebar.tsx`
  - `utils/userRolePresetUtils.ts`

### 아직 부족한 것
- 화면 내부 섹션 단위의 가시성 정책
- 전 화면 공통 용어 사전의 강제 적용 구조
- 실무자 금지 용어 자동 점검
- 실무자/관리자/개발자용 블록을 나누는 공통 가드 컴포넌트

## 2) 목표 상태

### 실무자 모드
- 오늘 해야 할 일, 우선순위, 다음 행동, 현재 상태만 우선 노출
- QA, 런로그, 폴백, 워크플로우, 버전, 감사, 운영 백로그, 개발자 메시지 비노출
- 기술 용어는 현장 행동 언어로 치환

### 관리자 모드
- 실무자 정보 + 판단 근거 + 검토 순서 + 운영 상세 노출
- 단, 개발 진단 용어와 내부 구현 상세는 비노출

### 개발자 모드
- 전체 운영 정보 + 진단 정보 + 내부 연결 상태 노출 허용

## 3) 설계 원칙
1. 용어 치환과 정보 숨김을 분리한다.
   - 말만 바꾸지 않는다.
   - 보여줄 정보 자체를 역할별로 재조정한다.

2. 화면이 아니라 블록 단위로 관리한다.
   - 카드
   - NoticeCallout
   - 고급 패널
   - QA/런로그/감사/버전 블록

3. 실무자에게는 기본 숨김이 아니라 기본 비노출을 우선 적용한다.
   - 필요 시 `운영 상세` 진입점 아래로 이동

4. 새 문구는 화면 안에서 직접 쓰지 않고 중앙 사전에서 가져온다.

5. 정적 점검으로 금지 용어를 관리한다.

## 4) 구현 아키텍처

### A. 용어 레이어
- 신규 파일 제안
  - `config/uiCopyPolicy.ts`
  - `config/uiAudiencePolicy.ts`
  - `utils/practitionerTerms.ts`

### B. 화면 섹션 레이어
- 신규 공통 구조 제안
  - `AudienceGuard`
  - `SectionVisibilityGuard`
  - `RoleAwareText`

### C. 정적 검증 레이어
- practitioner forbidden terms를 메뉴 라벨 수준이 아니라 화면 본문 텍스트까지 확대 검사
- 스캔 대상
  - `pages/**`
  - `components/**`

## 5) 단계별 실행 계획

### Phase 1. 정책 확정 (1~2일)
#### 작업
- 실무자/관리자/개발자 용어 사전 확정
- 금지 용어 목록 확장
- 화면 블록 분류 기준 확정

#### 산출물
- 역할별 언어 사전 v1
- 정보 노출 정책 매트릭스 v1
- 화면 블록 인벤토리 템플릿

#### 완료 기준
- 새 문구 생성 시 어디에 등록해야 하는지 단일 규칙 존재

### Phase 2. 공통 인프라 구축 (2~3일)
#### 작업
- `AudienceGuard` 도입
- `routeMeta`를 메뉴 단위에서 섹션 단위 정책으로 확장
- 역할별 텍스트 선택 유틸 추가
- 금지 용어 정적 검사 스크립트 초안 추가

#### 적용 대상
- `config/routeMeta.ts`
- `components/Layout.tsx`
- `components/Sidebar.tsx`
- 공통 shared components

#### 완료 기준
- 한 화면 안에서도 역할별 블록 비노출이 가능해짐

### Phase 3. 1차 고위험 화면 정리 (3~5일)
#### 우선순위
1. `pages/Introduction.tsx`
2. `pages/Dashboard.tsx`
3. `pages/FieldSafetyComplianceHub.tsx`

#### 목적
- 실무자 모드 기준으로 QA/런로그/개발자 메시지/운영 집중도/백로그/폴백 등 제거 또는 운영 상세로 이동

#### 완료 기준
- 실무자 모드에서 개발자성 단어 및 운영 진단 블록이 본문에서 사라짐

### Phase 4. 2차 운영 화면 정리 (3~5일)
#### 대상
- `pages/OcrAnalysis.tsx`
- `pages/PredictiveAnalysis.tsx`
- `pages/IndividualReport.tsx`

#### 목적
- 분석형 화면을 실무자 행동 흐름 중심으로 재정렬
- 관리자/운영/진단 정보는 단계적 노출로 분리

### Phase 5. 정착 및 계측 (지속)
#### 측정 항목
- 첫 행동까지 시간
- 확장 버튼 사용률
- 실무자 모드 내 금지 용어 검출 건수
- "무엇을 먼저 해야 하는지 모르겠다" 피드백 빈도

## 6) 화면별 1차 우선 적용 기준

### Introduction
- QA/런로그/검증 상태는 실무자 비노출
- 개발자 메시지는 실무자 비노출
- 소개 화면은 서비스 소개와 핵심 진입만 남김

### Dashboard
- 관리자/감사/재분석/승인 백로그성 요약은 실무자 비노출
- 고급 모드는 실무자에게 `상세 보기` 등 현장형 표현으로 재정의
- 운영 집중도 표는 관리자 전용 상세로 이동

### FieldSafetyComplianceHub
- harness, fallback, approval backlog 성격의 내부 상태 요약은 관리자/개발자 전용으로 분리

## 7) 정적 점검 규칙 초안
- practitioner 금지 단어
  - harness
  - workflow
  - gateway
  - payload
  - trace
  - mock
  - API
  - fetch
  - Supabase
  - debug
  - stack
  - runlog
  - QA
  - fallback
  - schema
  - migration
  - prompt version
  - policy version
  - rule version

## 8) 완료 판정 기준
1. 실무자 모드에서 기술/운영 진단 단어 0건
2. 실무자 첫 화면의 즉시 행동 버튼 2개 이하
3. 관리자 전용 상세는 실무자 모드에서 블록 자체 비노출
4. 역할별 문구가 중앙 정책에서 관리됨
5. 화면별 감사 문서와 실제 UI가 일치함

## 9) 바로 다음 작업
1. `Introduction` / `Dashboard` 블록 감사 결과를 기반으로 실제 비노출 정책표 작성
2. `AudienceGuard`와 role-aware copy registry 초안 설계
3. 실무자 금지 용어 자동 점검 스크립트 설계