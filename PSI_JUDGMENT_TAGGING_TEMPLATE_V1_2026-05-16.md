# PSI 판단 태깅 템플릿 v1 (2026-05-16)

- 목적: 수기자료/면담/교육응답을 `점수 이전` 단계에서 구조화하기 위한 운영 템플릿
- 사용범위: 표본 100건 ~ 500건 수동 태깅, 평가자 합치도 점검, 전조 시그널 추출

---

## 1) 기본 원칙
- 원문을 수정하지 않고 보존한다.
- 한 건의 응답에 여러 태그를 허용한다.
- 점수는 나중에 계산하고, 먼저 `위험유형`, `판단태그`, `맥락`, `전조여부`를 확정한다.
- 애매한 경우 태그를 비워두지 말고 `reviewNeeded`를 `Y`로 표시한다.

---

## 2) 권장 컬럼

| 컬럼 | 설명 | 예시 |
| --- | --- | --- |
| `recordId` | 원천 기록 식별자 | `2026-05-16-001` |
| `sourceType` | 데이터 출처 | `manual-note`, `interview`, `education-response`, `ocr-record` |
| `siteId` | 현장 식별자 | `SITE-A01` |
| `teamId` | 팀/협력사 식별자 | `FORM-02` |
| `workerId` | 작업자 식별자 | `W-1042` |
| `trade` | 공종 | `형틀`, `철근`, `비계`, `전기` |
| `taskStep` | 작업 단계 | `준비`, `설치`, `양중`, `해체`, `정리` |
| `shiftType` | 근무 형태 | `day`, `night` |
| `rawText` | 원문 | 자유기술 원문 그대로 |
| `riskCategory` | 대분류 위험 | `추락`, `낙하`, `협착`, `붕괴`, `감전` |
| `riskSubcategory` | 중분류 위험 | `안전고리`, `개구부`, `양중`, `장비`, `활선` |
| `judgmentTags` | 판단 태그 배열 | `위험 과소평가;시간압박;우회행동` |
| `vectorTaskUnderstanding` | 작업이해 | `low`, `mid`, `high` |
| `vectorHazardRecognition` | 위험인지 | `low`, `mid`, `high` |
| `vectorSequenceUnderstanding` | 순서이해 | `low`, `mid`, `high` |
| `vectorRiskNormalization` | 위험 정상화 | `low`, `mid`, `high` |
| `vectorResponseCapability` | 대응역량 | `low`, `mid`, `high` |
| `precursorSignal` | 사고 전조 여부 | `Y`, `N`, `suspected` |
| `recommendedAction` | 권장 개입 | `재교육`, `현장코칭`, `작업중지`, `관리자확인` |
| `reviewNeeded` | 검토 필요 여부 | `Y`, `N` |
| `reviewNote` | 검토 메모 | `원인 이해 부족과 시간압박 중 우세 요인 재확인 필요` |

---

## 3) 판단 태그 사전 v1

### 위험인지
- `위험 과소평가`
- `위험 미인지`
- `원인 이해 부족`
- `결과만 인식`

### 작업이해
- `작업 목적 미이해`
- `순서 혼동`
- `도구 용도 불명확`
- `공정 맥락 부족`

### 심리상태
- `시간압박`
- `피로`
- `주의분산`
- `과신`
- `무감각`

### 규정행동
- `절차 생략`
- `우회행동`
- `확인 생략`
- `PPE 형식착용`

### 사회/소통
- `언어장벽`
- `지시 오해`
- `동료 의존`
- `신호 미공유`

### 개선실행
- `책임자 불명확`
- `조치시점 불명확`
- `확인방법 부재`
- `재발방지 미흡`

---

## 4) 샘플 작성 예시

| recordId | sourceType | trade | taskStep | rawText | riskCategory | riskSubcategory | judgmentTags | vectorTaskUnderstanding | vectorHazardRecognition | vectorSequenceUnderstanding | vectorRiskNormalization | vectorResponseCapability | precursorSignal | recommendedAction | reviewNeeded |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `2026-05-16-001` | `manual-note` | `비계` | `설치` | `잠깐이라 괜찮다고 생각해서 고리를 안 걸었다` | `추락` | `안전고리` | `위험 과소평가;시간압박;우회행동` | `mid` | `low` | `mid` | `high` | `low` | `Y` | `현장코칭;재교육` | `N` |
| `2026-05-16-002` | `education-response` | `형틀` | `준비` | `작업 순서는 아는데 왜 개구부 주변 통제가 필요한지는 잘 모르겠다` | `추락` | `개구부` | `원인 이해 부족;공정 맥락 부족` | `mid` | `low` | `mid` | `mid` | `low` | `suspected` | `재교육` | `Y` |
| `2026-05-16-003` | `interview` | `전기` | `점검` | `차단은 했다고 들었는데 직접 확인은 안 했다` | `감전` | `활선` | `확인 생략;동료 의존;절차 생략` | `mid` | `mid` | `mid` | `mid` | `low` | `Y` | `관리자확인;현장코칭` | `N` |

---

## 5) 운영 절차
1. 표본 100건 선정
2. 평가자 2인이 독립 태깅
3. 불일치 태그 합의
4. 상위 빈도 태그와 전조 패턴 집계
5. 6대 지표와 벡터 매핑 검토

---

## 6) 성공 기준
- 같은 문장에 대해 평가자 간 핵심 태그가 크게 흔들리지 않을 것
- 위험유형과 판단태그가 분리되어 저장될 것
- `사고 이후 설명`보다 `사고 이전 판단 붕괴`를 더 잘 설명할 수 있을 것
