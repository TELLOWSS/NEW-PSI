# PSI 태깅 R1 시작 패키지 (001~020)

- 작성일: 2026-05-16
- 대상: `2026-05-16-001` ~ `2026-05-16-020`
- 목적: R1 20건을 `입력 → 2인 합의 → QA 검증 → OPS 3줄`까지 한 번에 종료한다.

---

## 1) 역할 배정

| 역할 | 담당 | 책임 |
| --- | --- | --- |
| 1차 태깅 | Primary Tagger | 원문 기반 위험/태그/벡터 입력 |
| 2차 검토 | Reviewer | 태그 불일치 식별 및 합의 기록 |
| QA 실행 | QA Owner | `check:judgment-tagging:full` 실행 및 리포트 보관 |
| 최종 기록 | Ops Recorder | 완료/다음/검증 3줄 기록 |

> 실무 적용: 실제 담당자 이름은 진행 추적 CSV의 `assigneePrimary`, `assigneeReviewer` 컬럼에 기록.

---

## 2) R1 실행 순서

1. 입력
- [ ] `templates/psi_judgment_tagging_blank_100rows_v1_2026-05-16.csv`에서 001~020 입력
- [ ] 진행 추적 반영: `templates/psi_judgment_tagging_progress_tracker_100_v1_2026-05-16.csv`

2. 2인 합의
- [ ] `judgmentTagCodes` 코드북 정렬
- [ ] 불일치 건 `reviewNote`에 합의 사유 기록

3. 검증
- [ ] `npm run check:judgment-tagging:full`
- [ ] 산출물 확인
  - `reports/judgment-tagging-quality.json`
  - `reports/judgment-tagging-quality.md`
  - `reports/judgment-tagging-ops-summary.md`

4. 라운드 종료
- [ ] OPS 3줄 기록(완료/다음/검증)
- [ ] R2(021~040)로 이행 여부 결정

---

## 3) 합의 규칙 (R1 기준)

### 우선순위
1. 위험유형 정합성
2. 태그 코드 정합성
3. 벡터 값 정합성
4. linkedMetric 정합성

### 판단 규칙
- 태그명과 코드 개수는 1:1이어야 함
- 코드북에 없는 코드는 사용 금지
- 온톨로지 조합(`riskCategoryCode|riskSubcategoryCode|ontologyNodeId`)은 시드 기준으로 입력
- `reviewNeeded=Y`이면 `reviewer` 및 `reviewNote`를 비우지 않음

---

## 4) R1 완료 기준 (Done Definition)

- 입력 완료 건수: 20/20
- 합의 완료 건수: 20/20
- QA 결과: `check:judgment-tagging:full` 1회 이상 실행
- 필수 산출물 생성 완료
  - `judgment-tagging-quality.json`
  - `judgment-tagging-quality.md`
  - `judgment-tagging-ops-summary.md`

---

## 5) 실패 시 복구 절차

1. `ERROR_TOP5` 확인
2. `ACTION_TOP5` 우선순위 1~2부터 수정
3. 재실행: `npm run check:judgment-tagging:full`
4. 오류 추세가 감소하면 라운드 유지, 증가하면 태그 기준 재합의

---

## 6) R1 종료 기록 템플릿

- 완료: R1 20건 입력/합의/검증 완료
- 다음: R2 021~040 입력 시작 및 불일치 유형 반복 점검
- 검증: `check:judgment-tagging:full` 결과 (PASS/FAIL + 오류 수)
