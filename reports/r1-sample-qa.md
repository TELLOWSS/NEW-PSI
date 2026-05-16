# PSI 판단태깅 품질검증 리포트

- 생성 시각(UTC): 2026-05-16T07:40:49.161Z
- 입력 파일: templates/psi_judgment_tagging_r1_worksheet_001_020_2026-05-16_sample.csv
- 코드북: templates/psi_judgment_tag_codebook_v1_24_2026-05-16.csv
- 온톨로지: templates/psi_ontology_v1_seed_2026-05-16.csv
- 전체 행 수: 6
- 입력 완료 행 수: 6
- 미입력 행 수: 0
- 오류 수: 41
- 경고 수: 0
- 상태: FAIL

## 오류 유형 TOP5

| rank | count | field | message |
| ---: | ---: | --- | --- |
| 1 | 2 | recommendedAction | 필수값 누락 |
| 2 | 1 | judgmentTagCodes | 태그 수(4)와 코드 수(5) 불일치 |
| 3 | 1 | judgmentTagCodes | 태그 수(1)와 코드 수(3) 불일치 |
| 4 | 1 | judgmentTagCodes | 태그 수(2)와 코드 수(3) 불일치 |
| 5 | 1 | judgmentTagCodes | 코드북 미정의 코드: riskAssessmentUnderstanding |

## 자동 수정 우선순위 액션

| priority | source | count | title | action |
| ---: | --- | ---: | --- | --- |
| 1 | error | 2 | 필수값 누락 우선 보정 | required 컬럼 누락 행부터 보정한 뒤 재검증 |
| 2 | error | 1 | 태그-코드 개수 정렬 | judgmentTags와 judgmentTagCodes 개수를 1:1로 맞춤 |
| 3 | error | 1 | 태그 코드북 정합성 보정 | judgmentTagCodes를 코드북 기준 코드로 치환 |

## 오류 상세

| row | field | message |
| ---: | --- | --- |
| 2 | judgmentTagCodes | 태그 수(4)와 코드 수(5) 불일치 |
| 3 | reviewNeeded | 허용되지 않은 값: low |
| 3 | judgmentTagCodes | 태그 수(1)와 코드 수(3) 불일치 |
| 4 | judgmentTagCodes | 태그 수(2)와 코드 수(3) 불일치 |
| 5 | recommendedAction | 필수값 누락 |
| 5 | vectorTaskUnderstanding | 허용되지 않은 값: suspected |
| 5 | vectorHazardRecognition | 허용되지 않은 값: ?ì ë°ê²½ ì¶ì?µì  ë°?? ë??ë°°ì¹ |
| 5 | vectorSequenceUnderstanding | 허용되지 않은 값: A007 |
| 5 | vectorRiskNormalization | 허용되지 않은 값: Y |
| 5 | vectorResponseCapability | 허용되지 않은 값: ?´ì¬ |
| 5 | linkedMetric | 허용되지 않은 지표 키: ?¬ê°ì§? ?ì¥ ?ì¸ ?ì |
| 5 | precursorSignal | 허용되지 않은 값: pending |
| 5 | reviewNeeded | 허용되지 않은 값: in-progress |
| 5 | judgmentTagCodes | 코드북 미정의 코드: riskAssessmentUnderstanding |
| 5 | ontologyNodeId | 온톨로지 시드 미정의 조합: high|high|mid |
| 6 | shiftType | 허용되지 않은 값: 46158.375601851854 |
| 6 | vectorResponseCapability | 허용되지 않은 값: proficiency |
| 6 | linkedMetric | 허용되지 않은 지표 키: Y |
| 6 | precursorSignal | 허용되지 않은 값: ë³´ì¡°?êµ¬ ?¬ì© ë°???  ë¶ë¦¬ |
| 6 | reviewNeeded | 허용되지 않은 값: ê°ë¦¬ |
| 6 | judgmentTagCodes | 태그 수(3)와 코드 수(1) 불일치 |
| 6 | judgmentTagCodes | 코드북 미정의 코드: mid |
| 6 | ontologyNodeId | 온톨로지 시드 미정의 조합: PINCH.MATERIAL|PINCH-MATERIAL-HAND_TRAP|?í ë¯¸ì¸ì§;ê³¼ì ;?ì°¨ ?ëµ |
| 7 | riskCategory | 필수값 누락 |
| 7 | riskSubcategory | 필수값 누락 |
| 7 | riskCategoryCode | 필수값 누락 |
| 7 | riskSubcategoryCode | 필수값 누락 |
| 7 | ontologyNodeId | 필수값 누락 |
| 7 | judgmentTags | 필수값 누락 |
| 7 | judgmentTagCodes | 필수값 누락 |
| 7 | vectorTaskUnderstanding | 필수값 누락 |
| 7 | vectorHazardRecognition | 필수값 누락 |
| 7 | vectorSequenceUnderstanding | 필수값 누락 |
| 7 | vectorRiskNormalization | 필수값 누락 |
| 7 | vectorResponseCapability | 필수값 누락 |
| 7 | linkedMetric | 필수값 누락 |
| 7 | precursorSignal | 필수값 누락 |
| 7 | recommendedAction | 필수값 누락 |
| 7 | recommendedActionCode | 필수값 누락 |
| 7 | reviewNeeded | 필수값 누락 |
| 7 | ontologyNodeId | 온톨로지 시드 미정의 조합: || |

