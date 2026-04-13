# SESSION RESUME HANDOFF (2026-04-13, 최종 업데이트)

> **⚠️ 중요**: 이 파일을 열면 전체 업그레이드 현황을 즉시 파악 가능.  
> 다음 세션 시작 시 **섹션 4(잔여 작업)**부터 확인.  
> 로컬에서 `npm run verify:release` 실행 전 반드시 **`git pull`** 먼저 실행.

---

# 🔷 파트 A — 하네스 엔지니어링 업그레이드 현황

## A-1. 아키텍처 개요

| 계층 | 위치 | 역할 |
|------|------|------|
| 게이트웨이 | `api/gateway.ts` | POST /api/gateway — harness.* 액션 라우팅 |
| 핸들러 | `lib/server/harness/handlers/` | analyze / approve / reanalyze / workflow-status / persistence-health |
| 룰 엔진 | `lib/server/harness/ruleEngine.ts` | 결정론적 가드레일 — 11개 룰 순차 실행 |
| 룰 파일 | `lib/server/harness/rules/` | 순수 함수 단위 룰 (LLM 개입 없음) |
| 에이전트 | `lib/server/harness/agents/` | analyzer.ts / evaluator.ts (LLM 결과 처리) |
| 정책 레지스트리 | `lib/server/harness/policyRegistry.ts` | 키워드 그룹, 임계값, 버전 상수 |
| 감사 로거 | `lib/server/harness/auditLogger.ts` | 6단계 이벤트 빌드 |
| 영속성 | `lib/server/harness/persistence.ts` | Supabase 5개 테이블 |
| 프롬프트 | `lib/server/harness/promptLayers.ts` | 8줄 정적 지식 + 동적 컨텍스트 |

**4축 상태 모델:**
- `HarnessWorkflowState`: uploaded → ocr_validating → manual_review_required → context_ready → first_pass_analyzing → evaluator_review → awaiting_manager_approval → manager_revised → second_pass_analyzing → completed
- `HarnessRiskDecision`: SAFE_TO_PROCEED | SUPPLEMENTARY_REVIEW | IMMEDIATE_ATTENTION | CRITICAL_STOP
- `HarnessApprovalState`: NOT_REQUIRED | REQUIRED | PENDING | APPROVED | REJECTED
- `secondPassStatus`: NEEDED | IN_PROGRESS | DONE

---

## A-2. 룰 엔진 전체 룰 목록 (현재 11개)

| 순서 | 함수 | 파일 | 트리거 | 결과 |
|------|------|------|--------|------|
| 1 | evaluateFallProtectionRule | fallProtectionRules.ts | 추락 문맥 + 안전대 없음 | CRITICAL_STOP |
| 2 | evaluateOpeningRule | openingRules.ts | 개구부/고소작업 + 안전덮개 없음 | CRITICAL_STOP |
| 3 | evaluateScaffoldRule | scaffoldRules.ts | 비계 + 아웃트리거 없음 | IMMEDIATE_ATTENTION |
| 4 | evaluateCraneRule | craneRules.ts | 크레인 + 신호수 없음 | IMMEDIATE_ATTENTION |
| 5 | evaluateCraneWeatherRule | craneRules.ts | 크레인 + 풍속 ≥10m/s | SUPPLEMENTARY_REVIEW |
| 6 | evaluateShoringRule | shoringRules.ts | 동바리 + 깔판/잭베이스 없음 | CRITICAL_STOP |
| 7 | evaluateShoringWeatherRule | shoringRules.ts | 동바리 + 강우/침하 문맥 | SUPPLEMENTARY_REVIEW |
| 8 | evaluateExcavationRule | excavationRules.ts | 굴착 + 버팀대/어스앙카 없음 | CRITICAL_STOP |
| 9 | evaluateExcavationRainRule | excavationRules.ts | 굴착 + 강우량>0 또는 강우 텍스트 | IMMEDIATE_ATTENTION |
| 10 | evaluateLiftingRule | liftingRules.ts | 중량물 인양 + 줄걸이 없음 | IMMEDIATE_ATTENTION |
| 11 | evaluateLiftingWindRule | liftingRules.ts | 인양 + 풍속 ≥10m/s | CRITICAL_STOP |
| +gate | HIGH_RISK_JOBTYPE_REVIEW | ruleEngine.ts | 고위험 공종 + SAFE_TO_PROCEED | SUPPLEMENTARY_REVIEW |

---

## A-3. 세션별 완료 작업 누적 기록

### 🗓️ 이전 세션 (2026-04-10 ~ 2026-04-11) — 基盤 구축
- `lib/server/harness/` 디렉토리 전체 구조 생성
- workflowTypes.ts, policyRegistry.ts, ruleEngine.ts, contextAssembler.ts
- agents/analyzer.ts, agents/evaluator.ts
- auditLogger.ts, inputValidators.ts, outputValidators.ts
- persistence.ts (Supabase 5테이블 연동)
- promptLayers.ts, router.ts
- handlers: analyze.ts, approve.ts, reanalyze.ts, workflow-status.ts, persistence-health.ts
- contextProviders/dynamicContext.ts
- rules: fallProtectionRules.ts, scaffoldRules.ts, craneRules.ts, shoringRules.ts(weather만)
- verify:release 최초 통과

### 🗓️ 2026-04-13 배치 1 — 룰 확장 + 엔진 버그픽스
- ✅ `rules/openingRules.ts` 신규 — OPENING_BARRIER_MISSING (CRITICAL_STOP)
- ✅ `rules/excavationRules.ts` 신규 — EXCAVATION_SUPPORT_MISSING (CRITICAL_STOP) + EXCAVATION_RAIN_RISK (IMMEDIATE_ATTENTION)
- ✅ `rules/liftingRules.ts` 신규 — LIFTING_CONTROL_MISSING (IMMEDIATE_ATTENTION) + LIFTING_HIGH_WIND (CRITICAL_STOP)
- ✅ `policyRegistry.ts` — opening/excavation/lifting 키워드 그룹 추가, minTextLength 24→50, 버전 2026-04-13
- ✅ `ruleEngine.ts` — **클로저 캡처 버그 수정** (stale decision 방지), 10→11룰 확장, jobType 게이트 강화
- ✅ verify:release PASS

### 🗓️ 2026-04-13 배치 2 — 레이어 정밀화
- ✅ `agents/analyzer.ts` — HAZARD_PATTERNS 테이블 방식(6카테고리), 날씨 통합, rainfallMm 필드 수정
- ✅ `agents/evaluator.ts` — INSUFFICIENT_EVIDENCE_VOLUME 플래그, 위험수×8 감점, hazardCount>0→인간승인 강제
- ✅ `auditLogger.ts` — 4→6단계, analyzer/evaluator 스테이지 추가, 실데이터 note
- ✅ `inputValidators.ts` — HIGH_RISK_EVIDENCE_THIN 신규 이슈, 임계값 120자로 상향
- ✅ `handlers/reanalyze.ts` — secondPassStatus 버그 수정 (NEEDED→IN_PROGRESS 올바른 전환)
- ✅ `handlers/analyze.ts` + `handlers/reanalyze.ts` — auditLogger 호출에 analyzer/evaluator 전달
- ✅ `promptLayers.ts` — 정적 지식 4→8줄 (개구부/비계/크레인/동바리/복합날씨 규칙)
- ✅ verify:release PASS

### 🗓️ 2026-04-13 배치 3 — 구조 완성 (현재 세션)
- ✅ `rules/shoringRules.ts` — `evaluateShoringRule` 신규 (SHORING_SUPPORT_MISSING → CRITICAL_STOP)
- ✅ `ruleEngine.ts` — shoringRule 연결, 실행 순서 11개로 확정
- ✅ `outputValidators.ts` — 항목별 타입 검증, confidence 범위(0~1) 검증 강화
- ✅ `router.ts` — `reject` 흐름 수정: awaiting_manager_approval → `manager_revised` (순환 혼선 방지), riskDecision 자동 상향
- ✅ `vitest.config.ts` — 신규 생성 (테스트 인프라)
- ✅ `lib/server/harness/rules/__tests__/rules.test.ts` — 11개 룰 함수 단위 테스트 (27 케이스)
- ✅ `package.json` — `"test": "vitest run"`, `"test:watch": "vitest"` 스크립트 추가
- ✅ verify:release PASS

### 🗓️ 2026-04-13 배치 4 — 검증/연동 정합성 보강
- ✅ `outputValidators.ts` — `validateEvaluatorOutput` 추가 (evidenceSufficiency/flags/requiresHumanApproval 검증)
- ✅ `handlers/analyze.ts` — `evaluatorValidation` 계산 및 응답 페이로드 포함
- ✅ `handlers/reanalyze.ts` — analyzer/evaluator validation 결과 동시 반환
- ✅ `components/modals/RecordDetailModal.tsx` — `inferHarnessWorkflowState`에서 `workflowState` 우선 사용 + `reviewStatus: REJECTED` 시 `manager_revised` 추론
- ✅ `components/modals/RecordDetailModal.tsx` — version descriptor 계산 시 `ruleVersions`를 string[]로 명시 협소화
- ✅ `pages/Reports.tsx` — `extractMessage` 호출 시그니처 정합성 수정(단일 인자 + fallback)
- ✅ 변경 파일 5개 단위 진단(`get_errors`) 무에러 확인

---

## A-4. 핵심 버그픽스 요약 (재발 방지용)

| 버그 | 위치 | 원인 | 수정 내용 |
|------|------|------|-----------|
| 클로저 stale capture | ruleEngine.ts | `() => rule(text, decision)` 배열 생성 시 decision 고정 | `(d) => rule(text, d)` + 호출 시 `evaluateRule(decision)` |
| secondPassStatus 미갱신 | handlers/reanalyze.ts | `...decisionResult` 스프레드로 NEEDED 상속 | 명시적 할당: completed→DONE, 나머지→IN_PROGRESS |
| precipitation 필드명 오류 | analyzer.ts, excavationRules.ts | `precipitationMm` (타입 없음) 사용 | `rainfallMm` (실제 타입 필드명)으로 수정 |
| reject 순환 흐름 | router.ts | reject 후 awaiting_manager_approval 복귀 → 관리자 재승인 불가 혼선 | reject → manager_revised 상태로 전환 |

---

## A-5. 잔여 작업 목록 (다음 세션 우선순위)

### 🔴 P1 — 커밋 필요 (현재 세션 변경사항 미커밋 상태)
```
⚠️ vscode-vfs에서 작업한 내용이 아직 git commit/push되지 않았습니다.
VS Code Source Control 패널에서 커밋한 후 로컬에서 git pull 실행.
그 후 npm run test 로 27개 단위 테스트 확인.
```

### 🟡 P2 — Supabase 라이브 환경 검증
- `harness.persistence-health` 실 Vercel/Supabase 환경 호출
- 확인 항목: `connected`, `tablesReady`, `keyMode(service_role)`, 5개 테이블 카운트
- 테이블: `ai_workflow_runs`, `ai_workflow_events`, `ai_human_approvals`, `ai_guardrail_overrides`, `ai_context_snapshots`

### 🟡 P3 — End-to-End 워크플로 검증
실제 OCR 레코드로 전체 체인 점검:
```
harness.analyze (recordId 포함)
  → workflowRunId 확인
  → harness.workflow-status 조회
  → harness.approve (action: 'approve', approver, comment)
  → 상태: completed / approvalState: APPROVED 확인
  → (선택) harness.approve (action: 'reject', comment 8자+)
  → 상태: manager_revised 확인
```

### 🟢 P4 — 단위 테스트 실행 (커밋 후)
```bash
git pull
npm run test
# 예상: 27 tests passed (rules.test.ts)
```

### ⚪ P5 — 추가 개선 (선택)
- `contextProviders/dynamicContext.ts` — 날씨 정규화 필드 추가 검토 완료 (rainfallMm 이미 올바르게 매핑됨)
- `outputValidators.ts` — evaluator output 검증 함수 추가 완료
- UI 연동: `Reports.tsx`, `RecordDetailModal.tsx` 하네스 상태 표시 정합성 보강 완료
- 잔여 UI 연동 점검: `OcrAnalysis.tsx`, `WorkerManagement.tsx` (별도 대형 변경 중이라 충돌 가능성 있음)

---

## A-6. 빠른 시작 체크리스트

```bash
# 1. 코드 동기화
git pull

# 2. 빌드 검증
npm run verify:release

# 3. 단위 테스트 (vitest 설치 후)
npm run test

# 4. 현재 룰 구조 확인
# lib/server/harness/rules/ 하위 8개 파일
# ruleEngine.ts 11개 룰 순서 확인

# 5. Supabase 라이브 테스트 (Vercel 환경에서)
# POST /api/gateway { gatewayAction: "harness.persistence-health" }
```

---

## A-7. Supabase 테이블 스키마 참조

| 테이블 | 주요 컬럼 | 용도 |
|--------|-----------|------|
| `ai_workflow_runs` | id, source_record_id, workflow_state, risk_decision, approval_state | 워크플로 메인 |
| `ai_workflow_events` | workflow_run_id, stage, note, created_at | 감사 이벤트 |
| `ai_human_approvals` | workflow_run_id, approver_name, action, decision_before, decision_after | 승인 이력 |
| `ai_guardrail_overrides` | workflow_run_id, rule_code, rule_version, severity, overridden_decision | 룰 오버라이드 |
| `ai_context_snapshots` | workflow_run_id, weather, sensor_events, ocr_confidence_score | 컨텍스트 스냅샷 |

---

# 🔶 파트 B — 리포트/UI 이전 세션 완료 사항

## 1) 금일 완료 사항 (핵심)

### A. 리포트 후면(부록) 안정화 + 설명량 확장
- `components/ReportTemplate.tsx`
- 2단계(dense/normal)에서 4단계 적응형 프로파일(`rich / balanced / compact / strict`)로 전환
- 콘텐츠 압력 점수 기반 자동 제어 적용
  - 항목 수(`entryLimit`), 문단 수(`paragraphLimit`), 한글/모국어 글자수 제한, 라인클램프
- 패널 단위 `overflow-hidden + break-words` 고정으로 겹침/침범 방지
- 현장 분포 기반 미세 완화 반영(설명량 중심)

### B. 리포트 전면(1페이지) 추가 보강
- `components/ReportTemplate.tsx`
- 전면도 4단계 적응형(`frontTuningProfile`)으로 전환
- 전면 항목/문단/문자수/라인클램프를 프로파일별 자동 조절
- 전면 미세튜닝(8개 현장형 샘플: 짧음/중간/장문 + 한국어/다국어)
  - strict: KO 45→48, native 40→42
  - compact: KO 60→64, native 52→56
  - balanced: KO 70→76, native 60→66
  - rich: KO 85→92, native 75→82
- 전면 임계값 락(고정) 상수화 완료
  - `FRONT_TUNING_LOCKED_THRESHOLDS`, `FRONT_TUNING_LOCKED_LIMITS`
- 전면 판정 문단 라인클램프 상향
  - rich 구간 8줄, balanced 7줄, compact 6줄, strict 5줄

### C. 전면 최상단 제목 다국어 이질감 보완
- `components/ReportTemplate.tsx`
- 영문 타이틀 하단 모국어 제목(`labels.cert`) 강조 표시로 유지/보강
- 다국어 라벨 확장
  - `카자흐스탄` 라벨 세트 추가
  - 국적 부분매칭(`카자흐`) 추가

### D. 핸드폰 화면 구성 최적화(뷰포트/스크롤 안정화)
- `index.html`, `pages/IndividualReport.tsx`
- 모바일 뷰포트 노치 대응: `viewport-fit=cover`
- 리포트 미리보기 영역 모바일 스크롤 안정화
  - `max-h: 100dvh` 기준 적용
  - `overscroll-contain` + 터치 패닝(`pan-x pan-y`) 적용
  - 모바일 패딩 최적화(`p-1.5`)

---

## 2) 검증 결과

- 실행 명령: `npm run verify:release`
- 결과: 통과
  - `check:context` → `check:hotspot` → `check:tdz` → `check:types` → `vite build`
- 빌드: 성공 (최근 실행 기준 정상 완료)

---

## 3) 현재 코드 상태 요약

- 전면/후면 모두 적응형 프로파일 적용 완료
- 전면 임계값 락 상수 적용 완료
- 전면 상단 제목 다국어(모국어) 표기 강화 완료
- 모바일(핸드폰) 리포트 미리보기 안정화 완료
- 타입/빌드 검증 완료
- 배포 전 기능 검증 가능한 상태

---

## 4) 다음 세션 우선 작업 (이어하기)

1. **전면 인쇄 실측 QA (필수)**
   - 샘플 10건 이상(한국어/다국어 혼합)으로 PDF 출력 확인
   - 체크 항목: 섹션 겹침, 문단 잘림, 가독성(8.5~10px)

2. **10건 실출력 QA 결과에 따른 미세 보정(필요 시만)**
  - 현재는 락 상태로 운영
  - 실출력에서만 발생하는 케이스가 확인되면 국적군(베트남/중국/태국/캄보디아/몽골/카자흐)별 wrap 폭만 최소 조정

3. **문구 품질 정리(선택)**
   - 모국어 `cert` 문구 톤/길이 통일
   - 현장 운영팀 승인 용어로 최종 교정

4. **배포 전 최종 검증**
   - `npm run verify:release`
   - 리포트 생성/인쇄 1회 수동 점검

---

## 5) 다음 세션 빠른 시작 커맨드

```bash
npm run verify:fast
npm run verify:release
```

---

## 6) 즉시 사용 문서

- 전면/후면 실출력 10건 검증 시트: [REPORT_PDF_QA_LOCK_CHECKLIST_2026-04-13.md](REPORT_PDF_QA_LOCK_CHECKLIST_2026-04-13.md)
- QA 최종 집계 템플릿(복붙용 FAIL 예시 포함): [REPORT_QA_SUMMARY_TEMPLATE_2026-04-13.md](REPORT_QA_SUMMARY_TEMPLATE_2026-04-13.md)
- QA 최종 1페이지 보고서: [REPORT_QA_FINAL_ONEPAGE_2026-04-13.md](REPORT_QA_FINAL_ONEPAGE_2026-04-13.md)
- 모바일 화면 검증 체크리스트: [MOBILE_VIEWPORT_QA_CHECKLIST.md](MOBILE_VIEWPORT_QA_CHECKLIST.md)

---

## 7) QA 결과 Append 섹션

### 실검수 결과 기록
- PDF PASS/FAIL:
- 모바일 PASS/FAIL:
- 반복 이슈:
- 최종 조치:
- 배포 판단:

---

## 8) 변경 파일

- `components/ReportTemplate.tsx`
- `pages/IndividualReport.tsx`
- `index.html`
- `REPORT_PDF_QA_LOCK_CHECKLIST_2026-04-13.md`
- `REPORT_QA_SUMMARY_TEMPLATE_2026-04-13.md`
- `REPORT_QA_FINAL_ONEPAGE_2026-04-13.md`
- `MOBILE_VIEWPORT_QA_CHECKLIST.md`
- `SESSION_RESUME_HANDOFF_2026-04-13.md`

---

# 🔶 파트 C — 특허 진행 검증 (2026-04-14)

## C-1. 전일 대비 현재 상태 요약

- 특허 패키지 구조(00~23, README)는 **정렬/잠금 태그/가이드 체계까지 완료** 상태
- 기술 정합(역할 적응형 표현 정책, 메시지 정책 버전, 하이브리드 엔진 표기)은 문서군 전반에 반영됨
- 다만 **전자출원 실투입 정보(출원인/발명자/대리인/분류/권리귀속)** 는 다수 `[입력]` 상태로 미완료
- 즉, 현재 단계는 **문서 프레임 완료 / 실입력·교차검증 미완료**

## C-2. 특허 진행도 판정 (실무 기준)

1. **패키지 완성도(문서 구조): 90%+**
  - `patent/00_출원패키지_목차.md`, `patent/README.md`, `patent/19_변리사_제출용_커버노트.md`, `patent/20_전자출원_제출순서표.md` 정리 완료
2. **전자출원 준비도(실제 제출 가능성): 40% 내외**
  - `patent/21_출원인발명자_실입력_최종본.md` 및 `patent/23_출원정보_빈칸최소화_입력시트.md` 핵심 필드 공란 다수
3. **제출 게이트 충족도: 미충족**
  - `patent/08_출원_체크리스트_및_일정표.md`, `patent/16_제출직전_최종검증_체크리스트.md`, `patent/22_최종제출세트_확인표.md` 대부분 체크박스 미체크

## C-3. 즉시 보완 필요사항 (우선순위)

### 🔴 P1 — 실입력 정보 확정 (오늘)
- `patent/23_출원정보_빈칸최소화_입력시트.md` 먼저 작성
- 작성값을 `patent/21_출원인발명자_실입력_최종본.md`에 반영
- 최소 필수: 영문 발명명, 출원인/발명자/대리인 정보, IPC/CPC, 권리귀속, 공개/NDA 여부

### 🟠 P2 — 교차 검증 체크 (오늘)
- `patent/19_변리사_제출용_커버노트.md` ↔ `patent/21_출원인발명자_실입력_최종본.md` 인명/대리인 정보 대조
- `patent/20_전자출원_제출순서표.md` 파일명 규칙 기준으로 제출본 파일명 확정
- `patent/22_최종제출세트_확인표.md` 필수/보강 세트 체크

### 🟡 P3 — 제출 직전 게이트 통과 (제출 전)
- `patent/16_제출직전_최종검증_체크리스트.md` 판정란 작성
- `patent/08_출원_체크리스트_및_일정표.md` 제출 직전 게이트 2개 항목 완료 처리

## C-4. 검증 중 확인된 주의사항

- `patent/16_제출직전_최종검증_체크리스트.md` 하단에 체크리스트 본래 목적 외 부록성 문단(시스템 안정성/용어 사전)이 포함되어 있음
- 제출 실무에는 치명 이슈는 아니나, 문서 목적 단일화를 위해 분리 정리 권장

## C-5. 다음 세션 시작 즉시 실행 순서

1. `patent/23_출원정보_빈칸최소화_입력시트.md` 작성 완료
2. `patent/21_출원인발명자_실입력_최종본.md` 반영
3. `patent/22_최종제출세트_확인표.md` 체크
4. `patent/16_제출직전_최종검증_체크리스트.md` 최종 판정 기록
5. `patent/20_전자출원_제출순서표.md` 순서대로 제출 파일 확정
