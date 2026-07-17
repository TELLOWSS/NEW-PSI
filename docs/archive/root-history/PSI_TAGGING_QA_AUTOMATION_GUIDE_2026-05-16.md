# PSI 태깅 품질검증 자동화 가이드 (2026-05-16)

- 목적: 표본 태깅 CSV 입력 시 누락/코드오타/온톨로지 불일치를 자동 검출해 2인 태깅 합치도 작업 전에 데이터 품질을 확보한다.
- 스크립트: `scripts/check-judgment-tagging-quality.cjs`

---

## 1) 준비 파일

- 입력 CSV(샘플): `templates/psi_judgment_tagging_template_v1.csv`
- 입력 CSV(100행 빈 템플릿): `templates/psi_judgment_tagging_blank_100rows_v1_2026-05-16.csv`
- 태그 코드북: `templates/psi_judgment_tag_codebook_v1_24_2026-05-16.csv`
- 온톨로지 시드: `templates/psi_ontology_v1_seed_2026-05-16.csv`

---

## 2) 실행 명령

### 기본 검증 (샘플 CSV)
- `npm run check:judgment-tagging`

### 100행 빈 템플릿 검증
- `npm run check:judgment-tagging:blank100`

### 리포트 파일 생성
- `npm run check:judgment-tagging:report`

### OPS 3줄 요약 자동 생성
- `npm run report:judgment-tagging:ops-summary`

### 리포트 + OPS 요약 일괄 실행
- `npm run check:judgment-tagging:full`

### R1 종료 템플릿 생성
- `npm run report:judgment-tagging:r1-closeout`

### R1 풀체인 실행(권장)
- `npm run check:judgment-tagging:r1:full`

생성 리포트:
- `reports/judgment-tagging-quality.json`
- `reports/judgment-tagging-quality.md`
- `reports/judgment-tagging-ops-summary.md`
- `reports/judgment-tagging-r1-closeout.md`

라운드 운영 자산:
- `PSI_TAGGING_100_EXECUTION_BOARD_2026-05-16.md`
- `templates/psi_judgment_tagging_progress_tracker_100_v1_2026-05-16.csv`
- `PSI_TAGGING_R1_STARTER_PACK_2026-05-16.md`
- `templates/psi_judgment_tagging_r1_worksheet_001_020_2026-05-16.csv`

---

## 3) 검증 항목

1. 필수 컬럼 존재 여부
2. 필수값 누락 여부(입력 완료 행 기준)
3. 코드북 미정의 태그 코드
4. 온톨로지 시드 미정의 조합
   - `riskCategoryCode + riskSubcategoryCode + ontologyNodeId`
5. 태그명 개수와 코드 개수 일치 여부
6. 중복 `recordId` 여부
7. 벡터/지표/신호 값 허용범위 검증
8. 오류/경고 유형 TOP5 자동요약

---

## 3-1) 자동요약 확인 포인트

- 콘솔 출력:
   - `[PSI-TAG-QA] ERROR_TOP5`
   - `[PSI-TAG-QA] WARNING_TOP5`
- Markdown 리포트 섹션:
   - `오류 유형 TOP5`
   - `경고 유형 TOP5`

운영자는 상세 오류 전체를 보기 전에 TOP5를 먼저 확인해 우선 수정 항목을 빠르게 정한다.

---

## 3-2) 자동 수정 우선순위 액션

- 콘솔 출력:
   - `[PSI-TAG-QA] ACTION_TOP5`
- Markdown 리포트 섹션:
   - `자동 수정 우선순위 액션`

우선순위는 오류 빈도와 유형(필수값 누락, 코드북 미정의, 온톨로지 불일치 등)을 기준으로 자동 생성된다.

---

## 4) 운영 기준

- `RESULT=PASS`: 태깅 데이터 구조 품질 기준 충족
- `RESULT=FAIL`: 오류 해소 후 재실행
- `WARN`: 입력 진행 중 참고용(예: `reviewNeeded=Y`인데 reviewer 비어 있음)

---

## 5) 권장 운영 루틴

1. 1차 입력 후 즉시 `check:judgment-tagging`
2. 오류 0건 만들기
3. 평가자 2인 태깅 합의
4. 최종본에 `check:judgment-tagging:report` 실행
5. 리포트 산출물 보관 후 상위 태그/전조 분석 진행
