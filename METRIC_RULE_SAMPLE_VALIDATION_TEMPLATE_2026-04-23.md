# 지표 규칙 표본 검증표 템플릿 (2026-04-23)

## 0) 목적
이 문서는 근로자별 지표 규칙 적용 결과가 **근거 기반으로 설명 가능하고**, **유사 사례에 일관되게 적용되는지**를 표본 수준에서 검증하기 위한 실무 템플릿입니다.

---

## 1) 검증 개요
- 검증일:
- 검증자:
- 대상 현장/프로젝트:
- 데이터 범위:
- 표본 수: 권장 30~50건
- 표본 추출 기준:
  - [ ] 공종 분산 반영
  - [ ] 국적 분산 반영
  - [ ] 고득점/중간/저득점 분산 반영
  - [ ] 승인/보류/재검토 사례 포함

---

## 2) 표본 검증 체크 기준
각 표본은 아래 6개를 확인합니다.
1. `scoreReasoning` 존재 여부
2. 앵커(A/B/C) 근거 존재 여부
3. 점수와 근거 문장의 일치 여부
4. 경미 수정 전후 급변 여부
5. 점수 변경 시 감사로그 존재 여부
6. 후속조치 필요성과 점수 해석의 연결 여부

---

## 3) 표본 검증표

| No | 근로자 ID | 공종 | 국적 | 주요 위험 맥락 | 총점 | 앵커 근거 존재 | 점수 설명 가능 | 경미 수정 급변 없음 | 변경 감사로그 | 후속조치 연결 가능 | 판정 | 비고 |
| --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL |  |
| 2 |  |  |  |  |  | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL |  |
| 3 |  |  |  |  |  | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL |  |
| 4 |  |  |  |  |  | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL |  |
| 5 |  |  |  |  |  | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL | PASS/FAIL |  |

필요 시 표를 복제하여 계속 사용합니다.

---

## 4) 집계 요약
- 총 표본 수:
- 근거 존재 PASS 수:
- 점수 설명 가능 PASS 수:
- 경미 수정 급변 없음 PASS 수:
- 감사로그 PASS 수:
- 후속조치 연결 가능 PASS 수:
- 최종 PASS 수:
- 최종 FAIL 수:

### PASS율
- 근거 존재율:
- 설명 가능율:
- 급변 방지율:
- 감사로그 기록률:
- 후속조치 연결률:
- 전체 합격률:

---

## 5) FAIL 유형 분류
| 유형 | 건수 | 설명 | 조치 |
| --- | ---: | --- | --- |
| 근거 누락 |  | `scoreReasoning` 또는 앵커 근거 없음 | 근거 기록 강제 |
| 설명 불일치 |  | 점수와 근거 문장이 맞지 않음 | 앵커 기준 재보정 |
| 급변 발생 |  | 경미 수정인데 점수 급변 | 캘리브레이션 점검 |
| 감사로그 누락 |  | 변경 사유 기록 없음 | 승인 프로세스 보강 |
| 조치 연결 불명확 |  | 점수는 있으나 후속 행동이 안 보임 | 운영 룰 연결 강화 |

---

## 6) 표본 검증 합격 기준
- 근거 없는 점수: 0건
- 점수 변경 감사로그 누락: 0건
- 경미 수정 급변 사례: 0건
- 전체 PASS율: 90% 이상 권장

### 최종 판정
- [ ] 운영 통과
- [ ] 조건부 통과
- [ ] 규칙 보정 필요

---

## 7) 검증 의견
### 잘 된 점
- 

### 보완 필요
- 

### 즉시 조치
- 

---

## 8) 연결 문서
- [METRIC_RULE_RELIABILITY_PROOF_ONEPAGE_2026-04-23.md](METRIC_RULE_RELIABILITY_PROOF_ONEPAGE_2026-04-23.md)
- [SIX_METRIC_ANCHOR_RUBRIC_GUIDE.md](SIX_METRIC_ANCHOR_RUBRIC_GUIDE.md)
- [OPS_DAILY_LOG_TEMPLATE_BACKFILL_OCR_2026-04-22.md](OPS_DAILY_LOG_TEMPLATE_BACKFILL_OCR_2026-04-22.md)
