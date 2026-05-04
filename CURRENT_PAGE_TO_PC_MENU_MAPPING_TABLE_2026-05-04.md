# CURRENT PAGE TO PC MENU MAPPING TABLE (2026-05-04)

- 목적: 현재 존재하는 페이지들을 PC 후속 재구성 상위 메뉴에 임시 매핑해, 실제 재편 작업 시 기준표로 사용한다.
- 기준 문서:
  - [PC_FUNCTION_RECLASSIFICATION_TABLE_2026-05-04.md](PC_FUNCTION_RECLASSIFICATION_TABLE_2026-05-04.md)
  - [MOBILE_FIRST_IA_AND_PC_RESTRUCTURE_ROADMAP_2026-05-04.md](MOBILE_FIRST_IA_AND_PC_RESTRUCTURE_ROADMAP_2026-05-04.md)

---

## 1) 상위 메뉴 기준
1. 운영 대시보드
2. OCR 운영
3. AI 리스크 운영
4. 리포트/배포
5. 근로자/이력
6. 관리자/정책
7. 시스템 설정

---

## 2) 현재 페이지 매핑표

| 현재 페이지 | 임시 상위 메뉴 | 1차 역할 | 2차 역할 | 비고 |
| --- | --- | --- | --- | --- |
| Dashboard | 운영 대시보드 | 현황 요약 | 우선순위 판단 | PC 메인 홈 후보 |
| OcrAnalysis | OCR 운영 | OCR 실행 | 실패/재분석 관리 | 배치 중심 강화 필요 |
| PredictiveAnalysis | AI 리스크 운영 | 위험군 파악 | 조치 우선순위 | 비교 패널 확장 필요 |
| Reports | 리포트/배포 | 생성/조회 | 배포/다운로드 | 발송 흐름 결합 가능 |
| IndividualReport | 리포트/배포 | 개별 상세 | 결과 검토 | 근로자/이력과 연결 가능 |
| WorkerManagement | 근로자/이력 | 검색/관리 | 프로필/이력 | PC 핵심 관리화면 |
| WorkerTraining | 근로자/이력 | 교육 수행 | 이수 확인 | 모바일 병행 유지 |
| AdminTraining | 관리자/정책 | 교육 세션 운영 | 링크/대상 관리 | 관리자 중심 |
| SafetyChecks | 운영 대시보드 | 점검 현황 | 이행 누락 탐지 | 표 강화 필요 |
| SiteIssueManagement | 운영 대시보드 | 현장 이슈 | 조치 상태 관리 | 운영 패널화 권장 |
| SafetyBehaviorManagement | AI 리스크 운영 | 행동 개선 | 후속조치 추적 | 리스크 운영 하위 적합 |
| FieldSafetyComplianceHub | 관리자/정책 | 준수 상태 | 정책 연결 | 정책/감사 역할 |
| Settings | 시스템 설정 | 환경/권한 | 연동/규칙 | PC 전용 비중 큼 |
| Feedback | 시스템 설정 | 피드백 수집 | 개선 큐 관리 | 운영지원 성격 |
| Introduction | 시스템 설정 | 온보딩/가이드 | 소개 | 모바일 간략본 유지 |
| PerformanceAnalysis | 운영 대시보드 | 성과/지표 분석 | 비교 | 리포트와 연결 가능 |

---

## 3) 메뉴별 포함 페이지 묶음

### 3-1. 운영 대시보드
- Dashboard
- SafetyChecks
- SiteIssueManagement
- PerformanceAnalysis

### 3-2. OCR 운영
- OcrAnalysis
- OCR 실패/재분석 관련 상세 흐름

### 3-3. AI 리스크 운영
- PredictiveAnalysis
- SafetyBehaviorManagement

### 3-4. 리포트/배포
- Reports
- IndividualReport

### 3-5. 근로자/이력
- WorkerManagement
- WorkerTraining

### 3-6. 관리자/정책
- AdminTraining
- FieldSafetyComplianceHub

### 3-7. 시스템 설정
- Settings
- Feedback
- Introduction

---

## 4) 재편 시 우선 처리 페이지

### 최우선
- Dashboard
- OcrAnalysis
- PredictiveAnalysis
- Reports
- WorkerManagement

### 차순위
- SafetyChecks
- SiteIssueManagement
- PerformanceAnalysis
- AdminTraining

### 후순위
- Feedback
- Introduction
- 기타 부가 페이지

---

## 5) 실제 적용 시 주의점
- 한 페이지를 여러 상위 메뉴에 중복 노출하지 않기
- 관리자 기능은 PC에서만 충분히 열고 모바일에서는 최소화
- 리포트/배포는 분석과 분리해 독립 작업군으로 유지
- 근로자/이력은 검색성과 편집성을 최우선으로 설계

---

## 6) 다음 작업
1. App 기준 현재 `currentPage` 값을 상위 메뉴 기준으로 다시 매핑
2. PC 좌측 사이드바 정보구조 초안 작성
3. 메뉴별 숨김/이관/통합 대상 페이지 구분
