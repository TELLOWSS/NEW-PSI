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

### 2026-04-22
- 변경: 스토리형 운영일지 체계와 자동 로그 스크립트 추가
- 영향: 기록 누락 위험 감소, 재시작 인수인계 속도 향상, 운영 스토리 연속성 강화
- 다음: 실데이터 투입 후 OCR_REQUIRED 우선순위 큐 자동 산출

### 2026-04-22
- 변경: 자동집계 기반 운영스토리 누적 적용
- 영향: 백필 3건, NO_OCR 100%, OCR_REQUIRED 0%, 절감률 23.53% | strict8 PASS, 비교쌍 8, 허용편차 ±8 | 정책 평균Δ -13.33, 운영패널티 적용률 33.33%
- 다음: 실데이터 투입 후 일일 Delta 자동 리포트 연결

### 2026-04-22
- 변경: 전일 대비 Delta 자동 기록 기능 적용
- 영향: 백필 3건, NO_OCR 100%, OCR_REQUIRED 0%, 절감률 23.53% | strict8 PASS, 비교쌍 8, 허용편차 ±8 | 정책 평균Δ -13.33, 운영패널티 적용률 33.33% | 전일대비 기준점 없음(이번 실행을 기준점으로 저장)
- 다음: 실데이터 기준 Delta 변화 모니터링

### 2026-04-22
- 변경: Delta 재검증
- 영향: 백필 3건, NO_OCR 100%, OCR_REQUIRED 0%, 절감률 23.53% | strict8 PASS, 비교쌍 8, 허용편차 ±8 | 정책 평균Δ -13.33, 운영패널티 적용률 33.33% | 전일대비 절감률 0.00%p, OCR_REQUIRED 0.00%p, 비교쌍 0건, 정책 평균Δ 0.00, strict8 PASS→PASS
- 다음: 실데이터 투입 후 증감 분석
