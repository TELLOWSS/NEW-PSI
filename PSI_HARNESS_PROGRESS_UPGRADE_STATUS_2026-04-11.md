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

현재 운영 기준 하네스 API는 개별 엔드포인트가 아니라 gateway 액션으로 집약되어 있다.

- `POST /api/gateway` + `harness.analyze`
- `POST /api/gateway` + `harness.approve`
- `POST /api/gateway` + `harness.reanalyze`
- `POST /api/gateway` + `harness.workflow-status`
- `POST /api/gateway` + `harness.persistence-health`

참고:
- 초기 구현은 `api/harness/*` 개별 엔드포인트 구조였으나,
- 현재는 Vercel Hobby 함수 수 제한 대응을 위해 `api/gateway.ts` 기준으로 통합 완료된 상태다.

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

### 완료 28. 증빙 검증에 manifest/JSON 메타 정합성 검사 추가
- 단순 SHA-256 검증 외에 JSON 파싱 가능 여부까지 함께 검증
- manifest 메타 대비 `harnessAuditSnapshot` 누락 여부를 추가 점검
- workflow run, prompt/policy/rule version, approval/override count, versionChangeSummary의 manifest-JSON 불일치 표를 검증 화면에 노출

### 완료 29. 증빙 검증 결과 리포트 저장 기능 추가
- 검증 완료 후 결과를 CSV로 저장해 운영팀 배포/보관이 가능하도록 반영
- 동일 결과를 JSON으로도 저장해 자동화 파이프라인이나 후속 분석 입력으로 재사용 가능하도록 반영
- 저장 리포트에 hash mismatch, invalid JSON, harness snapshot 누락, metadata mismatch 세부 항목을 구조화해 포함

### 완료 30. 관리자 모달 하네스 감사 요약 내보내기 추가
- `RecordDetailModal`에서 현재 레코드의 하네스 감사 상태를 CSV/JSON으로 즉시 저장 가능하도록 반영
- 저장 리포트에 workflow 상태, persistence 진단, analyzer/evaluator 요약, override/approval/timeline, version change summary를 포함
- 운영 검토자가 개별 레코드 단위로 감사 패키지와 별도 관리용 감사 요약을 함께 보관할 수 있도록 정리

### 완료 31. Dashboard 최근 7일 하네스 운영 요약 추가
- 최근 7일 기준 감사 이벤트, 승인/반려, 전이 차단, 재분석 실행 건수를 대시보드 메트릭으로 추가
- 최근 운영 흔적이 남은 대상 수와 우세 신호(전이 차단/재분석/승인)를 해석 카드로 노출
- 운영팀이 장기 누적 지표뿐 아니라 단기 운영 마찰과 승인 흐름도 한 화면에서 읽을 수 있도록 보강

### 완료 32. Reports 검증 결과 히스토리 누적 패널 추가
- Reports 증빙 검증 화면에 최근 세션 검증 결과를 최대 12건까지 누적 표시
- 성공/실패, 해시 불일치, 스냅샷 누락, 메타 불일치 누계를 요약 카드로 제공
- 검증 히스토리를 별도 CSV로 저장해 주간 운영 점검 자료로 재사용 가능하도록 반영

### 완료 33. Dashboard 공종별 최근 7일 하네스 집중도 표 추가
- 최근 7일 감사 이벤트를 공종별로 묶어 전이 차단, 승인/반려, 재분석 집중도를 표로 노출
- 각 공종별 최근 운영 대상 수와 총 감사 이벤트 수도 함께 제공
- 운영팀이 어떤 공종에서 단기 운영 마찰이 집중되는지 대시보드에서 바로 읽을 수 있도록 보강

### 완료 34. Reports 검증 히스토리에 package별 실패 패턴 요약 추가
- 최근 검증 히스토리를 package 단위로 다시 집계해 실패 package 수와 반복 실패 package 수를 바로 확인 가능하도록 반영
- 실패 횟수, hash mismatch, metadata mismatch, snapshot 누락, invalid JSON 기준 상위 package 표를 추가
- 운영팀이 어떤 증빙 패키지를 우선 재생성·재검증해야 하는지 Reports 화면에서 바로 판단할 수 있도록 보강

### 완료 35. Reports package 실패 패턴에 주요 원인 문구 추가
- package별 실패 집계에서 해시 불일치, 메타 불일치, 스냅샷 누락, 파싱 불가 JSON, 요약 해시 불일치, 누락 JSON을 원인 후보로 분류
- 가장 우세한 실패 원인을 notice 문구와 표 컬럼으로 함께 노출
- 운영팀이 실패 package를 단순 개수뿐 아니라 "어떤 유형의 실패가 반복되는지"까지 즉시 읽을 수 있도록 보강

### 완료 36. Reports 검증 히스토리 CSV/표에 실행별 주요 원인 추가
- 세션 검증 히스토리 각 실행에 대해 가장 큰 실패 원인을 별도 필드로 저장
- 검증 히스토리 테이블에 `주요 원인` 컬럼을 추가해 실행 단위 비교가 가능하도록 반영
- 검증 히스토리 CSV에도 `primaryFailureReason` 열을 포함해 외부 분석 시 원인 분류를 유지하도록 보강

### 완료 37. Reports 검증 히스토리에 실패 원인 분포 카드 추가
- 최근 세션 실패 실행을 기준으로 주요 실패 원인 분포를 별도 집계
- 최다 실패 원인, 원인 종류 수, 최근 실패 원인을 카드로 요약
- 실패 원인별 횟수·비중·최근 발생 시각을 표로 제공해 운영팀이 반복 실패 유형을 즉시 읽을 수 있도록 보강

### 완료 38. Reports 실패 원인별 권장 조치 문구 추가
- 해시 불일치, 메타 불일치, 스냅샷 누락, 파싱 불가 JSON, 누락 JSON, 요약 해시 불일치별 권장 조치 문구를 정리
- 최다 실패 원인 notice에 권장 조치를 직접 연결해 즉시 대응 방향을 제시
- 실패 원인 분포 표와 package 실패 패턴 표에도 권장 조치 컬럼을 추가해 운영자가 화면에서 바로 후속 조치를 판단할 수 있도록 보강

### 완료 39. Reports 검증 결과 JSON/CSV에 권장 조치 필드 확장
- 단건 검증 JSON 내보내기에 `primaryFailureReason`, `recommendedAction` 필드 추가
- 단건 검증 CSV 요약에도 주요 실패 원인과 권장 조치 행을 추가
- 검증 히스토리 CSV에도 실행별 권장 조치 열을 포함해 외부 공유 시 후속 조치 문맥이 유지되도록 보강

### 완료 40. Reports 검증 히스토리 로컬 유지 추가
- 세션 내 검증 히스토리를 브라우저 `localStorage`에 저장해 화면 새로고침 뒤에도 최근 12건을 유지하도록 반영
- 초기 로드시 저장된 히스토리를 복원하고, 이후 검증 결과가 갱신될 때마다 자동 동기화되도록 보강
- 운영팀이 세션 종료나 새로고침 이후에도 최근 검증 흐름을 이어서 확인할 수 있도록 정리

### 완료 41. Reports 검증 히스토리 초기화 및 보존 정책 추가
- 검증 히스토리에 최근 30일·최대 12건 보존 정책을 적용
- 화면에 보존 정책 안내 문구와 `히스토리 초기화` 버튼을 추가
- 초기화 시 화면 상태와 `localStorage` 저장본을 함께 비워 운영자가 검증 이력을 직접 리셋할 수 있도록 보강

### 완료 42. Reports 검증 히스토리에 실패 원인별 필터 추가
- 실패 원인 분포를 기준으로 `전체/원인별` 필터 버튼을 추가
- 검증 히스토리 표가 선택한 실패 원인에 맞는 실행만 보여주도록 반영
- 필터 대상이 사라지면 자동으로 `전체`로 복귀해 운영 흐름이 끊기지 않도록 보강

### 완료 43. Reports 검증 히스토리 필터 상태 로컬 유지 추가
- 실패 원인 필터 선택값도 `localStorage`에 저장해 새로고침 뒤에도 같은 탐색 맥락을 유지하도록 반영
- 초기 로드시 저장된 필터를 복원하고, 값이 유효하지 않으면 자동으로 `전체`로 정리되도록 보강
- 히스토리 초기화 시 필터 저장값도 함께 제거해 상태가 뒤섞이지 않도록 정리

### 완료 44. Reports 검증 히스토리에 package 필터 추가
- 검증 히스토리에 `전체 패키지 / package별` 필터 버튼을 추가
- 실패 원인 필터와 package 필터를 함께 적용해 원하는 검증 실행만 좁혀서 볼 수 있도록 반영
- package 필터 선택값도 로컬에 저장하고 히스토리 초기화 시 함께 제거되도록 정리

### 완료 45. Reports 검증 히스토리에 성공/실패 상태 필터 추가
- 검증 히스토리에 `전체 / 성공 / 실패` 상태 필터 버튼을 추가
- 상태 필터와 실패 원인 필터, package 필터를 함께 조합해 원하는 검증 실행만 더 빠르게 추적할 수 있도록 반영
- 상태 필터 선택값도 로컬에 저장·복원하고 히스토리 초기화 시 함께 제거되도록 정리

### 완료 46. Dashboard 하네스 backlog / hotspot drill-down 추가
- 승인 대기, 즉시 보호, 저장 점검 대상을 Dashboard 안에서 바로 미리 볼 수 있는 `Harness Drill-down` 패널을 추가
- 최근 7일 공종 hotspot 표에서 공종명을 누르면 해당 공종 비교 분석과 미리보기가 동시에 열리도록 연결
- 운영자가 숫자 카드와 hotspot 표를 본 뒤 별도 재탐색 없이 바로 다음 확인 대상을 좁혀 볼 수 있도록 보강

### 완료 47. Record Detail 승인 패널 설명력 강화
- 승인 패널에 `승인 전 확인 포인트` 체크리스트와 `직전 승인 변화 해석` 블록을 추가
- 최신 승인 diff, 오버라이드 여부, 핵심 수정 여부를 함께 엮어 승인권자가 바로 검토 순서를 잡을 수 있도록 보강
- 타임라인 단계 의미 가이드를 추가해 `validation / approval / reassessment` 단계의 해석 부담을 줄임

### 완료 48. Reports 하네스 설명 문구와 감사 패키지 요약 강화
- 보고서 미리보기 영역에 승인 diff, 오버라이드, 버전 변경을 함께 읽는 `Report Governance Narrative` 카드를 추가
- 증빙 패키지 `README.txt`와 manifest entry에 승인 diff 요약과 오버라이드 요약을 함께 담아 외부 공유 시 설명 문맥이 유지되도록 보강
- 보고서를 단순 출력물이 아니라 “왜 이런 판단이 나왔는지”까지 전달하는 감사형 문서 흐름으로 강화

### 완료 49. 상태 전이 규칙 강제와 workflow-status 액션 가시화 강화
- `approve / reject / request-reanalysis / reanalyze` 액션별 허용 여부, 차단 사유, 다음 상태를 계산하는 전이 요약 로직을 추가
- 반려와 재분석 요청에는 8자 이상 판단 근거 코멘트를 강제하고, 2차 재분석 진행 중 중복 승인/재분석 액션을 차단하도록 보강
- `workflow-status` 응답에 현재 가능한 액션과 차단 사유를 함께 내려 운영 UI가 같은 기준으로 상태머신을 해석할 수 있도록 정리

### 완료 50. Record Detail에 workflow-status 액션 가시성 연결 마감
- 관리자 모달 `하네스 승인 게이트` 아래에 현재 가능한 액션, 차단 사유, 다음 상태를 바로 읽을 수 있는 상태머신 요약 UI를 추가
- 감사 JSON/CSV 내보내기에도 허용/차단 액션 요약을 포함해 운영 검토와 외부 공유 기준을 일치시킴
- 상태머신 규칙이 서버에만 머물지 않고 관리자 화면에서 즉시 해석되는 마감 연결을 완료

### 완료 51. Reports 미리보기에 workflow-status 액션 준비도 연결
- 보고서 미리보기에도 `Action Readiness` 카드를 추가해 현재 허용 액션, 차단 사유, 다음 상태를 함께 읽을 수 있도록 보강
- 승인 diff, 오버라이드, 버전 변경, 액션 가능 여부가 한 화면에서 이어져 보고서 해설과 운영 판단이 분리되지 않도록 정리
- 관리자 모달뿐 아니라 보고서 검토 화면에서도 같은 상태머신 기준으로 후속 조치를 판단할 수 있게 연결

### 완료 52. 등록 근로자 삭제 후 수량/중복 메타 즉시 반영 보강
- 등록 근로자 목록 상태를 `행 목록 + 중복 메타` 단위로 함께 갱신하는 스냅샷 헬퍼를 추가
- 단건 삭제, 일괄 삭제, 복구 직후에도 등록자 수·완전 동일 중복 수·동명이인 그룹 수가 즉시 다시 계산되도록 보강
- 삭제 성공 메시지를 유지한 채 서버 재조회까지 이어 붙여, 삭제는 됐지만 화면 수량이 안 줄어드는 체감 문제를 정리

### 완료 53. Dashboard drill-down을 근로자 관리 필터로 직접 연결
- Dashboard의 하네스 drill-down 상태를 URL 파라미터로 넘겨 `WorkerManagement`가 그대로 이어받도록 연결
- 승인 대기 / 즉시 보호 / 저장 점검 / 공종 hotspot 선택 시 근로자 관리센터에서 같은 조건으로 목록이 즉시 좁혀지도록 보강
- 근로자 관리센터 상단에 Dashboard 유입 필터 배너와 해제 액션을 추가해 현재 탐색 맥락을 잃지 않도록 정리

### 완료 54. Record Detail 승인 게이트 실행 가이드 압축 보강
- 하네스 승인 게이트에 `권장 실행 가이드`와 `액션 실행 전 체크` 블록을 추가해 다음 액션을 바로 읽을 수 있도록 보강
- `approve / reject / request-reanalysis / reanalyze` 액션 라벨과 다음 상태 표시를 운영용 한글 문구로 통일
- 허용 액션이 없을 때는 대표 차단 사유와 선행 보완 포인트를 바로 보여주도록 정리

### 완료 55. workflow-status 액션 문구 공통화 및 Reports 정렬
- 상태 전이 액션 라벨/설명/허용·차단 내러티브를 공통 유틸로 분리해 `RecordDetailModal`과 `Reports`가 같은 문구 기준을 쓰도록 정리
- Reports `Action Readiness` 카드가 `승인 / 반려 / 재분석 요청 / 재분석 실행` 한글 라벨과 다음 상태 문구를 동일 기준으로 노출하도록 보강
- 운영 화면과 보고서 화면의 상태머신 해석이 달라 보이지 않도록 액션 설명 문맥을 일치시킴

### 완료 56. Reports 액션 실행 체크 요약 추가
- Reports `Action Readiness` 카드 아래에 `권장 실행 가이드`와 `액션 실행 전 체크` 블록을 추가해 보고서 화면만으로도 다음 운영 액션을 바로 읽을 수 있도록 보강
- 상태 전이 실행 가이드 체크리스트를 공통 유틸로 확장해 보고서와 운영 화면이 같은 실행 포인트를 공유하도록 정리
- 보고서 검토자가 관리자 모달로 다시 이동하지 않아도 선행 확인 포인트와 다음 상태를 같은 화면에서 판단할 수 있게 연결

### 완료 57. 상태 전이 차단 사유 운영 문구 정규화
- 서버에서 내려오는 상태 전이 차단 사유를 짧은 운영 문구로 변환하는 공통 헬퍼를 추가
- `Reports`와 `RecordDetailModal`이 `현재 상태(uploaded)` 같은 내부 표현 대신 `업로드됨 상태에서는 승인할 수 없습니다` 형태로 같은 문구를 쓰도록 정리
- 장문 차단 사유를 축약해 운영자가 대표 사유를 더 빠르게 읽고 다음 조치를 판단할 수 있게 보강

### 완료 58. Vercel 서버 타입 오류 1차 정리
- `persistHarnessApproval`의 Supabase insert payload를 명시 row 변수로 분리하고 삽입 타입을 보강해 `never` 오버로드 충돌을 우회
- `persistHarnessAnalysis`가 `HarnessInputValidationResult`와 `HarnessEvaluationOutput`을 직접 받을 수 있게 시그니처를 보강
- `api/harness/reanalyze.ts`의 재분석 결정값에 `HarnessDecisionResult` 명시 타입을 부여해 `workflowState: string` widen 오류를 정리

### 운영 블로커. Vercel Hobby 함수 수 제한
- 현재 배포 로그 기준 빌드 이후 최종 실패 원인은 TypeScript 오류 외에 `Hobby plan 12개 Serverless Function 제한`이다
- 현재 `api/*` 엔드포인트 수가 제한을 초과하므로, 최종 배포 완료를 위해서는 `엔드포인트 통합(gateway 집약)` 또는 `Pro plan 전환`이 필요하다

### 완료 59. 하네스 API를 gateway 기준으로 집약
- `api/harness/analyze.ts`, `approve.ts`, `reanalyze.ts`, `workflow-status.ts`를 함수 엔드포인트에서 제거하고 `lib/server/harness/handlers/*` 공통 핸들러로 이동
- `api/gateway.ts`가 하네스 공통 핸들러를 직접 연결하도록 바꿔, 기능은 유지하면서 Vercel 함수 개수를 4개 줄이도록 정리
- 현재 기준 함수 수는 `admin 10 + harness 1(persistence-health) + gateway 1 = 12` 구조로 Hobby 제한선에 맞춘 상태다

### 완료 60. persistence-health까지 gateway로 편입
- `harness.persistence-health` 액션을 gateway에 추가하고, persistence health 응답도 하네스 공통 핸들러에서 처리하도록 정리
- `services/harnessService.ts`가 `/api/harness/persistence-health` 대신 gateway 액션을 사용하도록 변경
- 전용 `api/harness/persistence-health.ts` 파일을 제거해 하네스 전용 Serverless Function을 완전히 없애고 `gateway 1개` 체계로 정리

### 완료 61. 로컬 TypeScript 전수 오류 0건 정리
- `App.tsx`, `WorkerManagement.tsx`의 경계 컴포넌트 타입 접근과 `WorkerRecord` 기본값 누락을 보정해 상위 타입 오류를 정리
- `SafetyActionCenter`, `IndividualRadarChart`, `AdminTraining`, `Settings`, `OcrAnalysis`, `SafetyChecks`의 저위험 타입 오류를 묶음으로 정리
- `NationalityChart`의 Chart.js v4 옵션 타입과 `geminiService.ts`의 누락 import·프롬프트 변수·반환 타입 문제를 정리하고, 테스트 파일은 tsconfig exclude로 분리
- 최종적으로 `npx tsc --noEmit` 전체 기준 오류 0건을 확인

### 완료 62. 비핸들러 API 공유 모듈을 `api/` 밖으로 이관
- `api/shared/multilingualIntegrityEmbedding.ts`는 Vercel 요청 핸들러가 아닌 공유 로직이므로 `lib/server/shared/multilingualIntegrityEmbedding.ts`로 이동
- 이 정리로 배포 함수 트리는 실질적으로 `admin 10 + gateway 1` 구조만 남도록 정리해 Hobby 함수 수 리스크를 한 단계 더 낮춤
- 실제 Vercel 사전 검증은 코드 문제가 아니라 로컬 토큰 무효(`vercel build` 인증 실패) 상태 때문에 최종 확인만 남아 있음

### 완료 63. 배포 환경변수 체크리스트를 현재 코드 기준으로 재정렬
- `DEPLOYMENT_ENV_CHECKLIST.md`에 `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `VERCEL_TOKEN`을 추가해 실제 서버/배포 프리플라이트 필수 항목을 반영
- gateway 및 harness persistence 기준 참조 지점을 문서에 연결해 운영자가 프론트 전용 키와 서버 쓰기 키를 혼동하지 않도록 정리
- 배포 전 점검 순서에 `api 함수 수 확인`과 `vercel build 인증 검증` 단계를 추가해 현재 남은 블로커를 문서 기준으로 고정

### 완료 64. 진행 문서의 현재 하네스 API 표기를 gateway 기준으로 정규화
- 현황 문서의 `3.3 하네스 API` 구간을 현재 운영 구조에 맞게 `POST /api/gateway + harness.*` 액션 체계로 교체
- 과거 `api/harness/*` 분리 엔드포인트는 초기 구현 단계였고, 현재는 배포 제약 대응까지 반영된 통합 상태임을 문서에 명시
- 운영자/평가자가 문서만 읽고도 현재 호출 경로와 과거 이행 경로를 구분할 수 있도록 정리

### 완료 65. 세션 핸드오프 문서의 하네스 경로를 현재 구조로 동기화
- `SESSION_RESUME_HANDOFF_2026-04-10.md`의 우선 확인 파일과 persistence 진단 레이어 설명을 `api/gateway.ts` 및 `lib/server/harness/handlers/*` 기준으로 갱신
- `NEXT_SESSION_HANDOFF_2026-04-09.md`의 초기 `api/harness/*` 설명은 유지 맥락만 남기고, 현재 운영 진입점이 gateway 통합 구조임을 명시
- 이 정리로 다음 세션 재개 시 과거 문서 때문에 잘못된 API 경로를 따라가는 혼선을 줄이도록 보강

### 완료 66. 배포 프리플라이트 최종 요약 섹션 추가
- 현재 배포 준비 상태를 `코드/함수 수/환경변수/인증` 4개 축으로 압축 정리해 운영자가 남은 블로커를 한눈에 확인할 수 있도록 정리
- `코드 빌드 통과`, `함수 수 기준선 정리`, `환경변수 체크리스트 반영`, `Vercel 토큰 인증 대기`를 분리 표기해 구현 이슈와 운영 이슈를 명확히 구분
- 다음 턴에서 구현을 재개하더라도 배포 재검증 선행 조건이 무엇인지 문서만 보고 즉시 판단 가능하게 보강

### 완료 67. 즉시 실행 권장 액션을 현재 단계 기준으로 재정렬
- 기존 초기 단계 기준 액션 목록을 현재 상태에 맞게 `배포 재검증 선행 조건`과 `운영 통제 완성 트랙 후속 작업`으로 재구성
- 이미 상당 부분 완료된 `workflow-status 확장`, `Record Detail 설명력`, `Reports 감사 근거` 항목은 후속 고도화 관점으로 정리하고, 직접 블로커인 `Vercel 인증 복구`를 최상단으로 승격
- 문서만 읽고도 `지금 당장 해야 할 일`과 `인증 복구 후 이어갈 구현 묶음`을 구분할 수 있도록 정리

### 완료 68. 구현/전략 상태 문서의 하네스 진입 경로도 현재 구조로 정합화
- `PSI_BRAND_IMPLEMENTATION_STATUS_2026-04-09.md`의 오래된 `api/harness/*` 중심 서술을 `api/gateway.ts` + `lib/server/harness/handlers/*` 기준으로 최신화
- `PSI_HARNESS_ENGINEERING_ARCHITECTURE_IMPLEMENTATION_STRATEGY_2026-04-10.md`의 Guardrails 계층 설명도 실제 운영 구조에 맞게 보정
- 이 정리로 진행 문서, 핸드오프 문서, 구현 상태 문서, 전략 문서 간 하네스 진입점 설명이 같은 기준으로 맞춰짐

### 완료 69. 전략 문서의 API 전략/폴더 구조 예시까지 gateway 기준으로 정규화
- `PSI_HARNESS_ENGINEERING_ARCHITECTURE_IMPLEMENTATION_STRATEGY_2026-04-10.md`의 예시 폴더 구조에서 `api/harness/*`를 `api/gateway.ts` + `lib/server/harness/handlers/*` 구조로 갱신
- 같은 문서의 `API 전략` 구간도 `POST /api/gateway + harness.*` 액션 기준으로 교체하고 `harness.persistence-health`까지 포함
- `NEXT_SESSION_HANDOFF_2026-04-09.md`의 하단 파일 목록/오류 확인 항목도 현재 파일명 기준으로 동기화해 남아 있던 마지막 구형 경로를 줄임

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
1. `VERCEL_TOKEN` 유효성 복구 후 `vercel build` 재검증
2. `api/*` 함수 수 기준선(`admin 10 + gateway 1`) 재확인
3. 배포 환경변수 체크리스트 기준으로 서버 키/프론트 키 최종 점검
4. 배포 재검증 완료 후 `운영 통제 완성` 트랙 1개 묶음만 재개

### 이후 진행 권장
5. `Dashboard` drill-down 연결 후속 마감
6. `workflow-status` 액션/차단 사유 표준 문구 고정
7. 감사 패키지 README/manifest/JSON 템플릿 잠금
8. 정책·룰 diff 설명 체계 경량화

---

## 11. 한 줄 요약

PSI 하네스는 기본 서버 골격, 상태 분리, 룰 엔진, 프롬프트/정책 스냅샷 저장까지 확보됐고,
이제부터는 관리자 UI·보고서·감사 추적을 강화해 실제 운영 통제 시스템 수준으로 올리는 단계다.

---

## 12. 토큰 절약형 진행 원칙

앞으로는 건별 직행보다, 아래 방식으로 묶음 단위로 진행하는 것이 효율적이다.

### 12.1 기본 원칙
- 한 번에 한 묶음만 진행한다.
- 이미 확인한 파일은 변경 범위가 생길 때만 다시 읽는다.
- 진행 보고는 “무엇을 바꿨는지 / 무엇이 남았는지 / 검증 결과”만 짧게 남긴다.
- 빌드는 모든 작은 수정마다 반복하지 않고, 의미 있는 묶음 완료 시점에만 실행한다.
- 진행 문서는 모든 세부 로그를 누적하지 않고, 완료 기준이 명확한 항목만 갱신한다.

### 12.2 1회 작업 단위 표준
1. 최소 범위 확인
2. 관련 파일 묶음 수정
3. 변경 파일 오류 확인
4. 필요 시 1회 빌드
5. 진행 문서 1회 갱신

즉, 이후에는 “탐색 → 수정 → 검증 → 기록”을 짧은 한 사이클로 유지한다.

---

## 13. 평가자 관점 우선순위 정리

평가자 관점에서는 아래 3개 기준으로만 우선순위를 잡는 것이 적절하다.

### 13.1 우선순위 기준
- 운영 영향도: 실제 관리자 판단과 감사 대응에 얼마나 직접적인가
- 의존성: 다음 작업의 기반이 되는가
- 변경 대비 효과: 적은 수정으로 큰 가시성 향상을 얻는가

### 13.2 현재 최우선 묶음
1. Dashboard drill-down 연결 강화
   - 운영자가 카드 숫자에서 바로 대상 목록으로 내려갈 수 있어야 함
2. 관리자 승인 패널 설명력 강화
   - 승인 전/후 차이와 확인 포인트를 더 직접적으로 보여줘야 함
3. workflow-status 버전 diff 설명 보강
   - prompt/policy/rule 변경점을 같은 문맥에서 설명해야 함
4. 상태 전이 규칙 강제 정교화
   - 운영 통제 관점에서 가장 중요한 안전장치이므로 뒤로 미루면 안 됨

### 13.3 후순위 묶음
- 감사 패키지 JSON/PDF 포맷 고도화
- OCR 저신뢰 구간 강조
- 실시간 컨텍스트 공급자 세분화
- LangGraph/Temporal 이전 검토

---

## 14. 실무자 관점 실행 방식

실무자 관점에서는 아래처럼 “작업 묶음”으로 나누는 것이 가장 토큰 효율이 좋다.

### 묶음 A. Dashboard 운영 연결
- 대상: backlog 카드, hotspot 카드, 승인 대기열 연결
- 완료 기준: 숫자 카드 클릭 시 같은 화면의 필터/목록이 즉시 바뀜

### 묶음 B. Record Detail 승인 패널 고도화
- 대상: 승인 전/후 diff, 체크 포인트, 타임라인 의미 문구
- 완료 기준: 승인권자가 추가 설명 없이도 검토 포인트를 파악 가능

### 묶음 C. workflow-status / Reports 설명력 강화
- 대상: version diff, override 설명, approval diff 문장화
- 완료 기준: 보고서와 감사 패키지에서 변경 이유를 바로 설명 가능

### 묶음 D. 상태 전이 강제
- 대상: 허용 전이표, 불허 차단, 승인 없는 완료 차단
- 완료 기준: 잘못된 운영 액션이 API 레벨에서 차단됨

즉, 앞으로는 세부 요청이 반복되더라도 위 4개 묶음 기준으로만 진행하면 된다.

---

## 15. 앞으로의 진행 방식 선언

이후 진행은 다음처럼 고정한다.

- 매 턴마다 새로운 전체 진단을 반복하지 않는다.
- 가장 가치가 큰 묶음 하나만 선택해 처리한다.
- 완료 후에는 짧게 진행률과 남은 항목만 보고한다.
- 필요 없는 중간 설명, 중복 요약, 중복 파일 탐색은 줄인다.

현재 기준 다음 직행 묶음은 아래로 둔다.

### 다음 직행 묶음
- `Dashboard` drill-down 연결 강화

이 항목은 적은 수정으로 운영 가시성을 크게 올릴 수 있어,
토큰 대비 효과가 가장 높다.

---

## 16. 장기 고도화 백로그 정리 (압축본)

다음부터는 구현 항목을 무한 확장하지 않고,
운영 전환과 감사 대응 기준으로 아래 5개 트랙만 관리한다.

### Track 1. 운영 통제 완성
- Dashboard backlog/hotspot/action drill-down 완결
- Record Detail 승인 게이트 설명력 고도화
- workflow-status 액션/차단 사유/다음 상태 표준화
- 승인·반려·재분석·보완요청 운영 가이드 문구 통일

완료 기준:
- 운영자가 별도 구두 설명 없이도 “지금 가능한 액션 / 막힌 이유 / 다음 확인 대상”을 같은 화면에서 판단 가능

### Track 2. 감사 패키지 표준화
- Reports 감사 서술과 증빙 패키지 README/manifest/JSON 필드 표준 고정
- approval diff / override summary / version change summary 공통 템플릿화
- 패키지 검증 실패 원인별 운영 조치 문구 표준화

완료 기준:
- 외부 공유용 패키지 1건만으로도 판단 근거, 변경 이력, 검증 상태를 재구성 가능

### Track 3. 정책·룰 거버넌스 강화
- rule diff 설명 체계 정식화
- 고위험 공종 룰셋 확장 우선순위 확정
- prompt/policy/rule 버전 릴리스 노트 경량 포맷 고정

완료 기준:
- “왜 뒤집혔는가 / 어떤 버전이 적용됐는가 / 이전과 뭐가 달라졌는가”를 운영 문서와 UI 모두에서 일관되게 설명 가능

### Track 4. OCR·멀티모달 신뢰도 고도화
- 저신뢰 span 시각화
- 텍스트-이미지 불일치 탐지
- 표/체크박스/서명 파서 분리
- vision 재검증 경로 정의

완료 기준:
- OCR 품질 저하가 단순 경고에 그치지 않고, 관리자 재검토 포인트로 직접 연결됨

### Track 5. Durable Workflow 전환 준비
- 상태 전이표 문서/코드 일치화
- resume/retry/idempotency 설계
- LangGraph/Temporal 이전 조건 체크리스트 정리

완료 기준:
- 장기 실행, 재시도, 장애 복구 요구가 생겨도 현재 하네스 구조에서 무리 없이 이전 설계 가능

---

## 17. 착수 순서 확정 (2026-04-11 기준)

아래 순서로만 진행하면 된다.

### 1순위. 운영 통제 완성
- 이유: 현재 운영 효과가 가장 크고, 이미 구현된 UI/상태머신 자산을 바로 활용 가능
- 다음 세부 착수:
   1. Dashboard drill-down 클릭 흐름 고정
   2. Record Detail 승인 게이트 설명 문구 정리
   3. workflow-status 액션 표준 문구 공통화

### 2순위. 감사 패키지 표준화
- 이유: 외부 제출/내부 감사 대응 품질을 가장 빨리 끌어올릴 수 있음
- 다음 세부 착수:
   1. README/manifest/JSON 공통 템플릿 확정
   2. approval/override/version 설명 문장 재사용화
   3. 검증 실패 리포트 포맷 잠금

### 3순위. 정책·룰 거버넌스 강화
- 이유: 운영 화면 설명력이 확보된 다음에 붙여야 변경 해석 비용이 줄어듦
- 다음 세부 착수:
   1. rule diff 표현 포맷 확정
   2. 공종별 추가 룰 우선순위 확정
   3. 릴리스 노트 경량화

### 4순위. OCR·멀티모달 신뢰도 고도화
- 이유: 효과는 크지만 데이터·UI·검증 로직을 함께 건드려야 해 범위가 큼

### 5순위. Durable Workflow 전환 준비
- 이유: 현재 1차 운영형 완성권에서는 선행 과제들이 먼저 닫혀야 투자 대비 효과가 높음

---

## 18. 다음 턴 실행 원칙 확정

다음 턴부터는 아래 형식으로만 진행한다.

1. 장기 백로그에서 한 묶음만 선택
2. 해당 묶음의 착수 항목 1~3개만 처리
3. 완료 후 진행 문서에 `완료 n`만 추가
4. 필요 시에만 빌드 1회 검증

즉, 다음 턴 기본값은 아래다.

- 기본 작업 모드: `장기 고도화 백로그 정리 + 착수 순서 확정` 유지
- 구현 착수 기본 우선순위: `운영 통제 완성` 트랙
- 다음 후보 작업: `Dashboard drill-down 연결 강화` 후속 마감

---

## 19. 배포 프리플라이트 최종 요약 (2026-04-11 기준)

현재 배포 준비 상태는 아래 4개 축으로 보면 된다.

### 19.1 코드 상태
- `npx tsc --noEmit` 기준 오류 0건 정리 완료
- `npm run build` 기준 프로덕션 빌드 통과 확인
- 즉, 현재 남은 주된 배포 리스크는 코드 컴파일보다 운영 환경 쪽이다.

### 19.2 함수 수 상태
- 현재 함수 기준선은 `admin 10 + gateway 1`
- `api/harness/`와 `api/shared/`는 비어 있는 상태를 유지해야 함
- 비핸들러 공유 모듈은 `lib/server/*`로 두는 원칙을 유지해야 Hobby 함수 수 리스크를 다시 만들지 않음

### 19.3 환경변수 상태
- 필수 서버 키: `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `VITE_PSI_ADMIN_SECRET`
- 필수 프론트/공용 키: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- 배포 전 점검 기준은 `DEPLOYMENT_ENV_CHECKLIST.md`를 단일 기준 문서로 사용

### 19.4 현재 남은 직접 블로커
- `vercel build` 재검증은 현재 `VERCEL_TOKEN` 무효 상태 때문에 완료되지 않음
- 따라서 남은 최종 선행 조건은 `유효한 Vercel 인증 토큰 확보`다
- 이 조건이 해결되면 다음 순서는 `vercel build` 재실행 → 함수 수/설정 재확인 → 실제 배포 검증이다

### 19.5 운영 판단
- 구현 관점: 1차 운영형 완성권에 진입
- 배포 관점: 코드 준비 완료, 인증 재정비 대기
- 다음 구현은 가능하지만, 실제 배포 완료 판정은 Vercel 인증 복구 후에만 닫을 수 있음
