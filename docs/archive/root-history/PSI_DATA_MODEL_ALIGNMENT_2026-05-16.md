# PSI 데이터 모델 정렬안 (2026-05-16)

- 목적: Human Risk Engine 전환 계획을 기존 코드 구조(`WorkerRecord`, `scoreBreakdown`, 리포트 파이프라인)와 충돌 없이 연결한다.
- 기준 파일: `types.ts`, `App.tsx`, `services/geminiService.ts`

---

## 1) 현재 코드 기준 (변경 없이 유지)

### 고정 유지 대상
- `WorkerRecord.safetyScore`
- `WorkerRecord.safetyLevel`
- `WorkerRecord.scoreBreakdown`
  - `psychological`
  - `jobUnderstanding`
  - `riskAssessmentUnderstanding`
  - `proficiency`
  - `improvementExecution`
  - `repeatViolationPenalty`

### 운영 결론
- 기존 6대 지표 점수 정책은 `보고/승인/릴리즈 게이트` 용도로 유지한다.
- Human Risk Engine은 별도 구조(`태그/벡터/전조`)를 추가해 병행 운영한다.

---

## 2) 6대 지표 ↔ 벡터 매핑 (v1)

| scoreBreakdown 키 | 벡터 필드(신규 운영 필드) | 해석 |
| --- | --- | --- |
| `psychological` | `attentionState`, `riskSalience`, `ownershipLevel` | 집중·책임·경계상태 |
| `jobUnderstanding` | `taskUnderstanding`, `toolMaterialClarity`, `sequenceUnderstanding` | 작업 맥락/순서 이해 |
| `riskAssessmentUnderstanding` | `hazardRecognition`, `causeEffectReasoning`, `controlAwareness` | 위험 인지/원인 연결 |
| `proficiency` | `proceduralSkill`, `verificationDiscipline`, `responseCapability` | 실행 역량/검증 습관 |
| `improvementExecution` | `correctiveActionReadiness`, `ownerClarity`, `followthroughLevel` | 개선 실행력 |
| `repeatViolationPenalty` | `riskNormalization`, `ruleBypassTendency`, `habitualViolationSignal` | 위험 정상화/우회 성향 |

### 점수와 벡터의 역할 분리
- 점수: 월간 리포트/승인 게이트/감사 대응
- 벡터: 전조 탐지/예측/개입 추천

---

## 3) 저장 단위 정렬안

### 3-1. 최소 엔티티
1. `judgment_tag_record`
   - 수기/면담/교육 응답의 판단 태깅 저장

2. `worker_profile_vector`
   - 작업자 단위 벡터 집계

3. `site_context_snapshot`
   - 시점/현장 맥락 스냅샷

4. `behavior_event_log`
   - 전조 행동 이벤트 로그

5. `risk_signal`
   - 예측 직전 신호와 설명

### 3-2. 기존 WorkerRecord 연결 키
- `workerId` ↔ `WorkerRecord.id` / `worker_uuid`
- `trade` ↔ `WorkerRecord.jobField`
- `nationality` ↔ `WorkerRecord.nationality`
- `recordDate` ↔ `WorkerRecord.date`
- `linkedMetric` ↔ `WorkerRecord.scoreBreakdown` 키

---

## 4) 온톨로지 코드값 규칙 (v1)

| 컬럼 | 규칙 | 예시 |
| --- | --- | --- |
| `riskCategoryCode` | 대분류 2~4자 코드 | `FALL`, `DROP`, `PINCH`, `COLLAPSE`, `ELECTRIC` |
| `riskSubcategoryCode` | `대분류.중분류` | `FALL.HARNESS`, `DROP.HOIST` |
| `ontologyNodeId` | `대분류-중분류-세부` | `FALL-HARNESS-UNCONNECTED` |
| `judgmentTagCode` | 태그 코드 | `J_RISK_UNDERESTIMATE`, `J_TIME_PRESSURE` |

---

## 5) 운영 단계별 적용 범위

### Phase A (즉시)
- 문서/CSV 기반 수동 태깅
- 기존 앱 코드 변경 없음

### Phase B (다음)
- 태깅 CSV를 내부 JSON으로 변환하는 스크립트 추가
- `WorkerRecord`와 연결한 검토 대시보드 구축

### Phase C (후속)
- 전조 시그널 규칙 엔진 연결
- 설명 가능한 위험 경고 문장 자동 생성

---

## 6) 즉시 실행 체크
- [ ] 표본 100건을 CSV 템플릿으로 입력
- [ ] 2인 태깅 후 불일치 항목 합의
- [ ] 상위 태그 20개 빈도표 산출
- [ ] 전조 시그널 후보 10개 도출
- [ ] `scoreBreakdown` 대비 벡터 분포 비교표 작성

---

## 7) 결론

현재 코드 구조는 이미 6대 지표 점수 체계를 안정적으로 운영하고 있으므로, Human Risk Engine 전환은 `교체`가 아니라 `증설` 전략이 적합하다.

따라서 단기적으로는 코드 변경 없이 데이터 구조화(태그/벡터/전조)부터 시작하고, 중기적으로 규칙 엔진·대시보드 연결 순서로 확장한다.
