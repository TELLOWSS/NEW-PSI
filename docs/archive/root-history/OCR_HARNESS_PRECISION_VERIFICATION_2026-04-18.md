# OCR 하네스 정밀 확인 검증 프로토콜 (AI Studio 기준)

작성일: 2026-04-18  
목적: **동일 이미지에서 Google AI Studio 성공 / PSI 하네스 실패** 현상을 재현하고, 실패 원인을 엔진/파이프라인/정책으로 분리 진단

---

## 1) 검증 원칙

- 동일 입력(같은 원본 이미지, 같은 해상도, 같은 파일명)을 사용한다.
- 비교 경로를 3개로 분리한다.
  1. **AI Studio 직접 분석**
  2. **PSI 클라이언트 OCR (`analyzeWorkerRiskAssessment`)**
  3. **PSI 서버 OCR 재분석 (`/api/gateway?action=ocr.retry`)**
- 결과는 단순 성공/실패가 아니라, 다음 필드로 기록한다.
  - `failureCode`
  - `ocrTrace.providerUsed`
  - `ocrTrace.attempts`
  - `ocrTrace.fallbackDepth`
  - `ocrTrace.finalCode`
  - 응답 파싱 가능 여부(JSON parse success/fail)

---

## 2) 사전 체크 (환경)

1. `.env.local`/배포 환경에서 아래 키를 확인
   - `GEMINI_API_KEY` (또는 `GOOGLE_GEMINI_API_KEY`, `GOOGLE_API_KEY`)
   - `VITE_GEMINI_API_KEY_PAID`, `VITE_GEMINI_API_KEY_FREE`
2. 서버 OCR 경로 사용 시, 서버 런타임에서 `GEMINI_API_KEY`가 실제 로드되는지 확인
3. 이미지 파일 조건 확인
   - Base64 손상 없음
   - 포맷: JPG/PNG/GIF/WebP/HEIC
   - 용량: 8MB 이하

---

## 3) 실행 절차 (동일 이미지 1건)

### A. AI Studio 기준값 확보

- 같은 이미지 업로드 후 JSON 출력 확보
- 아래를 기록
  - 추출 성공 여부
  - 핵심 필드(`name`, `jobField`, `safetyScore`, `fullText`) 존재 여부

### B. PSI 클라이언트 OCR 확인

- `OcrAnalysis`에서 동일 이미지 분석
- 실패 시 `ocrFailureCode`와 `ocrErrorMessage` 기록
- 성공 시 텍스트 추출량(`fullText`)과 점수 일관성 확인

### C. PSI 서버 OCR 경로 확인

- 동일 레코드에서 재분석 실행(서버 경로)
- 응답 `trace` 기록
  - `providerUsed`, `latencyMs`, `attempts`, `fallbackDepth`, `finalCode`
- 실패 시 코드 확인
  - `OCR_QUOTA`, `OCR_UPSTREAM_AUTH`, `OCR_INVALID_ARGUMENT`, `OCR_PARSE_FAILURE`, `OCR_TIMEOUT`, `OCR_UPSTREAM_NETWORK`

---

## 4) 원인 판별 규칙

- **AI Studio 성공 + 클라이언트 성공 + 서버 실패**
  - 서버 환경(키/권한/네트워크) 또는 서버 파싱 규칙 이슈 우선
- **AI Studio 성공 + 클라이언트 실패 + 서버 실패**
  - 프롬프트/스키마 강제 또는 입력 전처리 문제 가능성 높음
- **AI Studio 성공 + 서버 성공 + 하네스 상태만 실패표시**
  - 하네스 동기화/상태머신 반영 로직 점검 (`syncHarnessAnalyzeResult`, `syncHarnessReanalyzeResult`)
- **실패코드가 `PARSE` 집중**
  - 모델 응답 형식 변동(코드펜스/부가 텍스트/스키마 불일치) 가능성 우선

---

## 5) 이번 패치 반영사항 (2026-04-18)

- `api/gateway.ts`
  - 서버 OCR 파서를 강화하여 아래 경우를 추가 수용
    - JSON 코드펜스(````json ... ````)
    - 응답 전/후 텍스트가 있는 경우의 JSON 블록 추출
    - 배열/객체 후보 각각 파싱 재시도
  - 성공 trace에 `finalCode: 'OK'` 저장

기대 효과:
- 동일 이미지에서 `OCR_PARSE_FAILURE`의 오탐 비율 감소
- 서버/클라이언트 경로 비교 시 원인 식별 속도 향상

---

## 6) 24시간 검증 지표

- `serverSuccessRate` (서버 재분석 성공률)
- `serverRouteFail` 비중
- `OCR_PARSE_FAILURE` 발생률
- `UNKNOWN` 비중 및 2차 분류 분포
- `fallbackDepth` 평균/상위 95퍼센타일

합격 기준(권장):
- `OCR_PARSE_FAILURE` 비중이 패치 전 대비 유의미하게 감소
- 동일 이미지 재시도 3회 기준 결과 일관성 확보(성공/실패 코드 변동 최소화)

---

## 7) 운영 즉시 액션

1. 동일 실패 이미지 샘플 20건 추출
2. 위 3경로(AI Studio/클라/서버) 교차 실행
3. 실패코드별 샘플 5건씩 원문 응답 패턴(코드펜스/비JSON/타임아웃) 분류
4. `PARSE` 집중 시 프롬프트/스키마/파서 추가 보정
5. 24시간 후 지표 비교 리포트 작성
