# PSI 하네스 진행 현황 및 업그레이드 완료 예정 사항

기준일: 2026-04-11  
대상 시스템: PSI (Predictive Safety Intelligence)  
기준 문서: PSI 하네스 엔지니어링 아키텍처 및 구현 전략 (2026-04-10)

---

## 1. 문서 목적

이 문서는 전일 합의한 하네스 엔지니어링 전략을 기준으로,
현재 코드베이스에 실제 반영된 진행 사항과 다음 단계에서 완료될 업그레이드 항목을
운영 관점에서 빠르게 확인할 수 있도록 정리한 상태 문서다.

---

## 2. 총평

현재 PSI는 단순 아이디어 단계가 아니라,
이미 다음 3개 축에서 하네스 기반 구조로 진입한 상태다.

1. 상태 분리 시작
   - `workflowState`
   - `riskDecision`
   - `approvalState`
   - `secondPassStatus`

2. 하네스 API 골격 구축
   - `analyze`
   - `approve`
   - `reanalyze`
   - `workflow-status`

3. 감사 추적용 Supabase 스키마 초안 보유
   - workflow runs
   - workflow events
   - guardrail overrides
   - context snapshots
   - human approvals
   - prompt/policy versions

즉, 전략 문서와 완전히 분리된 상태가 아니라,
문서 방향과 실제 구현이 이미 연결되기 시작한 상태로 판단된다.

---

## 3. 이번 진행에서 확인된 구현 완료 사항

## 3.1 하네스 서버 레이어 기본 구조 확보

다음 서버 레이어가 실제 프로젝트에 존재함을 확인했다.

- `lib/server/harness/inputValidators.ts`
- `lib/server/harness/outputValidators.ts`
- `lib/server/harness/contextAssembler.ts`
- `lib/server/harness/policyRegistry.ts`
- `lib/server/harness/ruleEngine.ts`
- `lib/server/harness/router.ts`
- `lib/server/harness/auditLogger.ts`
- `lib/server/harness/persistence.ts`
- `lib/server/harness/agents/analyzer.ts`
- `lib/server/harness/agents/evaluator.ts`

의미:
- 문서에서 제안한 하네스 계층이 코드베이스 내에 실체화되기 시작했다.
- 향후 LangGraph/Temporal 이전 전까지는 현재 구조를 확장 기반으로 활용 가능하다.

---

## 3.2 상태 체계 분리 반영 확인

`types.ts` 기준으로 다음 상태 타입이 이미 정의되어 있다.

### Workflow State
- `uploaded`
- `ocr_validating`
- `manual_review_required`
- `context_ready`
- `first_pass_analyzing`
- `evaluator_review`
- `awaiting_manager_approval`
- `manager_revised`
- `second_pass_analyzing`
- `completed`

### Risk Decision
- `SAFE_TO_PROCEED`
- `SUPPLEMENTARY_REVIEW`
- `IMMEDIATE_ATTENTION`
- `CRITICAL_STOP`

### Approval State
- `NOT_REQUIRED`
- `REQUIRED`
- `PENDING`
- `APPROVED`
- `REJECTED`

의미:
- 전략 문서의 핵심 방향인 “한 개 상태 필드에 모든 책임을 몰지 않는다”는 원칙이 이미 반영되어 있다.
- UI, 정책, 감사 책임 분리의 기반이 준비된 상태다.

---

## 3.3 하네스 API 엔드포인트 초안 동작 구조 확보

다음 API가 존재함을 확인했다.

- `POST /api/harness/analyze`
- `POST /api/harness/approve`
- `POST /api/harness/reanalyze`
- `GET/POST /api/harness/workflow-status`
- `GET /api/harness/persistence-health`

현재 역할:
- 입력 검증
- 컨텍스트 스냅샷 생성
- 분석 결과 생성
- 평가 결과 생성
- 룰 엔진 적용
- 상태 결정
- 감사 이벤트 생성
- Supabase persistence 시도

의미:
- 전략 문서의 1차 서버 실행선은 이미 확보됐다.
- 다음 단계는 “더 정교한 내용 확장”이지 “제로베이스 신설”이 아니다.

---

## 3.4 입력 검증 레이어 반영 확인

현재 입력 검증은 다음 항목을 다루고 있다.

- OCR 텍스트 길이 부족
- 특수문자 비율 과다
- OCR 신뢰도 낮음/치명적 낮음
- 이미지 품질 저하
- 고위험 문맥 키워드 부족

의미:
- 문서의 “LLM 호출 전 품질 차단” 원칙이 이미 코드 레벨에서 시작되었다.
- False Negative를 줄이기 위한 최소한의 하드 게이트가 존재한다.

---

## 3.5 룰 엔진 기반 결정론 오버라이드 반영 확인

현재 룰 엔진은 다음 계열을 처리한다.

- 추락 보호 조치 누락
- 비계 보호 조치 누락
- 타워크레인 접근 통제 누락
- 강풍 상황 추가 검토
- 동바리/강우 상황 재검토
- 고위험 공종 추가 검토

의미:
- 문서의 핵심인 “AI 결과를 그대로 믿지 않고 정책이 뒤집을 수 있어야 한다”는 조건이 구현 중이다.
- 특히 고위험 공종 보수적 해석 원칙이 구조적으로 반영되고 있다.

---

## 3.6 프롬프트 레이어 구조화 완료

이번 진행에서 다음 항목을 추가 반영했다.

### 추가 완료
- `promptLayers.ts` 신설
- 시스템 지시어 레이어 구성
- 정적 지식 레이어 구성
- 동적 컨텍스트 라인 조합 구조 추가
- 프롬프트 스냅샷 타입 추가

### 기대 효과
- 단일 문자열 프롬프트 관리에서 벗어나 레이어 기반 추적 가능 구조 확보
- 나중에 prompt version snapshot, 정책 변경 추적, 감사 대응이 쉬워짐

---

## 3.7 동적 컨텍스트 제공자 분리 완료

이번 진행에서 다음 분리를 완료했다.

- `contextProviders/dynamicContext.ts`
  - 날씨 정규화
  - 작업 계획 정규화
  - 센서 이벤트 정규화
  - 동적 프롬프트 라인 구성

의미:
- 문서의 “컨텍스트 주입 레이어”가 실제 폴더 구조로 구현되기 시작했다.
- 향후 `weather`, `iot`, `schedule`, `site warnings` 공급자를 개별 파일로 세분화하기 쉬운 상태다.

---

## 3.8 규칙 파일 모듈화 완료

이번 진행에서 다음 룰 모듈을 분리했다.

- `rules/fallProtectionRules.ts`
- `rules/scaffoldRules.ts`
- `rules/craneRules.ts`
- `rules/shoringRules.ts`
- `rules/shared.ts`

의미:
- 이후 한국 건설업 특화 룰셋을 추가할 때 `ruleEngine.ts` 단일 파일 비대화를 방지할 수 있다.
- 룰 버전 관리와 테스트 작성이 쉬워진다.

---

## 3.9 프롬프트 버전 / 정책 버전 영속화 연결 완료

이번 진행에서 `persistence.ts`를 확장해 다음을 반영했다.

- `ai_prompt_versions` upsert
- `ai_policy_versions` upsert
- `ai_workflow_runs.prompt_version_id` 연결
- `ai_workflow_runs.policy_version_id` 연결
- `ai_context_snapshots.prompt_version_id` 연결
- `ai_context_snapshots.policy_version_id` 연결

의미:
- 감사 추적 전략의 핵심 요구사항 중 하나가 실제 코드에 반영되었다.
- “당시 어떤 프롬프트/정책이 적용됐는가”를 이후 조회 가능한 방향으로 정리했다.

---

## 3.10 UI 측 하네스 상태 노출 기반 확인

다음 주요 UI에서 하네스 상태를 이미 인지하고 있다.

- `pages/Dashboard.tsx`
- `pages/Reports.tsx`
- `pages/WorkerManagement.tsx`
- `components/modals/RecordDetailModal.tsx`

현재 가능한 수준:
- workflow 상태 표시
- risk decision 표시
- approval 상태 표시
- 승인 백로그 집계
- 즉시 보호 대상 집계
- 런 ID 연결 상태 노출
- 일부 타임라인 표시

의미:
- 전략 문서의 프론트엔드 연결 포인트가 대부분 이미 현실 코드와 연결돼 있다.
- 다음 단계는 UI “존재 여부”가 아니라 “표현 정교화” 단계다.

---

## 4. 이번 진행에서 직접 업그레이드 완료된 항목

이번 자동 진행으로 실제 반영 완료된 업그레이드는 아래와 같다.

### 완료 1. 프롬프트 레이어 파일 추가
- 시스템/정적/동적 레이어 조립 구조 추가

### 완료 2. 동적 컨텍스트 제공자 추가
- 날씨/작업계획/센서 이벤트 정규화 분리

### 완료 3. 룰 엔진 모듈화
- 추락/비계/크레인/동바리 룰 파일 분리

### 완료 4. 룰 순차 평가 구조 정리
- 오버라이드가 순차적으로 반영되도록 보정

### 완료 5. Prompt/Policy Version 영속화
- Supabase snapshot 테이블과 실제 persistence 연결

### 완료 6. Analyze/Reanalyze API 응답에 프롬프트 정보 포함
- 이후 관리자 UI와 보고서에서 근거 정보 표시 확장 가능

### 완료 7. workflow-status 감사 조회 확장
- 오버라이드 로그 반환
- 승인 이력 반환
- 컨텍스트 스냅샷 반환
- 프롬프트 버전 반환
- 정책 버전 반환

### 완료 8. 관리자 모달 감사 패널 강화
- 오버라이드 로그 패널 추가
- 승인 이력 패널 추가
- 컨텍스트/버전 스냅샷 패널 추가
- 하네스 감사 요약 메트릭 추가

### 완료 9. Dashboard 운영 우선순위 카드 강화
- 하네스 저장 연결률 표시
- 공종별 보호 신호 집중 구간 요약
- 즉시 보호/승인 백로그 우선 액션 안내

### 완료 10. Reports 감사 근거 요약 강화
- 보고 대상 하네스 커버리지 카드 추가
- 승인 백로그 비율 안내 추가
- 미리보기 영역에 승인 이력/감사 이벤트/2차 재분석/증빙 해시 요약 추가

### 완료 11. rule_version 추적 구조 1차 반영
- 가드레일 오버라이드에 `ruleVersion` 추가
- audit log payload에 규칙 버전 포함
- persistence 저장/조회에 `rule_version` 반영
- 관리자 모달 오버라이드 로그에 룰 버전 노출

### 완료 12. 관리자 모달 증빙 체크리스트 추가
- workflow run 연결 여부
- evidence hash 존재 여부
- 승인/검토 코멘트 존재 여부
- context snapshot 저장 여부
- override 검토 필요 여부

### 완료 13. 승인 상태 전이 가드 및 리포트 버전 노출 보강
- `approve` API에서 현재 persisted workflow 상태를 선조회하도록 보강
- `reanalyze` API에서도 현재 persisted workflow 상태 기준 전이 가드를 적용
- 허용되지 않는 `approve`/`reject`/`request-reanalysis` 전이를 서버에서 차단
- Reports 미리보기에서 prompt version / policy version / rule version 표시
- Reports 미리보기 요약 카드가 remote workflow-status 집계를 우선 사용하도록 보강
- 리포트 화면에서 하네스 버전 스냅샷 로딩/오류 상태를 함께 노출

### 완료 14. workflow-status 요약 구조 및 관리자 모달 diff 표시 보강
- `workflow-status` 응답에 analyzer summary / evaluator summary 추가
- `workflow-status` 응답에 latest approval diff 추가
- 관리자 모달 HARNESS AUDIT SNAPSHOT에 분석기/평가기 요약 패널 추가
- 관리자 모달에 최신 승인 diff 패널 추가

### 완료 15. Reports 감사 설명 문구 보강
- Reports 미리보기에 최신 승인 diff 설명 블록 추가
- Reports 미리보기에 analyzer / evaluator 요약 설명 블록 추가
- Reports 미리보기에 override summary 설명 블록 추가

### 완료 16. 관리자 모달 상태 전이 안내 문구 보강
- 승인 패널 상단에 현재 workflow/approval 상태 기준 전이 안내 콜아웃 추가
- 승인 거부/재분석 거부 시 서버 메시지를 운영용 안내 문구로 변환해 표시
- 전이 거부 이벤트를 모달 감사 이력에 함께 남기도록 보강

### 완료 17. 감사 패키지 ZIP에 하네스 감사 스냅샷 포함
- Reports 증빙 ZIP의 각 JSON 파일에 `harnessAuditSnapshot` 포함
- `promptVersion` / `policyVersion` / `analyzerSummary` / `evaluatorSummary` / `latestApprovalDiff` / `overrides` / `approvals` / `contextSnapshot` / `timeline` 포함
- `manifest.json`과 `evidence_index.csv`에 prompt/policy/override/approval 메타 반영

### 완료 18. 증빙 검증 화면 하네스 메타 표시 보강
- 선택한 `manifest.json`을 즉시 파싱해 하네스 메타 미리보기 제공
- 검증 화면에 prompt/policy/rule version, override count, approval count 요약 카드 추가
- workflow run 연결 범위와 하네스 감사 스냅샷 포함 여부를 함께 표시

### 완료 19. Dashboard 하네스 감사 현황 카드 보강
- Dashboard에 하네스 감사 연결 대상 / 전이 차단 이력 / 승인 감사 기록 / 누적 감사 이벤트 메트릭 추가
- Dashboard에 전이 차단 우선순위와 감사 커버리지 설명 카드 추가

### 완료 20. 룰/프롬프트/정책 버전 설명 가시성 보강
- 하네스 버전 카탈로그 유틸 추가
- Reports 증빙 ZIP `README.txt`에 prompt/policy/rule 버전 설명 포함
- 증빙 검증 화면에 manifest 기반 상세 버전 목록 패널 추가

### 완료 21. 버전 변경 포인트(diff) 설명 구조 추가
- 하네스 버전 카탈로그에 `previousVersion` 및 `changesFromPrevious` 메타 추가
- Reports 증빙 ZIP `README.txt`에 버전별 변경 포인트 요약 포함
- 증빙 검증 화면 버전 목록 패널에 이전 기준과 변경 포인트 표시 추가

### 완료 22. 공통 버전 설명 패널 재사용 적용
- `HarnessVersionDetailsPanel` 공통 컴포넌트 추가
- Reports 증빙 검증 화면 버전 목록을 공통 컴포넌트로 전환
- 관리자 모달 HARNESS AUDIT SNAPSHOT에도 prompt/policy/rule 버전 설명 패널 재사용 적용

### 완료 23. 버전 변경 포인트 표 형식 고도화
- Reports 증빙 검증 화면에 category/version/previous/released/change points 표 추가
- 관리자 모달 HARNESS AUDIT SNAPSHOT에도 동일한 버전 변경 포인트 표 추가

### 완료 24. workflow-status 응답에 버전 설명 bundle 직접 포함
- 서버 `workflow-status` 응답에 prompt/policy/rule `versionDetails` bundle 포함
- Reports 미리보기와 관리자 모달이 서버 제공 버전 설명 데이터를 우선 사용하도록 보강

### 완료 25. workflow-status 응답에 버전 변경 요약 문자열 직접 포함
- 서버 `workflow-status` 응답에 `versionChangeSummary` bundle 추가
- Reports 미리보기와 관리자 모달에 서버 제공 버전 변경 요약 문구를 직접 노출

### 완료 26. 증빙 패키지 manifest/README에 버전 변경 요약 전파
- Reports 증빙 ZIP `manifest.json` 각 파일 엔트리에 `versionChangeSummary` 포함
- Reports 증빙 ZIP `README.txt`에 manifest 기반 버전 변경 요약 섹션 추가
- 증빙 검증 화면에도 manifest 집계 기반 prompt/policy/rule 변경 요약 카드를 추가

### 완료 27. 실제 로컬 루트 기준 프로덕션 빌드 검증 완료
- 초기 실패 원인이 터미널 cwd(`C:\Users\user`) 불일치였음을 재확인
- 실제 로컬 저장소 루트에서 `npm run build` 재실행 후 Vite production build 성공 확인
- 현재까지 반영된 Reports/RecordDetailModal/하네스 버전 메타 변경이 빌드 단계에서도 문제 없음을 검증

---

## 5. 현재 남아 있는 갭

아래 항목은 방향은 맞지만 아직 완전히 닫히지 않았다.

## 5.1 workflow-status 응답 정보는 크게 보강됐지만 세부 diff는 아직 제한적

현재 조회 가능한 핵심 정보는 다음 수준까지 확장됐다.

- workflow state
- risk decision
- approval state
- second pass status
- timeline
- override logs
- approval logs
- context snapshot
- prompt version
- policy version

추가로 필요:
- 규칙 버전별 차이 표시

이번 진행으로 다음은 반영 완료됐다.

- approval diff
- analyzer/evaluator 요약

현재는 `rule_version` 자체는 추적되지만,
버전 간 변경 diff를 설명하는 UI/리포트 레벨 표시는 아직 추가 필요하다.

---

## 5.2 관리자 UI의 “승인 패널”은 존재하지만 감사 디테일은 아직 약함

현재 상태:
- 승인 흐름 존재
- 하네스 배지 표시 존재
- 타임라인 일부 표시 존재

추가 필요:
- 승인 전/후 diff 설명 보강
- 타임라인 단계별 의미 문구 정교화
- 체크리스트 기반 승인 가이드 세분화

---

## 5.3 보고서 레이어는 하네스 메타를 읽지만 감사형 패키지는 더 강화 필요

현재 상태:
- workflow/risk/approval metadata 일부 포함 가능
- evidence hash 포함
- run id 노출 가능

추가 필요:
- override 상세 요약 문장
- approval diff 기반 보고 설명
- 감사 패키지 JSON/PDF 포맷 고도화

---

## 5.4 멀티모달 환각 억제는 아직 초기 수준

현재 상태:
- OCR confidence 임계값 처리 존재
- 원본 이미지 보존 필드 존재

추가 필요:
- 저신뢰 텍스트 span 하이라이트
- 이미지-텍스트 불일치 검사
- 표/체크박스/서명 분리 파서
- Vision 재검증 경로

---

## 5.5 상태 머신은 개념 반영 단계이며 장기 오케스트레이션은 아직 미도입

현재 상태:
- 상태 enum 존재
- 승인/재분석 흐름 존재
- persistence 이벤트 존재

추가 필요:
- 명시적 상태 전이 규칙 표준화
- 전이 불가 조건 강제
- 장기 실행 resume/retry
- LangGraph/Temporal 기반 durable workflow

---

## 6. 다음 단계에서 완료될 업그레이드 항목

아래 항목을 다음 순차 구현 대상으로 본다.

## Phase A. 운영 가시성 강화

### A-1. workflow-status 응답 확장
현재 상태:
- 2차 완료

추가 완료 예정:
- 규칙 버전별 변경 diff 표시

기대 효과:
- 관리자 모달과 리포트에서 감사 추적 정보 직접 표시 가능

### A-2. Record Detail Modal 감사 패널 강화
현재 상태:
- 2차 완료

추가 완료 예정:
- `WorkflowStateTimeline` 시각 강화
- `EvidenceChecklistPanel` 성격 블록 추가
- 승인 전/후 상태 설명 보강

기대 효과:
- 승인권자가 “왜 잠겼는지 / 무엇을 보면 되는지”를 즉시 이해 가능

### A-3. Dashboard 백로그 카드 고도화
현재 상태:
- 1차 완료

추가 완료 예정:
- 룰 오버라이드 발생 수
- 최근 고위험 공종 분포를 더 상세한 차트로 확장
- 승인 대기열 drill-down 연결

기대 효과:
- 운영 리더가 우선순위를 빠르게 정리 가능

---

## Phase B. 보고서/감사 추적 강화

### B-1. Reports 화면 감사 근거 확장
현재 상태:
- workflow state
- risk decision
- approval state
- workflow run id
- approval summary
- evidence hash

추가 완료 예정:
- prompt version
- policy version
- override summary
- 감사 패키지용 JSON 근거 연결

### B-2. 감사 패키지 export 확장
완료 예정:
- JSON export 표준화
- 정책/프롬프트 snapshot 포함
- 승인 이력 포함
- 오버라이드 로그 포함

기대 효과:
- 법무/감사 대응 문서화 품질 향상

---

## Phase C. 정책 집행 정교화

### C-1. 룰셋 확장
우선 추가 후보:
- 개구부 보호 누락 세분화
- 이동식 비계 난간/아웃트리거 누락
- 고소작업 구명줄/작업발판 누락
- 굴착/흙막이 붕괴 징후 규칙
- 중량물 인양 작업 반경/신호수 규칙 강화

### C-2. 룰 버전 관리 체계 보강
현재 상태:
- `rule_version` 1차 반영 완료

추가 완료 예정:
- 규칙 버전별 변경 diff 표시
- 정책 변경 diff 기록 기반 마련
- 리포트/감사 패키지에 규칙 버전 설명 포함

기대 효과:
- “어떤 규칙 때문에 뒤집혔는가”를 더 명확히 추적 가능

---

## Phase D. 상태 머신 강화

### D-1. 상태 전이 규칙 명시화
완료 예정:
- 허용 전이표 정의
- 불허 전이 차단
- 승인 없는 완료 차단
- 수동검토 상태에서 바로 완료 금지

### D-2. 승인 액션 분리 정교화
완료 예정:
- 승인
- 반려
- 재분석 요청
- 증빙 보완 요청

기대 효과:
- 운영자 액션과 시스템 상태가 더 정교하게 대응됨

---

## Phase E. 멀티모달/실시간 컨텍스트 확장

### E-1. OCR 리스크 정교화
완료 예정:
- confidence 분포 저장
- 핵심 키워드 span confidence 저장
- 저신뢰 구간 관리자 강조 표시

### E-2. 실시간 컨텍스트 공급자 확장
완료 예정:
- 날씨 공급자 세분화
- 작업계획 공급자 세분화
- 센서 이벤트 공급자 세분화
- 현장 최근 경고 이력 공급자 추가

기대 효과:
- 같은 문서라도 당일 환경에 따라 보수적 판단이 가능해짐

---

## 7. 우선순위 권장

다음 순서로 진행하는 것이 가장 안정적이다.

1. `workflow-status` 응답 확장
2. `RecordDetailModal` 감사/오버라이드 패널 강화
3. `Dashboard` 승인 백로그/오버라이드 현황 강화
4. `Reports` 감사 근거 표시 강화
5. 룰셋 확장
6. 상태 전이 강제 강화
7. 멀티모달/실시간 공급자 고도화
8. LangGraph/Temporal 이전 검토

---

## 8. 리스크 및 유의사항

## 8.1 빌드 검증 환경 이슈

초기에는 터미널에서 `npm run build` 검증을 시도했으나,
실행 위치가 실제 워크스페이스 루트가 아닌 로컬 기본 경로로 잡혀 실패했다.

이후 실제 로컬 저장소 루트를 확인해 같은 명령을 다시 실행했고,
Vite production build가 정상 완료됨을 확인했다.

의미:
- 코드 진단 기준 오류는 없었음
- 실제 빌드 자체는 통과했으며, 이후 유의할 점은 "항상 올바른 workspace cwd에서 검증 실행"이라는 운영 절차 정렬이다

---

## 8.2 persistence는 연결 코드가 존재해도 운영 환경 변수 의존성이 큼

유의점:
- Supabase URL
- service role key 또는 anon key
- admin secret

즉, 코드 반영 완료와 운영 연결 완료는 구분해서 봐야 한다.

---

## 9. 최종 판단

현재 PSI 하네스 작업은 다음 상태로 평가한다.

### 현재 평가
- 구조 방향: 적합
- 상태 분리: 반영 중
- API 골격: 확보
- 룰 엔진: 1차 구현 완료
- 프롬프트 레이어: 1차 구현 완료
- 감사 추적 persistence: 1차 구현 완료
- 관리자 UI 연결: 부분 완료
- 보고서/감사 패키지: 확장 필요
- 멀티모달 억제: 초기 단계
- 장기 워크플로우 오케스트레이션: 미도입

### 결론
PSI는 이미 하네스 엔지니어링의 “설계 문서 단계”를 넘어서
“운영 가능한 1차 골격 구현 단계”에 진입했다.

다음 단계의 핵심은 새로 만드는 것이 아니라,
이미 존재하는 하네스 골격을 감사 가능하고 운영 가능한 수준으로 확장하는 것이다.

---

## 10. 즉시 실행 권장 액션

### 바로 진행 권장
1. `workflow-status` 응답 확장
2. `RecordDetailModal` 오버라이드/정책 버전 패널 추가
3. `Dashboard` 승인 대기/즉시 보호/오버라이드 현황 카드 확장
4. `Reports` 감사 근거 항목 확장

### 이후 진행 권장
5. 룰셋 고도화
6. 상태 전이 제한 강화
7. OCR 멀티모달 검증 고도화
8. LangGraph/Temporal 이전 검토

---

## 11. 한 줄 요약

PSI 하네스는 기본 서버 골격, 상태 분리, 룰 엔진, 프롬프트/정책 스냅샷 저장까지 확보됐고,
이제부터는 관리자 UI·보고서·감사 추적을 강화해 실제 운영 통제 시스템 수준으로 올리는 단계다.
