# PSI 세션 재개 핸드오프

기준일: 2026-04-10  
목적: 프로그램 종료 후 다음 세션에서 이 파일만 열어도 즉시 작업을 재개할 수 있도록 현재 상태와 다음 행동을 고정한다.

---

## 1. 오늘 작업 결론

오늘은 하네스 운영 가시성을 주요 운영/분석/설정 화면 전반에 확장했고, 실환경 persistence 검증을 위한 준비 레이어까지 정리했다.

핵심 상태는 다음과 같다.

- UI 레벨 하네스 노출: 대부분 완료
- persistence 진단 메타: 구현 완료
- 설정 화면에서 실환경 검증 시작점: 구현 완료
- 다음 핵심 작업: 실제 persisted 응답 검증

---

## 2. 다음 세션에서 가장 먼저 할 일

가장 먼저 [pages/Settings.tsx](pages/Settings.tsx) 화면으로 이동한다.

그 다음 아래 순서로 진행한다.

1. `환경 상태 점검` 버튼 실행
2. `최근 workflow run 진단 새로고침` 버튼 실행
3. 결과를 아래 5개 케이스로 분류
   - 직접 조회 성공
   - 원본 레코드 기준 조회
   - 실데이터 미발견
   - 경고 포함
   - 조회 실패

이 순서가 현재 가장 안전한 재시작 경로다.

---

## 3. 이미 구현된 핵심 항목

### 3.1 UI/운영 화면 하네스 확장 완료
- [pages/Dashboard.tsx](pages/Dashboard.tsx)
- [pages/FieldSafetyComplianceHub.tsx](pages/FieldSafetyComplianceHub.tsx)
- [pages/SiteIssueManagement.tsx](pages/SiteIssueManagement.tsx)
- [pages/Reports.tsx](pages/Reports.tsx)
- [pages/WorkerManagement.tsx](pages/WorkerManagement.tsx)
- [pages/PredictiveAnalysis.tsx](pages/PredictiveAnalysis.tsx)
- [pages/PerformanceAnalysis.tsx](pages/PerformanceAnalysis.tsx)
- [pages/SafetyBehaviorManagement.tsx](pages/SafetyBehaviorManagement.tsx)
- [pages/SafetyChecks.tsx](pages/SafetyChecks.tsx)
- [pages/Settings.tsx](pages/Settings.tsx)

### 3.2 QR/공유/복원 보강 완료
- [utils/qrUtils.ts](utils/qrUtils.ts)
- [pages/IndividualReport.tsx](pages/IndividualReport.tsx)
- [pages/WorkerManagement.tsx](pages/WorkerManagement.tsx)

### 3.3 persistence/진단 레이어 보강 완료
- [lib/server/harness/persistence.ts](lib/server/harness/persistence.ts)
- [api/harness/workflow-status.ts](api/harness/workflow-status.ts)
- [api/harness/persistence-health.ts](api/harness/persistence-health.ts)
- [services/harnessService.ts](services/harnessService.ts)
- [components/modals/RecordDetailModal.tsx](components/modals/RecordDetailModal.tsx)

### 3.4 설정 화면에서 검증 가능하도록 연결 완료
- [pages/Settings.tsx](pages/Settings.tsx)
- [App.tsx](App.tsx)

---

## 4. 현재 진단 화면에서 볼 수 있는 것

[pages/Settings.tsx](pages/Settings.tsx) 에서 현재 확인 가능:

### 운영 요약
- 저장 연결
- 승인 백로그
- 즉시 보호
- 폴백·저장 대기

### persistence 환경 상태
- 환경변수
- 키 모드 (`service_role` / `anon` / `missing`)
- 테이블 준비
- workflow runs 건수
- events / approvals 건수

### 최근 workflow run 진단
- 직접 조회 성공
- 원본 레코드 기준 조회
- 실데이터 미발견
- 경고 포함
- 조회 실패

---

## 5. 내일 실제로 검증할 포인트

### 1차: 환경 문제 분리
다음을 먼저 본다.

- `envConfigured`
- `keyMode`
- `tablesReady`
- `workflowRuns`
- `workflowEvents`
- `humanApprovals`

### 2차: run 단위 persisted 검증
다음을 본다.

- `diagnostics.resolvedBy`
- `diagnostics.found`
- `diagnostics.sourceRecordId`
- `diagnostics.eventCount`
- `diagnostics.approvalCount`
- `diagnostics.timelineCount`

### 3차: 케이스 분류 후 조치
- `실데이터 미발견`이면 마이그레이션/저장 경로 확인
- `source_record_id` 보정이면 lookup 전략 정상 여부 확인
- `조회 실패`면 인증/환경/API 응답 확인
- `경고 포함`이면 warning 문구 원인 추적

---

## 6. 다음으로 바로 볼 파일

재시작 직후 우선순위:

1. [SESSION_RESUME_HANDOFF_2026-04-10.md](SESSION_RESUME_HANDOFF_2026-04-10.md)
2. [pages/Settings.tsx](pages/Settings.tsx)
3. [services/harnessService.ts](services/harnessService.ts)
4. [api/harness/persistence-health.ts](api/harness/persistence-health.ts)
5. [api/harness/workflow-status.ts](api/harness/workflow-status.ts)
6. [lib/server/harness/persistence.ts](lib/server/harness/persistence.ts)
7. [NEXT_SESSION_HANDOFF_2026-04-09.md](NEXT_SESSION_HANDOFF_2026-04-09.md)

---

## 7. 참고 문서

- [NEXT_SESSION_HANDOFF_2026-04-09.md](NEXT_SESSION_HANDOFF_2026-04-09.md)
- [PSI_BRAND_IMPLEMENTATION_STATUS_2026-04-09.md](PSI_BRAND_IMPLEMENTATION_STATUS_2026-04-09.md)
- [PSI_HARNESS_ENGINEERING_ARCHITECTURE_IMPLEMENTATION_STRATEGY_2026-04-10.md](PSI_HARNESS_ENGINEERING_ARCHITECTURE_IMPLEMENTATION_STRATEGY_2026-04-10.md)

---

## 8. 재개용 한 줄 프롬프트

다음 세션에서 아래처럼 시작하면 된다.

> `SESSION_RESUME_HANDOFF_2026-04-10.md` 기준으로 이어서 진행. 먼저 Settings에서 하네스 persistence 환경 상태와 최근 workflow run persisted 진단부터 검증.
