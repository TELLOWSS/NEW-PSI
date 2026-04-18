# OCR 엔진 vs 파이프라인 장애 판별 체크리스트 (NEW-PSI)

작성일: 2026-04-16  
대상: `pages/OcrAnalysis.tsx` + `api/gateway.ts` + `services/geminiService.ts` 운영 진단

---

## 0) 빠른 결론 규칙 (먼저 읽기)

아래 조건이면 **엔진 자체 문제 가능성 낮음 / 파이프라인 이슈 우선**:
- `ocrFailureCode`가 `NETWORK`, `KEY`, `QUOTA`, `PAYLOAD`, `FORMAT` 중심
- 서버 경로 실패(`serverRouteFail`)가 증가
- API 응답에서 HTTP 5xx/타임아웃/키 누락 메시지 존재
- 동일 이미지를 클라이언트 폴백에서 성공

아래 조건이면 **엔진/모델 품질 문제 가능성 있음**:
- 동일 입력/동일 환경에서 서버+클라이언트 모두 성공 응답(2xx)이지만
- OCR 텍스트가 반복적으로 비정상(빈 텍스트, 파싱 불가, 매우 낮은 신뢰도)
- `PARSE` 또는 텍스트 기반 오류가 지속

---

## 1) 동일 이미지 1건 수동 OCR 재실행 (엔진 출력 유무 확인)

### 실행 위치
- UI: `OcrAnalysis` 재분석 동선
- 코드 진입점: `requestServerRetryAnalysis()` in `pages/OcrAnalysis.tsx`
  - `POST /api/gateway?action=ocr.retry` 호출

### 확인 포인트
1. 같은 원본 이미지 1건으로 `직접 재분석` 2회 실행
2. 결과가 둘 다 실패인지, 1회라도 성공인지 확인
3. 실패 시 `ocrFailureCode`, `ocrErrorMessage`, `aiInsights`를 기록

### 판정
- **1회라도 성공**: 엔진 완전 장애 가능성 낮음(경로/일시/상태 이슈 가능성)
- **연속 실패 + 동일 코드 반복**: 다음 단계(API 응답/입력 검증)로 원인 고정

---

## 2) API 응답코드/에러 바디 확인 (5xx, timeout, invalid payload)

### 실행 위치
- 서버 라우트: `handleOcrRetry()` / `analyzeSingleRecord()` in `api/gateway.ts`
- 공통 에러 응답: `handler()` catch 블록 (`statusCode`, `message`, `code`)

### 서버에서 확인할 핵심
- HTTP status (`400`, `401/403`, `429`, `500~504`)
- 에러 메시지 예시
  - `Gemini API 오류 (5xx)`
  - `서버 Gemini API 키가 설정되지 않았습니다`
  - `Method Not Allowed`
  - `이미지 데이터가 너무 짧아 재분석할 수 없습니다`

### 프론트에서 확인할 핵심
- `runBatchAnalysis()` 내 분류 카운터
  - `serverRouteFail`
  - `processingFail`
  - `preflightFail`
- 서버 실패 후 클라이언트 폴백 성공 여부(`clientFallbackSuccess`)

### 판정
- `serverRouteFail`↑ + 5xx/timeout/키 오류: **파이프라인(서버/환경) 문제**
- 4xx payload/format 중심: **입력/전처리 문제**
- 2xx 정상인데 파싱 실패 반복: **모델 출력/파싱 경계 문제**

---

## 3) 입력 파일 상태 + 전처리 로그 확인 (해상도/회전/용량/포맷)

### 실행 위치
- 프론트 전처리/검증: `validateImageFormat()`, `isFormatCompatibleWithAI()` in `services/geminiService.ts`
- 서버 전처리: `normalizeImagePayload()` in `api/gateway.ts`

### 확인 포인트
1. 이미지 데이터 길이
   - 서버: 길이 < 100이면 즉시 실패 (`image data too short`)
2. 포맷 감지값
   - 허용: `jpeg/png/gif/webp/heic` (AI 호환)
3. Base64 무결성
   - decode 실패/문자 손상 여부
4. 실패코드 매핑
   - `FORMAT`, `PAYLOAD`가 주로 증가하는지 확인

### 판정
- `FORMAT/PAYLOAD` 다수: **엔진 전 단계 입력 품질 문제**
- 포맷/무결성 통과 후에도 실패 지속: API/모델 단계 점검 필요

---

## 4) 최근 배포/모델 버전 변경 여부 확인

### 확인 위치
- 모델 상수(클라이언트): `services/geminiService.ts`
  - `OCR_MODEL_PRIMARY = gemini-3.0-flash`
  - `OCR_MODEL_FALLBACK = gemini-3-flash-preview`
  - `OCR_MODEL_STABLE_FALLBACK = gemini-2.5-flash`
- 서버 OCR 호출 모델: `api/gateway.ts`
  - `gemini-2.5-flash`
- 변경 이력 문서
  - `OCR_ANALYSIS_VERIFICATION.md` (2026-04-16 역추적/수정 내역)
  - `GEMMA_HYBRID_OCR_ARCHITECTURE_2026-04-15.md`
  - `DEPLOYMENT_ENV_CHECKLIST.md` (키/배포 프리플라이트)

### 확인 포인트
- 최근 배포 후 실패율 급증 시점이 모델/키 변경 시점과 일치하는지
- `GEMINI_API_KEY`/폴백 키 누락 또는 권한 변경 여부
- 모델 가용성 오류 후 stable fallback으로 전환 로그가 있는지

### 판정
- 변경 직후 장애 + 키/권한 이상: **배포/설정 이슈**
- 변경 없이 특정 입력군만 실패: **데이터 품질/문서군 특성 이슈**

---

## 5) 5분 최종 판정표 (운영용)

- [ ] 동일 이미지 1건 재실행 2회 결과 기록
- [ ] API status + error body 기록
- [ ] `preflightFail / processingFail / serverRouteFail` 수치 기록
- [ ] `ocrFailureCode` 상위 1~2개 기록
- [ ] 모델/키/배포 변경 여부 체크

### 결정 규칙
- `NETWORK|KEY|QUOTA` 중심 + serverRouteFail 증가 → **파이프라인 문제로 분류**
- `FORMAT|PAYLOAD` 중심 → **입력/전처리 문제로 분류**
- 정상 응답 다수 + 텍스트 품질 저하/파싱 실패 반복 → **엔진/모델 문제 후보**

---

## 6) 운영 기록 템플릿 (복붙용)

```text
[OCR 장애 판별 기록]
- 시각:
- 대상 recordId/file:
- 재실행 결과(2회):
- API status / message:
- ocrFailureCode top:
- retryDiagnostics: preflightFail=?, processingFail=?, serverRouteFail=?
- 최근 변경(모델/키/배포):
- 최종 분류: 엔진 / 파이프라인 / 입력품질
- 즉시 조치:
```

---

## 7) 2026-04-16 취약점 개선 반영 (완료)

### 발견 취약점
1. 입력 포맷 우회 가능성
  - 미확인 시그니처를 기본 `image/jpeg`로 처리해 비정상 데이터가 상위 API로 전달될 수 있었음.
2. 대용량 이미지 무제한 수용
  - 재분석 API에 이미지 최대 크기 제한이 없어 메모리/지연 리스크가 있었음.
3. 외부 OCR 호출 타임아웃 부재
  - Gemini 응답 지연 시 요청이 장시간 대기할 수 있었음.
4. 오류코드 비정규화
  - 500으로 뭉뚱그려져 운영에서 원인 분류가 늦어지는 구간이 있었음.

### 개선 사항
- Base64 문자 검증 + 포맷 화이트리스트(`JPG/PNG/GIF/WebP/HEIC`) 강제
- 이미지 최대 8MB 제한(초과 시 413)
- OCR 업스트림 호출 25초 타임아웃(초과 시 504)
- 업스트림 상태별 코드 표준화(`OCR_QUOTA`, `OCR_TIMEOUT`, `OCR_UPSTREAM_*`, `OCR_PARSE_FAILURE`)
- 비정상 `statusCode` 방어(400~599 범위만 허용)

### 검증 결과
- TypeScript 타입체크 통과
- 프로덕션 빌드 통과

---

## 8) 2026-04-18 정상 이미지 기준 재검증 시나리오 (추가)

전제: **입력 이미지는 정상**이며, 실패 원인은 엔진 품질이 아니라 경로/일시 장애일 가능성을 우선 본다.

### 실행 절차 (동일 이미지 1건, 3회)
1. `직접 재분석`을 동일 이미지로 3회 실행
2. 각 실행마다 아래를 기록
   - `ocrFailureCode`
   - `ocrTrace.attempts`
   - `ocrTrace.fallbackDepth`
   - `ocrTrace.finalCode` (실패 시)
3. 결과를 성공/실패로 나눠 코드 분포를 확인

### 기대 정상 패턴 (개선 반영 후)
- 일시 장애가 있어도 2~3회 내 복구되는 비율 증가
- 실패가 나더라도 `UNKNOWN`보다 `KEY/NETWORK/PARSE`로 분해
- 실패 레코드의 `ocrConfidence`가 100%로 보이지 않음

### 즉시 경보 패턴
- 3회 모두 동일 `KEY` → 서버 키/권한 점검 우선
- 3회 모두 `NETWORK` + `fallbackDepth` 증가 → 업스트림/네트워크 지연 점검
- `PARSE` 반복 + 응답은 2xx → 모델 출력 형식 안정화(프롬프트/파서) 점검

---

## 9) 2026-04-18 코드 보강 반영 요약 (추가)

### 반영 내용
- 서버 `ocr.retry` 경로를 단일 모델에서 모델 체인 폴백으로 확장
  - `gemini-2.5-flash` → `gemini-3.0-flash` → `gemini-3-flash-preview`
- 서버 trace에 실제 `attempts`, `fallbackDepth` 반영
- 클라이언트 최종 실패/예외 경로에 `ocrTrace.finalCode` 저장
- 재시도 루프에서 비-429 일시 오류(5xx/timeout/network)도 재시도
- 파싱 실패 계열에서 클라이언트 폴백 경로 허용
- 실패 신호가 있는 레코드의 기본 `ocrConfidence`를 0으로 보정

### 운영 효과
- 정상 이미지인데 실패하던 케이스의 복구율 개선
- `UNKNOWN` 집중 현상 완화 및 원인 코드 분해력 향상
- 대시보드/목록에서 실패 신호 가시성 개선

