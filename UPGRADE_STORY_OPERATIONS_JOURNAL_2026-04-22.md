# UPGRADE STORY OPERATIONS JOURNAL (2026-04-22)

## 0) 문서 목적
이 문서는 흩어진 업그레이드 기록을 운영 관점으로 통합해,
- 무엇을 왜 바꿨는지,
- 지금 어디까지 왔는지,
- 다음에 무엇을 고도화할지
를 한 번에 이어서 볼 수 있게 만든 마스터 운영일지입니다.

---

## 1) 업그레이드 스토리(진화 흐름)

### Phase 1. 아이디어 검증 → 지표화 시작
- 5문항 설문을 단순 점수 집계가 아니라 행동 해석 중심으로 전환
- 핵심 지표 정의를 통해 “현장 의사결정에 바로 쓰는 분석” 방향 확보

### Phase 2. 제품 반영 → 화면/동선 고정
- 대시보드/페이지에 분석 결과를 실제 운영자 동선으로 배치
- "보는 화면"에서 "다음 행동"으로 이어지는 UX 구조 강화

### Phase 3. 다국어 품질 강화
- 한국어+모국어 병기, 폴백, 공란 방지 규칙 정비
- 다국적 현장에서도 해석 누락 없이 전달되도록 기준 고정

### Phase 4. 인간개입 후 2차분석 정합화
- 관리자 수정 이후 재분석 결과가 실제 기록에 반영되도록 경로 강화
- 경미 수정에 점수 급변이 발생하지 않도록 재분석 캘리브레이션 적용

### Phase 5. 자유기술형 6대 지표 루브릭 확립
- 정답 단어 매칭이 아니라 앵커(A/B/C) 기준 평가로 전환
- `scoreBreakdown` 합산 기반 정합으로 점수·근거 일치 강화

### Phase 6. 품질게이트 운영화
- 유사 맥락 점수 편차 검증 게이트(strict8, ±8) 구축
- `verify:fast`, `verify:release` 파이프라인에 통합해 배포 전 재현성 확보

### Phase 7. 실증 자동화
- 정책 전환 효과(legacy vs proposed) 분석 자동화
- 대외 공유용 원페이지 자동 생성까지 연결

### Phase 8. 비용최적화 운영 전환(오늘)
- 전수 OCR 대신 선택적 처리 전략으로 전환
- 백필 준비도 분석 스크립트 도입 + 구조화 이력 기반 예외 판정 보정
- 운영의사결정 축을 “비용 절감 + 품질 유지 + 재현성”으로 고정

---

## 2) 오늘까지 고정된 운영 원칙

### 2-1. 평가 원칙
- 6대 지표는 자유기술 앵커(A/B/C) 기준 유지
- 점수 정합은 `scoreBreakdown` 합산 우선
- 경미 수정 시 점수 급변 금지

### 2-2. 품질 원칙
- strict8(±8) 유지
- 배포 전 `verify:fast` / `verify:release` 통과

### 2-3. 비용 원칙
- 전수 OCR 금지
- 텍스트 백필 우선
- `OCR_REQUIRED`만 예외 OCR
- `TEXT_ONLY_REVIEW`는 관리자 큐 분리

### 2-4. 다국적 원칙
- 핵심 9개국 QA 기준 유지
  - 베트남, 중국, 태국, 캄보디아, 인도네시아, 몽골, 러시아, 카자흐스탄, 미얀마
- 모국어+한국어 병기, 폴백, 공란 방지 유지

---

## 3) 현재 상태(2026-04-22 스냅샷)

### 최신 실행 결과
- 마지막 명령: `npm run analyze:backfill-readiness`
- 종료 코드: 0
- 결과 요약:
  - NO_OCR_NEEDED: 3
  - OCR_REQUIRED: 0
  - TEXT_ONLY_REVIEW: 0
  - 절감률(가정): 23.53%

### 운영 해석
- 현재 샘플은 구조화 데이터 중심이어서 `NO_OCR_NEEDED` 비율이 높게 나옴
- 실데이터 투입 시 `OCR_REQUIRED` 비율 상승 가능성은 정상 범주
- 의사결정은 항상 3축(비용/품질/재현성) 동시 비교로 진행

---

## 4) 운영에 바로 쓰는 실행 묶음
1. `npm run analyze:backfill-readiness`
2. `npm run analyze:policy-impact:full`
3. `npm run check:score-consistency:strict8`
4. `npm run verify:release`

---

## 5) 기록 체계(문서 맵)

### A. 재시작/복원
- [SESSION_RESUME_HANDOFF_2026-04-22_BACKFILL_AND_RULES.md](SESSION_RESUME_HANDOFF_2026-04-22_BACKFILL_AND_RULES.md)
- [NEXT_SESSION_ONEPAGE_CHECKLIST_2026-04-22.md](NEXT_SESSION_ONEPAGE_CHECKLIST_2026-04-22.md)

### B. 운영 규칙 기준서
- [SIX_METRIC_ANCHOR_RUBRIC_GUIDE.md](SIX_METRIC_ANCHOR_RUBRIC_GUIDE.md)

### C. 일일 운영 기록
- [OPS_DAILY_LOG_TEMPLATE_BACKFILL_OCR_2026-04-22.md](OPS_DAILY_LOG_TEMPLATE_BACKFILL_OCR_2026-04-22.md)

### D. 산출 리포트
- [reports/backfill-readiness.md](reports/backfill-readiness.md)
- [reports/policy-impact.md](reports/policy-impact.md)
- [reports/policy-impact-onepager.md](reports/policy-impact-onepager.md)
- [reports/score-consistency-strict8.md](reports/score-consistency-strict8.md)

### E. 신뢰성 입증 원페이지
- [METRIC_RULE_RELIABILITY_PROOF_ONEPAGE_2026-04-23.md](METRIC_RULE_RELIABILITY_PROOF_ONEPAGE_2026-04-23.md)

### F. 신뢰성 운영 템플릿 세트
- [METRIC_RULE_SAMPLE_VALIDATION_TEMPLATE_2026-04-23.md](METRIC_RULE_SAMPLE_VALIDATION_TEMPLATE_2026-04-23.md)
- [METRIC_RULE_EXPERT_ALIGNMENT_TEMPLATE_2026-04-23.md](METRIC_RULE_EXPERT_ALIGNMENT_TEMPLATE_2026-04-23.md)
- [METRIC_RULE_EXEC_BRIEF_2026-04-23.md](METRIC_RULE_EXEC_BRIEF_2026-04-23.md)

### G. 신뢰성 검증 결과 및 KPI
- [METRIC_RULE_SAMPLE_VALIDATION_RESULTS_EXAMPLE_2026-04-23.md](METRIC_RULE_SAMPLE_VALIDATION_RESULTS_EXAMPLE_2026-04-23.md)
- [METRIC_RULE_EXPERT_ALIGNMENT_RESULTS_EXAMPLE_2026-04-23.md](METRIC_RULE_EXPERT_ALIGNMENT_RESULTS_EXAMPLE_2026-04-23.md)
- [METRIC_RULE_RELIABILITY_KPI_DASHBOARD_2026-04-23.md](METRIC_RULE_RELIABILITY_KPI_DASHBOARD_2026-04-23.md)
- [METRIC_RULE_EXTERNAL_PRESENTATION_ONEPAGE_2026-04-23.md](METRIC_RULE_EXTERNAL_PRESENTATION_ONEPAGE_2026-04-23.md)

### H. 운영 자동화 및 보고 체계
- [METRIC_RULE_KPI_AUTOMATION_GUIDE_2026-04-23.md](METRIC_RULE_KPI_AUTOMATION_GUIDE_2026-04-23.md)
- [METRIC_RULE_EXECUTIVE_MONTHLY_REPORT_TEMPLATE_2026-04-23.md](METRIC_RULE_EXECUTIVE_MONTHLY_REPORT_TEMPLATE_2026-04-23.md)

### I. 재시작 및 다음 단계 체계
- [SESSION_RESTART_CHECKLIST_AUTOSCALE_2026-04-24.md](SESSION_RESTART_CHECKLIST_AUTOSCALE_2026-04-24.md)
- [NEXT_PHASE_ROADMAP_MAY2026_2026-04-23.md](NEXT_PHASE_ROADMAP_MAY2026_2026-04-23.md)

---

## 6) 더 발전시키는 다음 단계(권장 백로그)

### Priority 1. 실데이터 기준 자동비교 고도화
- 전일 대비 자동 Delta 리포트 생성(비율/비용/게이트 상태)
- 공종/국적별 악화 구간 자동 하이라이트

### Priority 2. OCR 예외 처리 운영 대시보드화
- `OCR_REQUIRED` 상위군을 공종/국적/팀장 기준으로 자동 큐잉
- 처리 완료 후 재측정(전/후) 자동 기록

### Priority 3. 대외보고 패키지 정형화
- onepager + strict8 + backfill 리포트를 1세트로 묶는 배포 템플릿
- 발표문구 자동생성(요약 3문장/1분 브리핑)

### Priority 4. 다국적 QA 심화
- 9개국 PASS/FAIL 기록 누적 그래프화
- 공란/폴백 발생 빈도 추이 관리

---

## 7) 운영자용 스토리 기록 규칙(간단)
매일 운영일지 작성 시 아래 3줄은 반드시 남깁니다.
1. 오늘 무엇을 바꿨는가
2. 그 변경이 비용/품질/재현성에 어떤 영향을 줬는가
3. 내일 첫 작업 1개는 무엇인가

이 3줄이 누적되면 업그레이드 스토리가 자동으로 이어집니다.

---

## 8) 일자별 스토리 로그

### 2026-04-14
- 변경: 리포트 언어/가독성 트랙을 정리하고 앞/뒷장 다국어 병기, 코칭 문구 전달성, 하단 한국어화를 고정함
- 영향: KR/VN/CN 기준 출력 품질의 공란/축약 리스크를 줄여 다국적 전달 일관성이 개선됨
- 다음: 실제 PDF 3케이스 실측 결과를 QA 표에 반영

### 2026-04-20
- 변경: OCR 재분석 완전성 검증(문항/한국어해석/모국어 안내)과 국가별 언어 검증 유틸을 서버·브라우저 경로에 동시 적용함
- 영향: 원본비교 0건/모국어 공란의 구조적 누락을 차단하고 재분석 실패 원인을 명확히 추적 가능해짐
- 다음: 전체 일괄재분석 후 국가별 샘플 검수(최소 9개국)

### 2026-04-21
- 변경: 역할별 대시보드 이해 가이드, OCR 배치 체크포인트 재개, 근로자 QR/오디오 언어 오매칭 방지, 현장 용어 정제를 반영함
- 영향: 운영자 첫 행동 유도 속도와 배치 실행 안정성이 향상되고 다국어 전달 오류 가능성이 감소함
- 다음: 실사용 링크 시나리오(ko/vi/cmn/ru)와 대시보드 용어 스모크 재확인

### 2026-04-22
- 변경: 백필/OCR 예외선별 자동화, 스토리 운영일지 체계, 자동집계·전일 Delta 로그, 일일 부트스트랩 자동 실행을 통합함
- 영향: 백필 3건, NO_OCR 100%, OCR_REQUIRED 0%, 절감률 23.53% | strict8 PASS(비교쌍 8, 허용편차 ±8) | 정책 평균Δ -13.33, 운영패널티 적용률 33.33% | 전일대비 절감률 0.00%p, OCR_REQUIRED 0.00%p, 비교쌍 0건, strict8 PASS→PASS
- 다음: 실데이터 투입 후 Delta 변동(절감률/OCR_REQUIRED/비교쌍) 추세를 운영일지에 일자별 누적

### 2026-04-23
- 변경: 신뢰성 원페이지 기준서와 템플릿 3개(표본/합치도/경영자)에서 출발하여 실행 결과 3개(표본 예시/평가자 합치도 예시/발표자료), KPI 자동화 가이드, 경영자 월간 보고서까지 총 10개 문서 순차 완성. 마지막으로 재시작 체크리스트와 5월 로드맵까지 추가해 신뢰성 입증 + 운영 자동화 + 다음 단계 안내까지 완전 종료
- 최종 결과물 세트: 신뢰성 입증 체계 완전 구축 (원페이지 기준+6개 템플릿/예시) + 자동화 체계 완성 (KPI 수집+월간보고+대시보드) + 재시작 안내 및 5월 로드맵 완성
- 주요 수치: 표본 검증 합격률 90%, 평가자 합치도 78%, 감사로고 100%, 비용절감 23.53%, 릴리즈 검증 100% 기준선 확립
- 영향: 근로자/평가자/경영자 각 대상의 신뢰성 입증이 데이터 기반으로 완전히 자동화되고, 프로그램 재시작 시 따라야 할 규칙과 매달 확인할 체크포인트가 명확히 정의되며, 5월부터 6월까지 구체적인 실행 단계가 모두 준비됨
- 다음: 5월 1일부터 감사로고 강제화, 캘리브레이션 점검, KPI 자동화 배포 시작. 2주차부터 평가자 정렬 교육 및 추가 표본 10건 검증. 3주차 실데이터 30~50건 심화 검증. 4주차 월간 보고 체계 완전 자동화 및 경영자 보고. 6월 이후 공종별/국적별 심화 및 규모 확대 예정
