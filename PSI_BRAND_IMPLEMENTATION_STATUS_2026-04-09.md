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
- PSI_HARNESS_ENGINEERING_ARCHITECTURE_IMPLEMENTATION_STRATEGY_2026-04-10.md
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
- components/shared/StatusEvidenceActionPanel.tsx
- components/shared/SummaryMetricGrid.tsx
- components/shared/ControlPanelCard.tsx
- components/shared/ActionButton.tsx
- components/shared/StatusBadge.tsx
- components/shared/SectionPanelCard.tsx
- components/shared/OperationalPreviewCard.tsx
- components/shared/NoticeCallout.tsx
- components/shared/TableStateRow.tsx
- components/shared/EmptyStatePanel.tsx
- components/shared/WhyThisResultPanel.tsx
- components/shared/NextActionChecklist.tsx
- components/shared/toneVariants.ts

최근 공통 props 정리:
- SectionPanelCard에 `eyebrow`, `headerAction` props를 추가해 복합 헤더 오버라이드를 축소
- SectionPanelCard에 `variant` props를 추가해 반복 패널 컨테이너 톤을 shared tone 상수와 연결
- SectionPanelCard accent preset(`indigo` / `sky` / `indigoSoft` / `cyanSoft` / `fuchsiaSoft` / `skySoft`)을 추가해 비교/작업 흐름 패널 클래스 중복을 추가 축소
- SectionPanelCard에 `roseDarkSoft` / `emeraldDarkSoft` preset을 추가해 다크 테마 빠른 실행 액션 그룹도 공통 패널로 정리
- SectionPanelCard에 `glassDark` preset을 추가해 다크 테마 빠른 실행 바깥 래퍼도 공통 패널로 정리
- SectionPanelCard에 `indigoGradientSoft` preset을 추가해 메시지 이력 인디고 그라데이션 래퍼도 공통 패널로 정리
- OperationalPreviewCard에 `eyebrow`, `leading`, `headerClassName` 계열 props를 추가해 복합 카드 헤더 오버라이드를 축소
- OperationalPreviewCard에 `variant` props를 추가해 반복 카드 컨테이너 톤을 shared tone 상수와 연결
- OperationalPreviewCard에 `roseSoft` preset을 추가해 실패 미리보기 카드의 경고 톤 래퍼를 공통 처리
- OperationalPreviewCard에 `slateSoft` preset을 추가해 체크리스트/보조 운영 카드의 중성 톤 래퍼를 공통 처리
- OperationalPreviewCard에 `emeraldSoftCompact` / `roseSoftCompact` preset을 추가해 중복 그룹 보존/삭제 후보 하위 카드도 공통 처리
- ActionButton을 추가해 반복되는 소형 액션 버튼의 톤과 기본 레이아웃을 공통 처리
- ActionButton에 `slateSolid` / `indigoSolid` / `emeraldSolid` variant를 추가해 모달 상단/확정 액션도 공통 처리
- ActionButton에 `glassDark` variant를 추가해 다크 모달 상단 액션도 공통 처리
- StatusBadge를 추가해 반복되는 소형 상태/우선순위/라벨 배지의 톤을 공통 처리
- StatusBadge에 `glassDark` / `slateDarkSoft` variant를 추가해 다크 미리보기 영역 배지도 공통 처리
- NoticeCallout에 `variant`, `eyebrow` props를 추가해 톤별 스타일/상단 라벨 오버라이드를 축소
- NoticeCallout에 `glassDark` variant를 추가해 다크 보조 메모/정합성 안내도 공통 처리
- EmptyStatePanel에 `variant` props를 추가해 기본/화이트/에메랄드 톤 오버라이드를 축소
- NoticeCallout / EmptyStatePanel / SectionPanelCard / OperationalPreviewCard의 톤 variant를 shared tone 상수로 분리하고 `default` 대신 `white` / `slate` 네이밍을 유지하는 방향으로 정리

최근 추가 반영:
- pages/WorkerManagement.tsx 운영 대시보드/발송 이력 수치 카드 `SummaryMetricGrid` 공통화
- pages/WorkerManagement.tsx 등록 근로자/메시지 이력 검색·필터 영역을 `ControlPanelCard`로 정리
- pages/WorkerManagement.tsx 운영 메시지/이력 차트 래퍼를 `SectionPanelCard`로 정리
- pages/WorkerManagement.tsx 재발송 큐 행 카드와 발송 방식 상세 카드를 `OperationalPreviewCard`로 정리
- pages/WorkerManagement.tsx API 절약 모드 수치 블록을 `SummaryMetricGrid` + `SectionPanelCard`로 정리
- pages/WorkerManagement.tsx 좌측 근로자 선택 목록 카드를 `OperationalPreviewCard`로 정리
- pages/WorkerManagement.tsx 상단 안내/경고 박스와 운영 집계 준비 안내를 `NoticeCallout`으로 정리
- pages/WorkerManagement.tsx 등록 근로자 목록 상단의 중복/그룹 요약 3칸도 `SummaryMetricGrid`로 정리
- pages/WorkerManagement.tsx 사진 등록 최적 작업 모드와 사진 미등록자 빠른 등록 큐를 `SectionPanelCard` / `OperationalPreviewCard`로 정리
- pages/WorkerManagement.tsx 전화번호 연동 안내, 운영 집계 오류/로딩, 개인 문자 이력 오류/스키마 안내를 `NoticeCallout`으로 정리
- pages/WorkerManagement.tsx 중복 그룹 미리보기와 재발송 우선순위 가이드를 `SectionPanelCard` / `OperationalPreviewCard`로 정리
- pages/WorkerManagement.tsx 선택 근로자 리포트 일괄 문자 발송 영역을 `SectionPanelCard`로 정리
- pages/WorkerManagement.tsx 재발송 큐의 `QUICK RETRY` 안내와 API 절약 모드 안내도 `NoticeCallout`으로 추가 정리
- pages/WorkerManagement.tsx 삭제 실행 취소 박스와 중복 그룹 내부 보존/삭제 후보 하위 카드도 shared component로 추가 정리
- pages/WorkerManagement.tsx 메시지 이력 영역 바깥 인디고 그라데이션 컨테이너도 `SectionPanelCard` 기반으로 정리
- pages/WorkerManagement.tsx 메시지 이력 상단 액션 버튼 일부도 `ActionButton`으로 정리
- pages/WorkerManagement.tsx 사진 필요/우선순위/차단 원인/중복 그룹 라벨 배지도 `StatusBadge`로 정리
- pages/WorkerManagement.tsx 문자 이력/등록 근로자 테이블의 로딩·빈 상태·오류 행을 `TableStateRow`로 정리
- pages/WorkerManagement.tsx 인쇄/플립 미리보기, 재발송 큐 빈 상태, 문자 이력/좌측 목록 빈 상태를 `EmptyStatePanel`로 정리
- pages/WorkerManagement.tsx 직접 등록 패널과 재발송 큐 래퍼를 `SectionPanelCard`로 정리
- pages/WorkerManagement.tsx 안내/오류 콜아웃 일부를 `NoticeCallout`의 `variant` / `eyebrow` 기반으로 단순화
- pages/OcrAnalysis.tsx 행 요약 블록 및 최근 운영 조치 상세를 `StatusEvidenceActionPanel`로 추가 정리
- pages/OcrAnalysis.tsx 고급 필터/정렬 카드 래퍼를 `ControlPanelCard`로 정리
- pages/OcrAnalysis.tsx 실패 상세 조치 섹션과 2차 재분석 대상 미리보기를 `SectionPanelCard` / `OperationalPreviewCard`로 정리
- pages/OcrAnalysis.tsx 최근 재분석 결과 숫자 블록을 `SummaryMetricGrid`로 정리
- pages/OcrAnalysis.tsx 상단 운영 현황 요약 4칸과 다크 테마 재분석 진단 5칸도 `SummaryMetricGrid`로 정리
- pages/OcrAnalysis.tsx 실패 카드/체크리스트의 소형 액션 버튼 일부도 `ActionButton`으로 정리
- pages/OcrAnalysis.tsx 실패 미리보기 에러 타입 배지도 `StatusBadge`로 정리
- components/modals/RecordDetailModal.tsx 역량 지표 카드 점수 배지를 `StatusBadge`로 정리
- components/modals/RecordDetailModal.tsx 모바일 상단 액션, 승인/보완 버튼, 증빙 내보내기 버튼 일부를 `ActionButton`으로 정리
- components/modals/WorkerHistoryModal.tsx 안전 수준/역할/특수 임무 배지를 `StatusBadge`로 정리
- components/modals/WorkerHistoryModal.tsx 상세 보기/저장/삭제 버튼을 `ActionButton`으로 정리
- components/modals/WorkerHistoryModal.tsx 이력 목록 카드와 빈 상태를 `OperationalPreviewCard` / `EmptyStatePanel` 기반으로 정리
- components/modals/WorkerHistoryModal.tsx 선택 기록 요약과 수정 섹션을 `SectionPanelCard` / `SummaryMetricGrid` 기반으로 정리
- pages/Dashboard.tsx 역할별 보기 상태(`근로자` / `관리자` / `경영진`)와 role-aware 요약 카드를 도입해 1차 view model 분리 기반을 마련
- pages/Dashboard.tsx 역할별 통계 카드/빠른 실행/공종 비교 해설을 분기하고 근로자 관점에서 식별 불가 데이터 배너를 숨겨 노출 순서 차등화를 확장
- pages/Dashboard.tsx 운영 포커스 카드, 하단 차트 배치 순서, 모바일 비교 탭/비교 안내 문구를 역할별로 다시 분기해 하단 분석 영역까지 role-aware 구조를 확장
- PSI_HARNESS_ENGINEERING_ARCHITECTURE_IMPLEMENTATION_STRATEGY_2026-04-10.md 하네스 엔지니어링 관점의 Guardrails/HITL/상태 머신/감사 추적 로드맵을 현재 PSI 스택 기준으로 문서화
- types.ts에 `workflowState` / `riskDecision` / `approvalState` 타입과 `WorkerRecord` 필드를 추가해 하네스 상태 분리 기반을 마련
- lib/server/harness/workflowTypes.ts, inputValidators.ts, contextAssembler.ts, outputValidators.ts, ruleEngine.ts, router.ts, auditLogger.ts, agents/*에 하네스 서버 레이어 초안을 추가
- 초기에는 `api/harness/analyze.ts` 중심으로 입력 검증 → 컨텍스트 스냅샷 → 결정론적 분석/검증 → 가드레일 판정 → 감사 이벤트 반환 흐름의 진입점을 추가했고,
- 현재 운영 구조는 `api/gateway.ts` + `lib/server/harness/handlers/*` 기준으로 승인/2차 재분석/상태 조회를 통합 처리한다.
- supabase_harness_workflow_migration.sql에 `ai_workflow_runs` / `ai_workflow_events` / `ai_guardrail_overrides` / `ai_context_snapshots` / `ai_human_approvals` / 버전 스냅샷 테이블 마이그레이션 초안을 추가
- lib/server/harness/persistence.ts를 추가해 하네스 워크플로우 실행/컨텍스트/이벤트/오버라이드/인간 승인 저장과 상태 조회를 Supabase 기준으로 공통화
- 현재 하네스 공통 핸들러(`lib/server/harness/handlers/analyze.ts`, `approve.ts`, `reanalyze.ts`, `workflowStatus.ts`)가 Supabase 마이그레이션 테이블이 존재할 경우 실제 `ai_workflow_*` 데이터 저장/조회까지 수행하고, 미적용 환경에서는 경고만 남기고 기능은 계속 동작하도록 보강
- pages/OcrAnalysis.tsx 재분석/정상분류 흐름에서 `workflowState` / `riskDecision` / `approvalState`를 함께 갱신하고 실패 레코드 카드에 하네스 상태/위험/승인 배지를 노출
- pages/OcrAnalysis.tsx 신규 파일 분석 성공 시 `analyzeHarnessRecord()`를 호출해 `workflowRunId`와 하네스 결정 상태를 즉시 동기화
- pages/OcrAnalysis.tsx OCR 재분석 성공/실패 시 `reanalyzeHarnessRecord()`를 호출해 persistence 레이어와 실제 2차 재분석 상태를 연결
- types.ts에 `harnessPersistenceWarning` 필드를 추가해 하네스 저장 경고를 레코드 단위로 추적 가능하게 정리
- pages/OcrAnalysis.tsx 실패 레코드 해석 뷰와 개별 실패 카드에 하네스 persistence 연결 상태(`저장 연결됨` / `폴백 동작중` / `저장 대기`) 배지와 경고 문구를 노출
- api/gateway.ts에 `harness.analyze` / `harness.approve` / `harness.reanalyze` / `harness.workflow-status` 라우팅을 추가하고 `gatewayAction` 경로를 지원해 공용 게이트웨이 연동 기반을 마련
- 이후 `harness.persistence-health`까지 gateway 액션으로 편입해 현재는 하네스 전용 개별 함수 없이 gateway 중심 구조로 정리
- services/harnessService.ts에 하네스 분석/승인/재분석/상태 조회용 프론트엔드 게이트웨이 래퍼를 추가하고 `postAdminJson` 기반 관리자 인증 헤더를 공용 적용
- components/modals/RecordDetailModal.tsx 승인/반려 흐름을 `approveHarnessRecord()`와 연결하고 `recordId` / `workflowRunId` / `workflowState` / `riskDecision` / `approvalState` / `secondPassStatus`를 승인 이력과 함께 동기화
- components/modals/RecordDetailModal.tsx가 `fetchHarnessWorkflowStatus()`를 호출해 하네스 상태를 새로고침하고 승인 패널/타임라인 영역에 워크플로우·위험·승인 배지와 저장 타임라인을 직접 노출
- components/modals/RecordDetailModal.tsx 하네스 타임라인 패널에 `actor` 메타와 영속 저장 확인/폴백 상태, `workflowRunId`를 함께 노출해 운영 추적성을 보강
- lib/server/harness/persistence.ts `fetchPersistedHarnessWorkflowStatus()`가 `resolvedBy`, 이벤트/승인/타임라인 건수, `sourceRecordId`를 포함한 진단 메타를 함께 반환하도록 확장
- 현재 `lib/server/harness/handlers/workflowStatus.ts`가 persistence 연결은 되었지만 저장 런이 없는 경우 별도 경고와 진단 메타를 응답해 `폴백`과 `실데이터 미발견`을 구분 가능하게 정리
- services/harnessService.ts / components/modals/RecordDetailModal.tsx가 진단 메타를 받아 승인 게이트에 `실데이터 미발견`, `원본 레코드 기준 조회`, 이벤트·승인 건수 요약을 함께 표시하도록 보강
- pages/Dashboard.tsx 상단에 하네스 저장 연결/승인 백로그/즉시 보호 대상/폴백·대기 요약을 `SummaryMetricGrid`로 추가
- pages/Dashboard.tsx가 역할별 요약 카드 아래에서 하네스 승인 백로그와 persistence 경고를 `NoticeCallout`으로 바로 안내하도록 보강
- pages/FieldSafetyComplianceHub.tsx 상단에 하네스 저장 연결/승인 백로그/즉시 보호 대상/폴백·대기 요약을 추가해 탭 진입 전 운영 우선순위를 한 번에 읽도록 보강
- pages/FieldSafetyComplianceHub.tsx 종합판정 탭에도 하네스 요약 수치와 persistence/승인 경고를 연결해 행동 무결성 판정을 실제 보호 워크플로우와 함께 읽도록 정리
- pages/SiteIssueManagement.tsx 상단에 하네스 저장 연결/승인 백로그/즉시 보호 대상/폴백·대기 요약과 경고를 추가해 현장 지적사항도 보호 우선순위 맥락으로 읽도록 보강
- App.tsx가 `SiteIssueManagement`에 `workerRecords`를 전달해 지적사항 관리 화면에서도 하네스 운영 신호를 함께 계산하도록 연결
- pages/PredictiveAnalysis.tsx 상단에 하네스 저장 연결/승인 백로그/즉시 개입/폴백·대기 요약을 추가해 예측 계획 전에 현재 보호 공백을 먼저 읽도록 보강
- pages/PredictiveAnalysis.tsx가 `NoticeCallout`으로 즉시 보호 대상·승인 백로그·persistence 폴백 경고를 함께 안내해 다음 달 실행계획과 현재 보호 흐름을 연결
- pages/SafetyBehaviorManagement.tsx 상단에 하네스 저장 연결/승인 백로그/즉시 보호/폴백·대기 요약을 추가해 관찰·코칭·무결성 판정이 보호 워크플로우와 분리되지 않도록 보강
- pages/SafetyBehaviorManagement.tsx가 observe/review 탭 공통으로 하네스 경고를 노출해 입력·판정 전에 관리자 승인 및 저장 연결 우선순위를 바로 읽도록 정리
- pages/PerformanceAnalysis.tsx 상단에 하네스 저장 연결/승인 백로그/즉시 보호/폴백·대기 요약을 추가해 점수·변동성 해석 전에 현재 보호 공백을 먼저 확인하도록 보강
- pages/PerformanceAnalysis.tsx가 성과 카드 아래에서 하네스 경고를 함께 노출해 평균·편차보다 우선 처리할 승인/저장 이슈를 즉시 읽도록 정리
- pages/SafetyChecks.tsx 상단에 하네스 저장 연결/승인 백로그/즉시 보호/폴백·대기 요약을 추가해 새 점검 등록 전에 기존 보호 백로그를 먼저 확인하도록 보강
- pages/SafetyChecks.tsx가 신규 점검 폼 앞에서 하네스 경고를 노출해 기록 추가와 승인·저장 연결 점검을 같은 흐름으로 읽도록 정리
- pages/Settings.tsx 상단에 하네스 저장 연결/승인 백로그/즉시 보호/폴백·대기 요약을 추가해 설정 변경 전 현재 보호 공백을 먼저 읽도록 보강
- pages/Settings.tsx에 최근 `workflowRunId` 기준 persistence 진단 패널을 추가해 `직접 조회` / `원본 레코드 기준 조회` / `실데이터 미발견` / 경고 / 실패 건수를 즉시 검증 가능하게 정리
- App.tsx가 `Settings`에 `workerRecords`를 전달해 설정 화면에서도 최신 하네스 run 연결 레코드를 기준으로 진단 대상을 계산하도록 연결
- lib/server/harness/persistence.ts에 환경변수/키 모드/하네스 테이블 건수를 점검하는 `fetchHarnessPersistenceHealth()`를 추가해 실환경 persisted 검증 전 환경 상태를 분리 가능하게 정리
- `lib/server/harness/handlers/persistenceHealth.ts`와 `services/harnessService.ts`에 하네스 persistence 환경 상태 조회 로직/클라이언트 래퍼를 추가하고, 현재는 gateway 액션으로 호출되도록 정리
- pages/Settings.tsx에 하네스 persistence 환경 상태 카드(`환경변수` / `키 모드` / `테이블 준비` / `workflow runs` / `events·approvals`)를 추가해 실데이터 미발견과 환경 미구성을 먼저 구분 가능하게 보강
- pages/Reports.tsx 보고서 센터 상단에 하네스 커버리지 요약(`저장 연결` / `폴백·대기` / `재확인 필요` / `즉시 보호 대상`)을 `SummaryMetricGrid`로 추가
- pages/Reports.tsx 생성 대상 목록과 개별 미리보기에서 워크플로우·위험·승인·저장 연결 배지, `workflowRunId`, persistence 경고를 함께 노출
- pages/Reports.tsx CSV/증빙 패키지 인덱스 내보내기에 `workflowRunId` / `workflowState` / `riskDecision` / `approvalState` / persistence 상태 필드를 포함해 외부 검증 흐름까지 연결
- pages/WorkerManagement.tsx 등록 근로자 관리자 센터 상단에 하네스 저장 연결/보호 재확인 요약 수치와 persistence 폴백 경고를 추가
- pages/WorkerManagement.tsx 등록 근로자 목록 카드와 문자 발송 이력 상세에서 워크플로우·위험·승인·저장 연결 배지, `workflowRunId`, persistence 경고를 함께 노출
- App.tsx `sanitizeRecords()`가 `workflowRunId` / `workflowState` / `riskDecision` / `approvalState` / `harnessPersistenceWarning`을 명시적으로 정규화해 DB 로드·가져오기·OCR 추가 저장 경로에서 하네스 필드 누락을 방지
- utils/qrUtils.ts 공유 링크 스키마를 v6으로 확장해 QR 기반 복원 시에도 `workflowRunId` / 하네스 상태 / persistence 경고를 함께 복원하도록 보강
- utils/qrUtils.ts에 QR 공유 길이 진단 헬퍼를 추가해 URL/payload 길이를 기준으로 `ok` / `warning` / `overflow` 상태를 판단하도록 보강
- pages/IndividualReport.tsx 상단 리포트 안내 카드와 공유 액션에 QR 길이 진단 결과를 연결해 긴 링크일 때 링크·PDF 병행 안내를 즉시 표시
- pages/WorkerManagement.tsx QR 렌더러가 공유 길이 `overflow` 상태를 사전 감지해 무의미한 QR 생성 대신 `Data Too Long` 폴백으로 전환하도록 보강
- components/Layout.tsx 상단 특허출원/유무료 API 상태 배지를 `StatusBadge`로 정리
- components/Sidebar.tsx 브랜드 헤더 특허출원 배지를 `StatusBadge`로 정리
- components/AdminLockScreen.tsx 관리자 진입 CTA를 `ActionButton`으로 정리
- components/AuthGateway.tsx 본인 확인 CTA를 `ActionButton`으로 정리
- components/charts/WorkerTrendPanel.tsx 요약 수치 블록을 `SummaryMetricGrid`로 정리
- components/charts/WorkerTrendPanel.tsx 필터/페이지 상태 배지와 액션 버튼 일부를 `StatusBadge` / `ActionButton`으로 정리
- components/charts/WorkerTrendPanel.tsx 빈 상태를 `EmptyStatePanel`로 정리
- components/charts/WorkerTrendPanel.tsx 상세 `TrendModal` 상단 수치/기록 부족 상태도 `SummaryMetricGrid` / `EmptyStatePanel`로 정리
- components/modals/RecordDetailModal.tsx 조치 이력 추가와 문서 이미지 업로드 CTA를 `ActionButton`으로 정리
- components/modals/RecordDetailModal.tsx 문서 원본 다크 영역 라벨/파일명/문서 등록 버튼과 문항 배지를 `StatusBadge` / `ActionButton`으로 정리
- components/modals/RecordDetailModal.tsx 승인 가이드/경고/입력 안내 상태 박스를 `NoticeCallout`으로 정리
- components/modals/RecordDetailModal.tsx 모바일 작업 순서 안내를 `SectionPanelCard` + `NextActionChecklist` 기반으로 정리
- components/modals/RecordDetailModal.tsx 검토 메타 요약/원문 비교 수치 칩을 `SummaryMetricGrid` 기반으로 정리
- components/modals/RecordDetailModal.tsx 판단 체크포인트/AI 해석 검토/감사·재평가 이력 패널을 `WhyThisResultPanel` 기반으로 정리
- components/modals/RecordDetailModal.tsx 사진 등록 자동 진행/추가 확인 안내를 `NoticeCallout` 기반으로 추가 정리
- components/modals/RecordDetailModal.tsx 프로필 등록/기본 정보/판단·조치 입력 카드 래퍼를 `SectionPanelCard` 기반으로 추가 정리
- components/modals/RecordDetailModal.tsx AI 해석 textarea 카드와 원문 비교 문항 카드를 `SectionPanelCard` / `OperationalPreviewCard` 기반으로 추가 정리
- components/ReportTemplate.tsx 부록 헤더/검증 라벨 배지를 `StatusBadge`로 정리
- components/shared/WhyThisResultPanel.tsx를 추가해 결과 해설용 상세 섹션 패턴 공통화 기반을 마련
- components/ReportTemplate.tsx 강점/보완 상세 섹션을 `WhyThisResultPanel` 기반으로 정리
- components/shared/NextActionChecklist.tsx를 추가해 후속 행동 체크리스트 패턴 공통화 기반을 마련
- components/ReportTemplate.tsx 전면 `현장 실천 체크` / `Action checklist`를 `NextActionChecklist`로 정리
- components/shared/WhyThisResultPanel.tsx에 `children` 슬롯을 추가해 상세 해설 + 보조 섹션 결합 구성을 지원
- components/ReportTemplate.tsx `Formal score reasoning` / `Action coaching` 섹션도 `WhyThisResultPanel` 기반으로 확장 정리
- components/ReportTemplate.tsx 재평가 이력 패널을 `WhyThisResultPanel` 기반으로 정리
- components/ReportTemplate.tsx 진위 메모 패널을 `NoticeCallout`의 `glassDark` variant로 정리
- pages/OcrAnalysis.tsx 재분석 상세 비교 내부의 인사이트/내용/OCR 비교 래퍼를 `SectionPanelCard`로 정리
- pages/OcrAnalysis.tsx 실패 미리보기 카드 래퍼도 `OperationalPreviewCard` 기반으로 정리
- pages/OcrAnalysis.tsx 실패 유형별 담당자 체크리스트 카드도 `OperationalPreviewCard` 기반으로 정리
- pages/OcrAnalysis.tsx 빠른 실행 내부의 긴급 조치/운영·백업 그룹도 `SectionPanelCard` 기반으로 정리
- pages/OcrAnalysis.tsx 빠른 실행 바깥 다크 컨테이너도 `SectionPanelCard` 기반으로 정리
- pages/OcrAnalysis.tsx 재분석 상세 비교 내부 개별 비교 카드를 `OperationalPreviewCard`로 정리
- pages/OcrAnalysis.tsx 최근 24시간 운영 조치 요약과 사유 품질 QA 상세 카드를 `SectionPanelCard` / `OperationalPreviewCard`로 추가 정리
- pages/OcrAnalysis.tsx 사유 보완 필요 요약 배너와 사유 입력 가이드를 `SectionPanelCard`로 정리
- pages/OcrAnalysis.tsx 우측 `2차 AI 재분석` 안내 블록을 `SectionPanelCard`로 정리
- pages/OcrAnalysis.tsx 2차 재분석 대상 없음/대응 가이드 빈 상태를 `EmptyStatePanel`로 정리
- pages/WorkerManagement.tsx / pages/OcrAnalysis.tsx 복합 헤더 섹션 일부를 `SectionPanelCard`의 `eyebrow` / `headerAction` 기반으로 단순화
- pages/WorkerManagement.tsx / pages/OcrAnalysis.tsx 카드 일부를 `OperationalPreviewCard`의 확장 props 기반으로 단순화
- pages/WorkerManagement.tsx / pages/OcrAnalysis.tsx 빈 상태 일부를 `EmptyStatePanel`의 `variant` 기반으로 단순화
- pages/WorkerManagement.tsx / pages/OcrAnalysis.tsx에서 shared tone variant(`white` / `slate` / `emerald` 등) 사용으로 톤 네이밍을 정리
- pages/WorkerManagement.tsx / pages/OcrAnalysis.tsx에서 `SectionPanelCard` / `OperationalPreviewCard`의 반복 컨테이너 클래스 일부를 `variant` 기반으로 정리
- pages/OcrAnalysis.tsx 재분석 비교 패널과 pages/WorkerManagement.tsx 작업 모드/일괄 문자 패널도 accent preset 기반으로 정리

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

미완료 항목만 남겨 정리함.

### 4-1. 역할별 ViewModel 명명·계층 최종화 (잔여)
현재 상태:
- [완료] `utils/roleViewModel.ts` 도입 및 4개 핵심 페이지 연결
- [미완] 문서형 명칭(`workerViewModel / managerViewModel / executiveViewModel`)과 코드 명명 체계 최종 합의

남은 작업:
1) 역할별 모델 명명 규칙을 문서/코드에서 1세트로 확정
2) 신규 페이지 확장 시 동일 패턴 강제 기준 추가(체크리스트/리뷰 규칙)

### 4-2. 톤 토큰 적용 범위 전역 확장 (잔여)
현재 상태:
- [완료] `utils/brandToneTokens.ts` 도입
- [완료] OcrAnalysis/WorkerManagement/RecordDetailModal의 `tone:` raw class 제거
- [완료] TS/TSX 전역 기준 `tone: 'border-*'` raw 문자열 제거

남은 작업:
1) 신규 UI에서 raw tone 문자열 사용 금지 기준을 lint/review 규칙으로 고정
2) 예외 케이스(필요 시)만 토큰 파일에 선반영 후 사용

### 4-3. 문서-코드 용어 정합 유지 (상시)
현재 상태:
- [완료] 9장(2026-04-14)에서 코드 기준 검증 반영
- [미완] 1~8장 일부 레거시 표현(권장/미구현 항목) 잔존

남은 작업:
1) 완료된 항목은 "완료" 태그로 유지
2) 미완 항목만 액션 리스트에 남기는 운영 규칙 적용

---

## 5. 다음 스프린트 우선순위

### P1. 톤 토큰 전역 적용 마무리
실행 항목:
1) [완료] 주요 운영 화면의 `tone` 문자열 잔여분 치환
2) [완료] 다크/투명 계열 톤까지 토큰 키로 통일

### P2. 역할별 ViewModel 네이밍/가이드 고정
실행 항목:
1) 문서형 명칭과 코드형 명칭의 대응표 확정
2) 신규 화면 적용 시 재사용 기준(체크 항목) 추가

### P3. 문서 유지보수 규칙 고정
실행 항목:
1) 미완 과제만 4~6장에 유지
2) 완료 항목은 9장 검증 로그로 누적

---

## 6. 바로 다음 구현 권장 순서

### Step 1
[완료] 톤 토큰 잔여 구간 전수 스캔 후 일괄 치환

### Step 2
역할별 ViewModel 명명/문서 용어를 1세트로 고정

### Step 3
완료 항목은 9장으로 이관하고, 4~6장은 미완 항목만 유지

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

---

## 9. 2026-04-14 확인·검증 업데이트 (현행 기준)

### 9-1. 검증 결론

- 브랜드 보이스/카피/상태어 상수화, shared 컴포넌트 도입은 **실코드 반영 완료**
- 문서의 과거 “추가 권장 컴포넌트” 목록 중 대부분은 이미 구현/적용됨
- 현재 핵심 과제는 “컴포넌트 신규 도입”보다 **역할별 경험 분리의 구조화**와 **잔여 톤 하드코딩 정리**임

### 9-2. 코드 대조 결과 요약

완료 확인:
- `components/shared/InterpretationCardGrid.tsx`
- `components/shared/StatusEvidenceActionPanel.tsx`
- `components/shared/SummaryMetricGrid.tsx`
- `components/shared/ControlPanelCard.tsx`
- `components/shared/SectionPanelCard.tsx`
- `components/shared/OperationalPreviewCard.tsx`
- `components/shared/WhyThisResultPanel.tsx`
- `components/shared/NextActionChecklist.tsx`
- `components/Layout.tsx`, `components/Sidebar.tsx` 특허/상태 배지 `StatusBadge` 적용
- `pages/OcrAnalysis.tsx`, `pages/WorkerManagement.tsx`, `components/modals/RecordDetailModal.tsx`에 해석형 패턴 대량 반영
- `utils/brandToneTokens.ts` 도입 및 OcrAnalysis/WorkerManagement/RecordDetailModal의 `tone:` raw class 문자열 제거(2차 정규화 완료)
- `Introduction`/`PerformanceAnalysis`/`PredictiveAnalysis`/`Settings`/`IndividualReport`/`WorkerHistoryModal`/`SiteIssueManagement`/`Dashboard`/`Reports`/`FieldSafetyComplianceHub`/`SafetyChecks`/`SafetyBehaviorManagement`까지 톤 토큰 확장 적용

미완료/보완 필요:
- `RoleAwareSummaryBlock`은 문서에만 존재하고 실코드에는 없음
- `workerViewModel / managerViewModel / executiveViewModel` 명시 구조는 문서형 명칭 기준으로는 미완
- 역할 분기 표준화는 `utils/roleViewModel.ts` 기반으로 4개 페이지(Dashboard/Reports/WorkerManagement/FieldSafetyComplianceHub)까지 1차 적용 완료
- 톤 하드코딩 축소는 전역(주요 TS/TSX) 2차 정규화까지 완료, 다음 과제는 신규 코드 유입 시 가드 규칙 고정

### 9-3. 구현할 사항 정리 (우선순위)

#### P1. 역할별 ViewModel 표준화 (최우선)
목표:
- 역할 분기 로직을 페이지 내부 조건문에서 공통 모델로 승격

대상:
- `pages/Dashboard.tsx`
- `pages/Reports.tsx`
- `pages/WorkerManagement.tsx`
- `pages/FieldSafetyComplianceHub.tsx`

구현 항목:
1) `utils/roleViewModel.ts` 신설
- `buildWorkerViewModel()`
- `buildManagerViewModel()`
- `buildExecutiveViewModel()`
2) 각 페이지에서 분산된 표시 조건을 view model 소비 방식으로 치환
3) 역할별 카드 노출 순서/문구를 모델 기반으로 통일

완료 기준:
- [완료] 위 4개 페이지에서 역할 분기 조건식 감소
- [완료] 역할별 노출 순서가 코드상 명시 구조로 1차 통일

#### P2. 톤/배지 하드코딩 추가 축소
목표:
- 문자열 기반 tone class를 shared tone variant로 단계적 이관

우선 대상:
- `pages/OcrAnalysis.tsx`
- `pages/WorkerManagement.tsx`
- `components/modals/RecordDetailModal.tsx`

구현 항목:
1) 반복 `border-*/bg-*` 조합을 공통 토큰/variant 기반으로 치환
2) 상태 라벨은 `StatusBadge` + `brandLabels.ts` 매핑 우선 사용
3) 동일 의미의 톤 키를 white/slate/emerald/amber/rose/violet 기준으로 정규화

완료 기준:
- [완료(2차)] 주요 화면 3곳(OcrAnalysis/WorkerManagement/RecordDetailModal)에서 `tone:` raw class 문자열 제거
- [진행중] 신규 UI 블록에서 raw tone class 직접 선언 최소화(전체 코드베이스 기준)

#### P3. 문서-코드 동기화
목표:
- 본 문서의 “남은 과제”를 현재 구현 상태와 일치시켜 재작업 방지

구현 항목:
1) 섹션 4~6의 과제 문구를 “미구현 과제 중심”으로 축약
2) 이미 완료된 컴포넌트 도입 항목은 유지하되 “완료”로 명확 표기
3) 다음 세션 체크리스트에 P1/P2 항목만 남김

완료 기준:
- 문서만 읽어도 현재 미완료 항목이 즉시 식별 가능
- [완료] 4~6장을 미완 과제 중심으로 축약하고 완료 항목은 명시 태그로 분리

### 9-4. 바로 실행 순서 (권장)

1) [완료] P1-1: `utils/roleViewModel.ts` 생성 및 `Dashboard.tsx` 1차 연결
2) [완료] P1-2: `Reports.tsx`/`WorkerManagement.tsx`/`FieldSafetyComplianceHub.tsx` 순차 적용
3) [완료] P2-1: `utils/brandToneTokens.ts` 도입 + OcrAnalysis/WorkerManagement/RecordDetailModal 1차 톤 치환
4) [완료] P2-2: 잔여 raw tone 문자열(특히 다크/투명 계열) 2차 정규화
5) [완료] P3: 본 문서 4~6장 동기화 업데이트
