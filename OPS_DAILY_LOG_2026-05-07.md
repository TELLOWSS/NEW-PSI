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