# OPS DAILY LOG TEMPLATE · Backfill/OCR 운영일지

- 작성일: YYYY-MM-DD
- 작성자: 
- 현장/프로젝트: 
- 데이터 범위: (예: 2026-01 ~ 2026-04)

---

## 1) 오늘 목표
- [ ] 백필 준비도 재산출
- [ ] 정책효과 리포트/원페이지 갱신
- [ ] strict8 게이트 통과 확인
- [ ] OCR 예외군 처리 계획 확정

---

## 2) 실행 명령 로그
1. `npm run analyze:backfill-readiness`
   - 결과: 성공 / 실패
   - 요약:

2. `npm run analyze:policy-impact:full`
   - 결과: 성공 / 실패
   - 요약:

3. `npm run check:score-consistency:strict8`
   - 결과: 성공 / 실패
   - 요약:

4. `npm run verify:release`
   - 결과: 성공 / 실패
   - 요약:

---

## 3) KPI 스냅샷 (당일)

### 3-1. 백필/OCR 분류
- 총 레코드:
- NO_OCR_NEEDED:
- OCR_REQUIRED:
- TEXT_ONLY_REVIEW:

### 3-2. 비용 추정
- 선택적 처리 총비용:
- 전수 OCR 총비용(가정):
- 절감액(가정):
- 절감률(가정):

### 3-3. 점수 일관성/품질
- strict8 상태: PASS / FAIL
- 최대 편차:
- 위험 비교쌍 수:

---

## 4) 전일 대비 변화 (누적 비교표)

| 지표 | 전일 | 금일 | 증감 | 해석 |
| --- | ---: | ---: | ---: | --- |
| 총 레코드 |  |  |  |  |
| NO_OCR_NEEDED 비율(%) |  |  |  |  |
| OCR_REQUIRED 비율(%) |  |  |  |  |
| TEXT_ONLY_REVIEW 비율(%) |  |  |  |  |
| 선택적 처리 비용 |  |  |  |  |
| 절감률(%) |  |  |  |  |
| strict8 최대 편차 |  |  |  |  |

---

## 5) 9개국 QA 점검 결과

- 점검 기준 국가:
  - 베트남, 중국, 태국, 캄보디아, 인도네시아, 몽골, 러시아, 카자흐스탄, 미얀마

| 국가 | 샘플수 | 모국어+한국어 병기 | 폴백 정상 | 공란 없음 | 비고 |
| --- | ---: | --- | --- | --- | --- |
| 베트남 |  | PASS/FAIL | PASS/FAIL | PASS/FAIL |  |
| 중국 |  | PASS/FAIL | PASS/FAIL | PASS/FAIL |  |
| 태국 |  | PASS/FAIL | PASS/FAIL | PASS/FAIL |  |
| 캄보디아 |  | PASS/FAIL | PASS/FAIL | PASS/FAIL |  |
| 인도네시아 |  | PASS/FAIL | PASS/FAIL | PASS/FAIL |  |
| 몽골 |  | PASS/FAIL | PASS/FAIL | PASS/FAIL |  |
| 러시아 |  | PASS/FAIL | PASS/FAIL | PASS/FAIL |  |
| 카자흐스탄 |  | PASS/FAIL | PASS/FAIL | PASS/FAIL |  |
| 미얀마 |  | PASS/FAIL | PASS/FAIL | PASS/FAIL |  |

---

## 6) OCR 예외군 처리 현황
- OCR_REQUIRED 상위 공종:
- OCR_REQUIRED 상위 국적:
- 오늘 배치 OCR 처리 건수:
- 잔여 OCR_REQUIRED:
- TEXT_ONLY_REVIEW 관리자 큐 이관 건수:

---

## 7) 이슈/조치/의사결정

### 이슈
- 

### 조치
- 

### 오늘 의사결정 (유지/변경)
- 6지표 자유기술 앵커 기준: 유지 / 변경
- strict8(±8) 게이트: 유지 / 변경
- 전수 OCR 금지 원칙: 유지 / 변경
- 9개국 QA 기준: 유지 / 변경
- 기타:

---

## 8) 대외 공유용 요약 문구 (복붙)
- 금일 누적 데이터 기준 선택적 OCR 전략으로 비용 절감률 __%를 확보함.
- 동일 맥락 점수 일관성 게이트(strict8)를 __ 상태로 유지해 결과 재현성을 확보함.
- 9개국 다국어 QA에서 핵심 출력 품질(병기/폴백/공란 방지)을 __ 수준으로 확인함.

---

## 9) 산출물 링크
- [reports/backfill-readiness.md](reports/backfill-readiness.md)
- [reports/policy-impact.md](reports/policy-impact.md)
- [reports/policy-impact-onepager.md](reports/policy-impact-onepager.md)
- [reports/score-consistency-strict8.md](reports/score-consistency-strict8.md)

---

## 10) 다음 세션 첫 작업 1개
- 
