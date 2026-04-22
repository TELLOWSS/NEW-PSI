# 6대 지표 앵커 루브릭 가이드 (자유기술 평가형)

## 목적
이 문서는 위험성평가기록지의 **자유기술 답변**을 정답형으로 채점하지 않고,
동일 맥락에서 점수 편차를 줄이기 위한 **운영 기준(앵커)** 을 제공합니다.

핵심 원칙:
- 정답 단어 매칭 금지
- 같은 의미는 같은 점수대
- 점수 근거는 실행 가능 행동 중심

---

## 앵커 등급(공통)
- **A(상)**: 위험조건/원인 + 실행행동 + 검증기준(수치/범위/체크포인트)까지 포함
- **B(중)**: 위험과 행동은 있으나 조건/검증기준 일부 누락
- **C(하)**: 추상적 구호/단답형, 공종 무관 문장 위주

---

## 6대 지표별 판단 앵커

### ① 심리지표 (0~10)
- A(7~10): 본인 작업 상황을 진지하게 서술, 책임 의식이 문장에 드러남
- B(4~6): 문장으로 작성했으나 형식적
- C(0~3): 단어 나열/성의 부족

### ② 업무이해도 (0~20)
- A(13~20): 본인 공종 + 자재/도구/작업대상 명확
- B(6~12): 공종은 맞지만 자재/도구 불명확
- C(0~5): 일반론(“열심히 하겠다”) 수준

### ③ 위험성평가 이해도 (0~20)
- A(13~20): 공종 핵심 위험을 본인 작업과 연결해 설명
- B(6~12): 위험 언급은 있으나 연결성 약함
- C(0~5): 공종 무관/예시 베끼기/추상 위험만 반복

### ④ 숙련도 (0~30)
- A(24~30): 작업 전·중·후 조치 + 수치/거리/체결/통제 기준 제시
- B(6~23): 조치는 있으나 순서/검증 기준 부족
- C(0~5): “조심한다/안전모 착용” 같은 구호형 문장만 존재

### ⑤ 개선이행도 (0~20)
- A(18~20): 담당자·시점·확인방법까지 명시
- B(6~17): 조치 다수 있으나 담당/시점/확인 일부 누락
- C(0~5): 실행계획 불명확 또는 없음

### ⑥ 반복위반 패널티 (0~-30)
- 0: 반복 구호 거의 없음
- -10~-20: 상투어 일부 반복
- -30: “안전제일/수칙준수” 같은 껍데기 문구 반복 중심

---

## 편차 억제 운영 규칙
- 같은 공종 + 같은 위험맥락 + 같은 행동수준이면 근접 점수로 유지
- 경미 수정(오타/문장정리)만 있으면 점수 유지
- 점수 근거(`scoreReasoning`)에는 앵커 판정(A/B/C) 근거를 최소 1개 이상 기록

---

## 관리자 검토 체크포인트
- 점수가 아니라 근거를 먼저 확인
- “왜 이 점수인가?”가 작업 전·중·후 행동으로 설명되는지 확인
- 2차 승인 시 점수 변경이 있다면 변경 근거를 감사로그에 남김

---

## 자동 검증 게이트 실행

- 기본 실행(시드 없으면 SKIP, 시드 있으면 PASS/FAIL):
	- `npm run check:score-consistency`
- 엄격 실행(시드 없으면 즉시 FAIL):
	- `npm run check:score-consistency:strict`
- 엄격 실행(편차 ±8 기준):
	- `npm run check:score-consistency:strict8`
- 리포트 생성(JSON + Markdown):
	- `npm run check:score-consistency:report`
- 리포트 생성(JSON + Markdown, 편차 ±8 기준):
	- `npm run check:score-consistency:report:strict8`

리포트 파일 위치:
- `reports/score-consistency.json`
- `reports/score-consistency.md`
- `reports/score-consistency-strict8.json`
- `reports/score-consistency-strict8.md`

옵션(직접 실행 시):
- `--max-gap 8` : 유사 맥락 허용 점수 편차를 ±8로 조정
- `--min-similarity 0.8` : 유사도 기준 상향
- `--strict` : 시드 누락을 실패로 처리

배포 전 기본 검증:
- `npm run verify:fast`에 `check:score-consistency:strict8`이 포함되어, 기본 파이프라인에서 ±8 편차 기준을 강제합니다.

릴리즈 검증/아티팩트:
- `npm run verify:release`는 `verify:fast` 통과 후 `check:score-consistency:report:strict8`를 실행해 아래 리포트를 항상 생성합니다.
	- `reports/score-consistency-strict8.json`
	- `reports/score-consistency-strict8.md`
- 두 리포트에는 실행 추적 메타데이터가 포함됩니다.
	- `generatedAt`(UTC)
	- `workspace`
	- `git.branch`, `git.commit`, `git.dirty`
