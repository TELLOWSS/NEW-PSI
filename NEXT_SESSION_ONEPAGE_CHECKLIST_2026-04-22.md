# NEXT SESSION ONEPAGE CHECKLIST (2026-04-22)

## 1) 시작 3분 체크
- [ ] [UPGRADE_LOG_2026-04-25.md](UPGRADE_LOG_2026-04-25.md) 금일 업그레이드 내역 먼저 확인
- [ ] [SESSION_RESUME_HANDOFF_2026-04-22_BACKFILL_AND_RULES.md](SESSION_RESUME_HANDOFF_2026-04-22_BACKFILL_AND_RULES.md) 먼저 읽기
- [ ] [SIX_METRIC_ANCHOR_RUBRIC_GUIDE.md](SIX_METRIC_ANCHOR_RUBRIC_GUIDE.md) 고정 규칙 확인
- [ ] 최신 산출물 확인
  - [reports/backfill-readiness.md](reports/backfill-readiness.md)
  - [reports/policy-impact-onepager.md](reports/policy-impact-onepager.md)

---

## 2) 오늘 기준 종료 지점(복원 기준)
- 마지막 명령: npm run check:mobile-qa:evidence
- 종료 코드: 0
- 최근 결과 요약:
  - 빌드: PASS (`built in 5.24s`)
  - 모바일 QA 증빙: READY_FOR_FINALIZATION (16/16)
  - 상태: 모바일 3코어(Home/OCR/AI Risk) 감량·연결·터치타겟·최근리포트 3건 제한 + 초기 로딩 오류화면 플래시 개선 + 모바일 헤더/CTA 공통화 완료

---

## 3) 재시작 실행 순서(고정)
※ `npm run dev` 시작 시 `predev`로 일일 자동 부트스트랩(`ops:auto:daily`)이 하루 1회 선실행됩니다.
1. npm run analyze:backfill-readiness
2. npm run analyze:policy-impact:full
3. npm run check:score-consistency:strict8
4. npm run verify:release
5. npm run qa:mobile:refresh
6. npm run qa:mobile:finalize

---

## 4) 반드시 유지할 규칙

### A. 평가/점수 규칙
- [ ] 6대 지표는 자유기술 앵커(A/B/C) 기준 유지
- [ ] scoreBreakdown 합산 정합 우선
- [ ] 경미 수정 시 점수 급변 금지(캘리브레이션 유지)

### B. 품질 게이트 규칙
- [ ] strict8(±8) 유지
- [ ] 배포 전 verify:fast / verify:release 통과

### C. 데이터/OCR 규칙
- [ ] 전수 OCR 금지
- [ ] 텍스트 백필 우선
- [ ] OCR_REQUIRED만 예외 OCR
- [ ] TEXT_ONLY_REVIEW는 관리자 큐 분리

### D. 다국적 규칙
- [ ] 핵심 10개국 QA 기준 유지(우즈벡 포함)
  - 베트남, 중국, 태국, 캄보디아, 인도네시아, 몽골, 러시아, 카자흐스탄, 미얀마, 우즈베키스탄
- [ ] 모국어+한국어 병기/폴백/공란 방지 유지

---

## 5) 실데이터 투입 체크
- [ ] 수개월 누적 JSON을 reports/records-export.json으로 교체
- [ ] 백필 준비도 재실행
- [ ] 정책효과 상세/원페이지 재생성
- [ ] OCR_REQUIRED 상위부터 배치 OCR
- [ ] 재실행 후 비율 변화 비교

---

## 6) 대외보고 즉시 사용 파일
- [reports/policy-impact.md](reports/policy-impact.md)
- [reports/policy-impact-onepager.md](reports/policy-impact-onepager.md)
- [reports/score-consistency-strict8.md](reports/score-consistency-strict8.md)
- [reports/backfill-readiness.md](reports/backfill-readiness.md)
- [reports/story-metrics-history.json](reports/story-metrics-history.json)
- [MOBILE_3SCREEN_VIEWPORT_QA_REPORT_2026-05-04.md](MOBILE_3SCREEN_VIEWPORT_QA_REPORT_2026-05-04.md)
- [MOBILE_3SCREEN_VIEWPORT_QA_FIELD_FORM_2026-05-04.md](MOBILE_3SCREEN_VIEWPORT_QA_FIELD_FORM_2026-05-04.md)
- [MOBILE_3SCREEN_VIEWPORT_QA_FINALIZATION_TEMPLATE_2026-05-04.md](MOBILE_3SCREEN_VIEWPORT_QA_FINALIZATION_TEMPLATE_2026-05-04.md)
- [MOBILE_FIRST_IA_AND_PC_RESTRUCTURE_ROADMAP_2026-05-04.md](MOBILE_FIRST_IA_AND_PC_RESTRUCTURE_ROADMAP_2026-05-04.md)
- [MOBILE_HOME_ANALYSIS_OCR_DETAILED_IA_TABLE_2026-05-04.md](MOBILE_HOME_ANALYSIS_OCR_DETAILED_IA_TABLE_2026-05-04.md)
- [PC_FUNCTION_RECLASSIFICATION_TABLE_2026-05-04.md](PC_FUNCTION_RECLASSIFICATION_TABLE_2026-05-04.md)

---

## 7) 세션 종료 전 저장 메모(템플릿)
- 오늘 실행 명령: npm run build, npm run qa:mobile:capture, npm run check:mobile-qa:evidence, npm run qa:mobile:refresh, npm run qa:mobile:finalize
- 마지막 성공 명령: npm run qa:mobile:finalize
- 산출물 파일: MOBILE_3SCREEN_VIEWPORT_QA_FINALIZATION_TEMPLATE_2026-05-04.md, MOBILE_FIRST_IA_AND_PC_RESTRUCTURE_ROADMAP_2026-05-04.md, NEXT_SESSION_ONEPAGE_CHECKLIST_2026-04-22.md
- OCR_REQUIRED 건수: 0 (변경 없음)
- 주요 의사결정(변경/유지): 모바일 완료 상태를 고정하고 Phase 3는 PC 운영 생산성 패널을 기존 상태값 재사용 방식으로 점진 도입
- 다음 세션 첫 작업 1개: PredictiveAnalysis에 PC 운영 바로가기 패널 1차 추가(버킷 중심 조치/인사이트/리포트 연계) 후 빌드+QA 상태 재기록

---

## 10) 종료 즉시 확인 + 다음사항 착수 게이트
### A. 종료 즉시 확인(2분)
1. `npm run build` 결과가 PASS인지 확인
2. `npm run check:mobile-qa:evidence` 결과가 `READY_FOR_FINALIZATION`인지 확인
3. `npm run qa:mobile:finalize` 결과가 `FINALIZED_PASS`인지 확인

### B. 다음사항 바로 시작(5분)
1. [MOBILE_FIRST_IA_AND_PC_RESTRUCTURE_ROADMAP_2026-05-04.md](MOBILE_FIRST_IA_AND_PC_RESTRUCTURE_ROADMAP_2026-05-04.md) 17-3.2 이후 미완료 항목 확인
2. ✅ PredictiveAnalysis PC 운영 바로가기 1차 반영 + 빌드 검증 완료
3. 종료 전 3줄 기록:
  - 무엇을 끝냈는지
  - 무엇이 다음 1순위인지
  - 어떤 명령 결과가 PASS인지

### C. 배포 체크용 변경 요약 3줄 (2026-05-04)
- 완료: 리뉴얼 미구현 2순위(CTA 버튼 스타일 공통화) Dashboard/OCR/Predictive 핵심 CTA 반영 완료
- 다음: 리뉴얼 미구현 3순위(카드 반경/패딩/그림자 토큰 통일) 순차 반영
- 검증: `npm run build` PASS (`built in 5.24s`) + `check:mobile-qa:evidence` `READY_FOR_FINALIZATION`

### E. 사용성 보정 델타 (2026-05-04)
- Reports/Settings PC 바로가기 패널에 실행 가이드 문구 및 비활성 조건 연동 반영
- Reports 상세 미리보기 바로가기 진입점 `setPreviewIndex(0)` 고정
- 검증: `npm run build` PASS (`built in 5.23s`)

### D. 다음 진행 1순위(검증 후 실행)
- ✅ 배포 리허설 실행 완료: `npm run build` → `npm run check:mobile-qa:evidence` → `npm run qa:mobile:finalize`
- ✅ 검증 결과: `READY_FOR_FINALIZATION` (16/16) + `FINALIZED_PASS`
- 다음 착수: 공통 미구현 3순위(`카드 반경/패딩/그림자 토큰 통일`)를 3코어 핵심 카드에 순차 반영

### G. `check:mobile-qa:evidence` 실패 원인 정리 (배포 체크용)
- 실패 조건: `artifacts/mobile-qa/2026-05-04` 기준 16개 증적 중 누락이 1개라도 있으면 `RESULT=NOT_READY` + Exit 1
- 확인 포인트: 로그의 `TOTAL_MISSING` 값(>0이면 실패)
- 현재 재실행 결과: `TOTAL_MISSING=0`, `RESULT=READY_FOR_FINALIZATION`

### F. 계측 반영 델타 (2026-05-04)
- PredictiveAnalysis/Reports/Settings에 `createMetricSessionId` + `trackUIViewMetric` 연동으로 PC 운영 바로가기 액션 클릭 로그 추가
- 액션 키 표준화: `focus_urgent_bucket`, `bulk_generate_start`, `run_workflow_probe` 등 페이지별 `actionKey` 기록
- Settings KPI에 `pc_quick_actions` Top5 요약 패널 추가(페이지·액션키별 집계)
- 하위 3액션에 `uiVariant=v2-lowfreq-tuning-1` 태그 + 라벨/배치 미세조정(회의용 리포트 인쇄, 근로자 1건 미리보기, 신규 사용자 가이드 후순위)
- Settings KPI에 `v2` 일간 추이 자동 계산(오늘/어제/증감 건·%) 추가
- `open_beginner_guide`를 `uiVariant=v3-targeted-tuning-1`로 분리하고 선행 배치/라벨(`빠른 시작 가이드`) 2차 보정 반영
- Settings KPI에 가이드 액션 v2/v3 비교 행(누적·오늘) 추가
- Settings v3 가이드 CTA에 카피 A/B 분기(`copyVariant`, `copyLabel`) 및 KPI A/B 집계행 추가
- 24h 관찰 기준 승자 자동 고정(`psi_settings_guide_copy_winner_v1`) 및 고정/관찰 상태 표시 추가
- 검증: `npm run build` PASS (`built in 5.33s`)

---

## 8) 운영일지 템플릿
- [OPS_DAILY_LOG_2026-05-04.md](OPS_DAILY_LOG_2026-05-04.md)

---

## 9) 업그레이드 스토리 마스터
- [UPGRADE_STORY_OPERATIONS_JOURNAL_2026-04-22.md](UPGRADE_STORY_OPERATIONS_JOURNAL_2026-04-22.md)
- 로그 추가 명령:
  - `npm run log:story -- --date 2026-04-22 --change "오늘 변경" --impact "비용/품질/재현성 영향" --next "내일 첫 작업"`
  - `npm run log:story:auto -- --date 2026-04-22 --change "오늘 변경" --next "내일 첫 작업"`
  - `npm run log:story:auto:delta -- --date 2026-04-22 --change "오늘 변경" --next "내일 첫 작업"`
  - `npm run log:story:auto:no-delta -- --date 2026-04-22 --change "오늘 변경" --next "내일 첫 작업"`
