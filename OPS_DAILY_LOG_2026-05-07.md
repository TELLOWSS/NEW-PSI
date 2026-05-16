# OPS DAILY LOG · Restart Verification & Next Plan

- 작성일: 2026-05-07
- 작성자: Copilot 협업 기록
- 현장/프로젝트: NEW-PSI
- 범위: 프로그램 종료 후 재시작 확인검증 + 다음 진행계획 고정

---

## 1) 오늘 목표
- [x] 재시작 시 필수 확인사항 문서 기준 재확인
- [x] 최신 검증 결과(모바일 QA/최종화) 실값 확인
- [x] 다음 진행사항 실행 순서 확정
- [ ] 로컬 루트에서 재실행 검증(오늘 세션)

---

## 2) 기준 문서 확인
1. [SESSION_RESTART_CHECKLIST_AUTOSCALE_2026-04-24.md](SESSION_RESTART_CHECKLIST_AUTOSCALE_2026-04-24.md)
   - 재시작 0/2/5/10/20분 체크 체계 확인

2. [NEXT_SESSION_ONEPAGE_CHECKLIST_2026-04-22.md](NEXT_SESSION_ONEPAGE_CHECKLIST_2026-04-22.md)
   - 고정 실행 순서 및 종료 즉시 게이트 확인

3. [MOBILE_FIRST_IA_AND_PC_RESTRUCTURE_ROADMAP_2026-05-04.md](MOBILE_FIRST_IA_AND_PC_RESTRUCTURE_ROADMAP_2026-05-04.md)
   - 18-1 종료 검증 3개(build/evidence/finalize) 기준 확인

---

## 3) 재시작 확인검증 결과 (2026-05-07 기준)

### 3-1. 최신 기록 기반 검증
- [MOBILE_3SCREEN_VIEWPORT_QA_FINALIZATION_TEMPLATE_2026-05-04.md](MOBILE_3SCREEN_VIEWPORT_QA_FINALIZATION_TEMPLATE_2026-05-04.md)
  - `npm run build` PASS (`built in 6.57s`)
  - `npm run check:mobile-qa:evidence` = `READY_FOR_FINALIZATION`
  - `npm run qa:mobile:finalize` = `FINALIZED_PASS`

- [reports/mobile-qa-evidence-status.md](reports/mobile-qa-evidence-status.md)
  - `totalExisting: 16`
  - `totalMissing: 0`
  - `status: READY_FOR_FINALIZATION`

### 3-2. 오늘 세션 실검증(터미널)
- 로컬 루트(`C:\Users\user\OneDrive\Desktop\개발실\new-psi\NEW-PSI`)에서 재실행 완료
- `npm run build` → PASS (`built in 6.05s`)
- `npm run check:mobile-qa:evidence` → `TOTAL_EXISTING=16`, `TOTAL_MISSING=0`, `RESULT=READY_FOR_FINALIZATION`
- `npm run qa:mobile:finalize` → `RESULT=FINALIZED_PASS`
- 결론: 문서 기준 + 실제 재실행 기준 모두 PASS로 확인

---

## 4) 종료 후 재시작 즉시 확인 (실행용)
1. 기준 문서 2개 먼저 확인
   - [SESSION_RESTART_CHECKLIST_AUTOSCALE_2026-04-24.md](SESSION_RESTART_CHECKLIST_AUTOSCALE_2026-04-24.md)
   - [NEXT_SESSION_ONEPAGE_CHECKLIST_2026-04-22.md](NEXT_SESSION_ONEPAGE_CHECKLIST_2026-04-22.md)

2. 프로젝트 루트 진입 후 1차 게이트 실행
   - `npm run build`
   - `npm run check:mobile-qa:evidence`
   - `npm run qa:mobile:finalize`

3. PASS 기준
   - build: PASS
   - evidence: `READY_FOR_FINALIZATION`
   - finalize: `FINALIZED_PASS`

---

## 5) 다음 진행사항 계획 (바로 착수 순서)
1. 환경 정렬
   - 로컬 NEW-PSI 루트에서 터미널 재연결/재실행

2. 데이터·정합 재검증
   - `npm run analyze:backfill-readiness`
   - `npm run analyze:policy-impact:full`
   - `npm run check:score-consistency:strict8`

3. 릴리즈 게이트 최종 확인
   - `npm run verify:release`

4. 기록 고정
   - 결과를 운영일지에 3줄로 고정
     - 완료: 오늘 끝낸 것
     - 다음: 다음 1순위
     - 검증: PASS 명령/결과

5. 후속 실행
   - [MOBILE_FIRST_IA_AND_PC_RESTRUCTURE_ROADMAP_2026-05-04.md](MOBILE_FIRST_IA_AND_PC_RESTRUCTURE_ROADMAP_2026-05-04.md) 18-2 항목에 맞춰 QA 보고서/증적 리포트 최신화 점검

---

## 6) 계획 실행 결과 (2026-05-07)
1. `npm run analyze:backfill-readiness` → PASS
   - 총 레코드 3, `NO_OCR_NEEDED=3`, `OCR_REQUIRED=0`, 절감률 23.53%

2. `npm run analyze:policy-impact:full` → PASS
   - Legacy 평균 80, Proposed 평균 66.67, 운영 패널티 적용률 33.33%

3. `npm run check:score-consistency:strict8` → PASS
   - 유사 맥락 비교쌍 8건, 허용 편차 ±8 게이트 통과

4. `npm run verify:release` → FAIL (`check:types` 단계 중단)
   - 오류 5건:
     - `lib/server/harness/rules/__tests__/rules.test.ts` (`vitest` 모듈 미해결)
     - `pages/OcrAnalysis.tsx` (`isCompactMobile` 미정의)
     - `pages/PredictiveAnalysis.tsx` (`viewportWidth` 미정의)
     - `services/geminiService.test.ts` (`vitest` 모듈 미해결)
     - `vitest.config.ts` (`vitest/config` 모듈 미해결)

5. 판정
   - 재시작 핵심 3게이트(build/evidence/finalize)는 PASS 유지
   - 릴리즈 전체 게이트는 타입 오류 해소 전까지 보류

---

## 7) 산출물 링크
- [OPS_DAILY_LOG_2026-05-07.md](OPS_DAILY_LOG_2026-05-07.md)
- [NEXT_SESSION_HANDOFF_LATEST.md](NEXT_SESSION_HANDOFF_LATEST.md)
- [MOBILE_3SCREEN_VIEWPORT_QA_FINALIZATION_TEMPLATE_2026-05-04.md](MOBILE_3SCREEN_VIEWPORT_QA_FINALIZATION_TEMPLATE_2026-05-04.md)
- [reports/mobile-qa-evidence-status.md](reports/mobile-qa-evidence-status.md)
- [NEXT_SESSION_ONEPAGE_CHECKLIST_2026-04-22.md](NEXT_SESSION_ONEPAGE_CHECKLIST_2026-04-22.md)

---

## 8) 다음 세션 첫 작업 1개
- `check:types` 5건 오류를 우선 정리한 뒤 `npm run verify:release` 재실행으로 릴리즈 게이트 복구 여부를 확정.

---

## 9) 2026-05-09 추가 반영 · 실무 즉시 적용 모드(P0)

### 9-1. 반영 목적
- 기존 기능/산출물은 삭제하지 않고 유지
- 실무자가 처음 접해도 즉시 실행 가능한 핵심 메뉴만 기본 노출
- 개발자/확장 정보는 숨김 처리 후 필요 시에만 전환

### 9-2. 구현 완료 항목
1. 전역 운영 모드 추가
   - 모드: `immediate`(실무 즉시) / `standard`(표준 운영) / `developer`(개발 확장)
   - 저장: localStorage (`psi_operational_mode_v1`)
   - 이벤트: `psi:operationalModeChanged`

2. 전역 컨텍스트 연결
   - 앱 루트에 `OperationalModeProvider` 주입
   - 어느 화면에서나 현재 운영 모드 조회/전환 가능

3. 메뉴/탭 노출 제어
   - 사이드바 메뉴를 운영 모드 기준으로 필터링
   - 모바일 하단탭/퀵링크도 동일 정책으로 필터링
   - 헤더에서 운영 모드 순환 전환 버튼 제공

4. 숨김 페이지 안전 처리
   - 현재 페이지가 운영 모드에서 비가시 대상이면 자동으로 `dashboard` 복귀
   - 단, 근로자 키오스크 훈련 플로우는 예외 처리

### 9-3. 실무 즉시(immediate) 기본 노출 페이지
- `dashboard`
- `ocr-analysis`
- `worker-management`
- `safety-checks`
- `site-issue-management`
- `reports`
- `individual-report`
- `worker-training`

### 9-4. 시작/종료 체크(운영자 실행용)
#### 시작(1분)
- [ ] 운영 모드가 `실무 즉시`인지 확인
- [ ] 오늘 즉시 처리 3건 확인(대시보드/점검/보고)
- [ ] 전일 미완료 항목 3건 중 1순위 확정

#### 종료(2분)
- [ ] 오늘 완료/미완료를 3줄로 기록
- [ ] 미완료 원인 1줄 기록(데이터/인력/시간/기술)
- [ ] 다음 시작 즉시 실행할 3건 고정

### 9-5. 다음 개선(P1)
- Dashboard/OCR/Reports 내부 카드도 동일한 운영 모드 정책으로 단계적 숨김 적용
- 시작/종료 체크를 UI 위젯으로 승격하여 앱 내부에서 자동 기록

### 9-6. P1 진행 결과 (2026-05-09)
1. Dashboard 내부 고급 제어 숨김
   - `실무 즉시` 모드에서 역할별 보기/화면 구성 모드 패널 비노출
   - `effectiveDashboardViewMode`를 강제로 `essential` 처리

2. OCR Analysis 내부 고급 영역 축소
   - `실무 즉시` 모드에서 보조 KPI/실패코드 확장 카드 비노출
   - 양식·공종/팀 배정 관리 섹션 비노출

3. Reports 내부 고급 영역 축소
   - `실무 즉시` 모드에서 Dev 요약 메트릭/검증 패널 비노출
   - PC 운영 바로가기 패널 비노출

4. 현재 상태
   - P0 + P1 반영 완료
   - 대상 파일 타입 진단 에러 없음

### 9-7. P2 진행 결과 (2026-05-09)
1. 대시보드 상단에 시작/종료 루틴 위젯 추가
   - 컴포넌트: `OperationalSessionChecklist`
   - 시작 체크 3개 + 종료 체크 3개 + 메모/원인/다음 3건 입력

2. 자동 이어보기 구현
   - 어제 종료에 적은 `다음 시작 즉시 실행 3건`을 오늘 시작 영역 상단에 자동 표시
   - 브라우저 localStorage에 자동 저장

3. 운영 의도 반영
   - 프로그램 시작 시 오늘 해야 할 핵심 3건을 즉시 확인 가능
   - 종료 전 미완료 원인과 다음 시작 액션을 고정하여 다음 세션 준비 시간을 축소

### 9-8. P3 진행 결과 (2026-05-09)
1. 사용자군 프리셋 추가
   - 프리셋: `실무자(field-worker)` / `관리자(manager)` / `소장(site-chief)`
   - 저장: localStorage (`psi_user_role_preset_v1`)
   - 이벤트: `psi:userRolePresetChanged`

2. 헤더 전환 버튼 추가
   - 상단 헤더에서 프리셋 순환 전환 가능
   - 순서: 실무자 → 관리자 → 소장

3. 대시보드 자동 적용
   - 프리셋 변경 시 Dashboard audience 자동 동기화
   - 매핑: 실무자→worker, 관리자→manager, 소장→executive
   - 수동 audience 변경 시 manual 플래그 저장, 프리셋 변경 이벤트 발생 시 자동 모드로 재동기화

4. 현재 상태
   - P0(전역 모드) + P1(내부 과밀 축소) + P2(시작/종료 체크) + P3(사용자군 프리셋) 반영 완료
   - 변경 파일 타입 진단 에러 없음

### 9-9. P2 보강 진행 결과 (2026-05-09)
1. 전일 액션 자동 이어받기
   - 오늘 `다음 시작 즉시 실행 3건`이 비어 있을 경우,
   - 어제 종료 시 입력한 3건을 자동으로 오늘 입력칸에 이관

2. 시작 체크 미완료 경고 추가
   - `실무 즉시` 모드에서 시작 체크 미완료 항목이 있으면
   - Dashboard 상단에 `미완료 n개` 경고 콜아웃 표시

3. 공통 저장 유틸 정리
   - `opsChecklistUtils` 추가
   - 저장 시 커스텀 이벤트(`psi:opsChecklistChanged`) 발행으로 화면 간 즉시 동기화

4. 현재 상태
   - 시작 시 확인 / 종료 시 정리 / 다음 시작 자동 준비 루프가 한 흐름으로 연결됨

### 9-10. 시작 체크 강제 실행 가드 반영 (2026-05-09)
1. 적용 범위
   - Dashboard `실무 즉시` 모드
   - 시작 체크 미완료(`startChecks` 남은 항목 > 0) 상태

2. 동작
   - 핵심 액션 버튼(퀵액션) 비활성화
   - 팀 비교 바로가기 비활성화
   - PC 운영 콘솔 버튼 비활성화
   - 미완료 경고 콜아웃과 함께 선행 루틴 완료를 우선 유도

3. 효과
   - 시작 1분 루틴을 실제 실행 흐름 앞단에 강제 배치
   - 실무 우선순위 고정 전 과도한 화면 이동/분석 확산을 차단

### 9-11. 페이지 진입 가드 확장 (2026-05-09)
1. 적용 위치
   - App 전역 라우팅 레벨

2. 가드 조건
   - `실무 즉시` 모드
   - 시작 체크 미완료 항목 존재

3. 차단 대상 페이지
   - `ocr-analysis`
   - `reports`
   - `individual-report`

4. 동작
   - 사용자가 메뉴/버튼/직접 진입으로 대상 페이지를 요청해도 `dashboard`로 복귀
   - 사용자 액션성 페이지 이동은 `navigateToPage` 경유로 일관 적용

5. 효과
   - 대시보드 버튼 비활성화뿐 아니라 페이지 진입 자체를 전역 차단
   - 시작 체크 완료 전 분석/보고로 이탈하는 흐름을 구조적으로 방지

---

## 10) 종료 직전 원페이지 요약 (재시작 즉시 확인용)

### 10-1. 오늘 최종 완료(What was done)
- [x] P0: 전역 운영 모드(`실무 즉시/표준 운영/개발 확장`) + 메뉴/탭/페이지 노출 제어
- [x] P1: Dashboard/OCR/Reports 내부 과밀 정보 숨김(실무 즉시 모드 기준)
- [x] P2: 시작/종료 체크 위젯 추가 + 자동저장 + 전일 3건 자동 이어받기
- [x] P3: 사용자군 프리셋(`실무자/관리자/소장`) 추가 및 Dashboard audience 자동 동기화
- [x] 가드 고도화: 시작 체크 미완료 시 버튼 비활성화 + OCR/보고서/개인리포트 페이지 진입 전역 차단

### 10-2. 현재 운영 상태(Current state)
- 기본 사용 시나리오: `실무 즉시` 모드 진입 → 시작 1분 체크 완료 → 핵심 화면 이동
- 차단 정책: 시작 체크 미완료면 분석/보고 동선이 구조적으로 제한됨
- 데이터 저장: 체크리스트/운영모드/사용자군 프리셋은 브라우저 localStorage에 유지
- 품질 상태: 최신 반영 파일 타입 진단 에러 없음(적용 단계별 확인 완료)

### 10-3. 다음 진행사항(Next plan)
1. 차단 사유 UX 강화
   - 페이지 차단 시 상단 토스트/배너로 "왜 차단됐는지" 즉시 안내

2. 강제 가드 범위 점검
   - 시작 체크 미완료 시 추가로 제한할 페이지(예: 예측분석/성과분석) 운영정책 확정

3. 종료 기록 자동화
   - 종료 체크 3개 완료 시 오늘 요약 3줄 자동 생성(완료/원인/내일 1순위)

4. 운영 로그 표준화
   - OPS 일지에 "완료/다음/리스크" 3블록 자동 템플릿 추가

### 10-4. 다음 세션 시작 즉시 실행(First 3 actions)
- [ ] Dashboard 접속 후 시작 체크 3개 완료
- [ ] 차단 사유 안내 토스트/배너 구현
- [ ] App 전역 가드 적용 페이지 범위 최종 확정 및 기록

### 10-5. 다음 세션 첫 명령(터미널/검증)
1. `npm run build`
2. `npm run check:mobile-qa:evidence`
3. `npm run qa:mobile:finalize`

> 위 3개 PASS 후, 차단 사유 UX 보강 작업에 착수한다.

---

## 11) 2026-05-16 전략 전환 메모 · Human Risk Engine 기준 고정

### 11-1. 핵심 판단
- PSI는 기능 중심 앱이 아니라 `건설현장 인간 위험인지 운영체제`로 재정의하는 편이 맞음
- 기존 6대 지표는 폐기하지 않고, `점수 레이어`에서 `인지·행동 해석 레이어`로 재해석 필요
- 앞으로 우선순위는 UI 추가보다 `위험 Ontology + 판단 태그 + 전조 패턴` 구조화에 둠

### 11-2. 즉시 고정할 실행 축
1. 위험 Ontology v1
   - 추락 / 낙하 / 협착 / 붕괴 / 감전 5대 위험부터 시작

2. 인간 판단 태그 체계 v1
   - 위험 과소평가 / 시간압박 / 순서 혼동 / 절차 생략 / 언어장벽 / 개선 미이행 등

3. 6대 지표 재정의
   - 총점 유지
   - 내부 저장은 `작업이해`, `위험인지`, `위험 정상화`, `대응역량` 등 벡터 중심으로 전환

4. 사고 전조 중심 운영
   - 사고 결과보다 `사고 이전 반복 행동`을 우선 수집/분석

### 11-3. 새 기준 문서
- [PSI_HUMAN_RISK_ENGINE_PLAN_2026-05-16.md](PSI_HUMAN_RISK_ENGINE_PLAN_2026-05-16.md)
  - 6대 지표 재정의
  - 위험 Ontology v1 초안
  - 판단 태그 체계 v1
  - 데이터 구조화 스키마
  - 90일 실행 로드맵

- [PSI_JUDGMENT_TAGGING_TEMPLATE_V1_2026-05-16.md](PSI_JUDGMENT_TAGGING_TEMPLATE_V1_2026-05-16.md)
   - 표본 100건 수동 태깅용 컬럼 정의
   - 판단 태그 사전 v1
   - 샘플 입력 예시 3건

### 11-4. 다음 우선순위
- [x] 5대 위험 Ontology v1 표 확정(시드 10행 기준)
- [x] 인간 판단 태그 24개 초안 확정(코드북 v1)
- [ ] 수기자료 100건 표본 추출
- [x] 6대 지표 ↔ 벡터 매핑 정의서 작성

### 11-5. 2026-05-16 추가 산출물
- [PSI_DATA_MODEL_ALIGNMENT_2026-05-16.md](PSI_DATA_MODEL_ALIGNMENT_2026-05-16.md)
   - 기존 `WorkerRecord/scoreBreakdown` 유지 전제에서 Human Risk Engine 증설 정렬안
   - 6대 지표 ↔ 벡터 매핑표
   - 저장 엔티티 5종(`judgment_tag_record`, `worker_profile_vector`, `site_context_snapshot`, `behavior_event_log`, `risk_signal`) 정의

- [templates/psi_judgment_tagging_template_v1.csv](templates/psi_judgment_tagging_template_v1.csv)
   - 표본 태깅 즉시 착수용 CSV 원본
   - 컬럼: 온톨로지 코드, 판단 태그, 벡터, 전조, 권장 개입까지 포함

- [templates/psi_ontology_v1_seed_2026-05-16.csv](templates/psi_ontology_v1_seed_2026-05-16.csv)
   - 5대 위험 Ontology 시드 10행
   - `riskCategoryCode/riskSubcategoryCode/ontologyNodeId` 코드 체계 포함

- [templates/psi_judgment_tagging_blank_100rows_v1_2026-05-16.csv](templates/psi_judgment_tagging_blank_100rows_v1_2026-05-16.csv)
   - 표본 100건 입력 즉시 착수용 빈 행 템플릿
   - `recordId` 001~100 선할당 + `recordDate(2026-05-16)` 기본값 포함

- [templates/psi_judgment_tag_codebook_v1_24_2026-05-16.csv](templates/psi_judgment_tag_codebook_v1_24_2026-05-16.csv)
   - 판단 태그 24개 확정 코드북
   - `tagCode/tagGroup/defaultLinkedMetric/precursorWeight` 기준 포함

- [scripts/check-judgment-tagging-quality.cjs](scripts/check-judgment-tagging-quality.cjs)
   - 태깅 CSV 자동 품질검증 스크립트(필수값/코드북/온톨로지/값범위/중복ID 검사)
   - 오류/경고 유형 TOP5 자동요약(콘솔 + Markdown 리포트) 추가
   - 오류 TOP5를 기반으로 `자동 수정 우선순위 액션(ACTION_TOP5)` 자동 생성

- [scripts/generate-judgment-tagging-ops-summary.cjs](scripts/generate-judgment-tagging-ops-summary.cjs)
   - `judgment-tagging-quality.json` 기반 OPS 3줄(완료/다음/검증) 자동 생성
   - 산출물: `reports/judgment-tagging-ops-summary.md`

- npm 실행 체인
   - `check:judgment-tagging:full` = `check:judgment-tagging:report` + `report:judgment-tagging:ops-summary`
   - `check:judgment-tagging:r1:full` = `check:judgment-tagging:full` + `report:judgment-tagging:r1-closeout`

- [scripts/generate-judgment-tagging-r1-closeout.cjs](scripts/generate-judgment-tagging-r1-closeout.cjs)
   - R1 진행 추적 CSV + OPS 요약 리포트를 기반으로 `R1 종료 OPS 3줄` 자동 템플릿 생성
   - 산출물: `reports/judgment-tagging-r1-closeout.md`

- [PSI_TAGGING_QA_AUTOMATION_GUIDE_2026-05-16.md](PSI_TAGGING_QA_AUTOMATION_GUIDE_2026-05-16.md)
   - 태깅 품질검증 실행 명령/리포트/운영루틴 가이드

- [WORKSPACE_LOCAL_SYNC_CHECKLIST_2026-05-16.md](WORKSPACE_LOCAL_SYNC_CHECKLIST_2026-05-16.md)
   - 워크스페이스 변경분을 로컬 저장소에 반영하기 위한 파일 목록/검증 명령 체크리스트

- [PSI_TAGGING_100_EXECUTION_BOARD_2026-05-16.md](PSI_TAGGING_100_EXECUTION_BOARD_2026-05-16.md)
   - 20건 × 5라운드 기준 100건 태깅 실행보드

- [templates/psi_judgment_tagging_progress_tracker_100_v1_2026-05-16.csv](templates/psi_judgment_tagging_progress_tracker_100_v1_2026-05-16.csv)
   - recordId 001~100 라운드별 진행 추적 CSV(status/합의/QA)

- [PSI_TAGGING_R1_STARTER_PACK_2026-05-16.md](PSI_TAGGING_R1_STARTER_PACK_2026-05-16.md)
   - R1(001~020) 담당자 배정/합의 규칙/종료 기준 패키지

- [templates/psi_judgment_tagging_r1_worksheet_001_020_2026-05-16.csv](templates/psi_judgment_tagging_r1_worksheet_001_020_2026-05-16.csv)
   - R1 전용 입력·합의 워크시트(001~020)

### 11-6. 다음 세션 시작 즉시 실행(데이터 구조화 모드)
1. `templates/psi_judgment_tagging_blank_100rows_v1_2026-05-16.csv` 기준으로 표본 100건 입력 시작
2. 평가자 2인 독립 태깅 후 불일치 항목 합의
3. `templates/psi_judgment_tag_codebook_v1_24_2026-05-16.csv` 기준으로 태그 코드 통일 후 상위 태그 20개 빈도 집계
4. 전조 시그널 후보 10개 도출

### 11-7. 계획사항 진행도 확인검증 (2026-05-16)

#### 완료(문서/스크립트 기준)
- Human Risk 전환 문서군 작성 완료
   - `PSI_HUMAN_RISK_ENGINE_PLAN_2026-05-16.md`
   - `PSI_DATA_MODEL_ALIGNMENT_2026-05-16.md`
   - `PSI_JUDGMENT_TAGGING_TEMPLATE_V1_2026-05-16.md`
- 태깅 입력자산 생성 완료
   - `templates/psi_judgment_tagging_blank_100rows_v1_2026-05-16.csv`
   - `templates/psi_judgment_tag_codebook_v1_24_2026-05-16.csv`
   - `templates/psi_ontology_v1_seed_2026-05-16.csv`
- 품질검증 자동화 완료
   - `scripts/check-judgment-tagging-quality.cjs`
   - `scripts/generate-judgment-tagging-ops-summary.cjs`
   - `package.json` 명령(`check:judgment-tagging`, `check:judgment-tagging:full`) 반영

#### 진행중/대기
- [ ] 수기자료 100건 표본 추출
- [ ] `check:judgment-tagging:full` 실행 기반 리포트 생성
   - 대기 사유: 로컬 저장소와 워크스페이스 변경분 동기화 필요

#### 다음 즉시 실행 3건
1. `WORKSPACE_LOCAL_SYNC_CHECKLIST_2026-05-16.md` 기준으로 로컬 동기화
2. 로컬 루트에서 `npm run check:judgment-tagging:full` 실행
3. `PSI_TAGGING_100_EXECUTION_BOARD_2026-05-16.md` + `templates/psi_judgment_tagging_progress_tracker_100_v1_2026-05-16.csv` 기준으로 R1(001~020) 착수