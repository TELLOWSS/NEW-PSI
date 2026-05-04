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
- 마지막 명령: npm test -- --run
- 종료 코드: 0
- 최근 결과 요약:
  - 타입 체크: PASS
  - 빌드: PASS
  - 테스트: PASS (34/34)
  - 상태: 화면 정상 가동 확인, 모바일 하단 5탭/PC 운영 재분류/기본 진입 `dashboard` 전환 완료, 모바일 3화면 QA는 `CONDITIONAL PASS` 선입력 완료(실뷰포트 캡처 증빙 대기)

---

## 3) 재시작 실행 순서(고정)
※ `npm run dev` 시작 시 `predev`로 일일 자동 부트스트랩(`ops:auto:daily`)이 하루 1회 선실행됩니다.
1. npm run analyze:backfill-readiness
2. npm run analyze:policy-impact:full
3. npm run check:score-consistency:strict8
4. npm run verify:release

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
- 오늘 실행 명령: npm run check:types, npm run build, npm test -- --run
- 마지막 성공 명령: npm test -- --run
- 산출물 파일: MOBILE_3SCREEN_VIEWPORT_QA_REPORT_2026-05-04.md, NEXT_SESSION_ONEPAGE_CHECKLIST_2026-04-22.md
- OCR_REQUIRED 건수: 0 (변경 없음)
- 주요 의사결정(변경/유지): 모바일 3화면은 로컬 실행 저장소 기준으로 반영/기동 정상, Supabase 미설정 환경에서도 앱 마운트 유지, 모바일 하단 5탭과 기본 진입 `dashboard`를 적용
- 다음 세션 첫 작업 1개: 320/360/375/390 실뷰포트 캡처 경로 입력 후 `CONDITIONAL PASS`를 `PASS/FAIL`로 최종 확정

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
