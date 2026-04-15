# GEMMA 하이브리드 OCR 아키텍처 설계 (현행 NEW-PSI 기준)

작성일: 2026-04-15  
대상 시스템: NEW-PSI (Vite + React + Vercel API + Supabase)

---

## 1) 목표

- 기존 Gemini 중심 OCR 흐름을 **Gemma 기반 하이브리드 구조**로 전환 가능하도록 설계한다.
- 핵심 목표는 아래 3가지다.
  1. API 토큰 의존도 감소
  2. OCR 실패율 감소(특히 연속 실패 체감)
  3. 실패 원인 분류 표준화(QUOTA/KEY/FORMAT/PARSE/PAYLOAD/NETWORK)

---

## 2) 전제 및 제약

### 2.1 현재 코드 구조
- 클라이언트 OCR 진입: `services/geminiService.ts`
- 운영 화면/재분석 배치: `pages/OcrAnalysis.tsx`
- 서버 라우팅: `api/gateway.ts` (`ocr.retry` 액션)
- 데이터 저장/상태: `WorkerRecord` (`types.ts`)

### 2.2 인프라 제약
- 현행 `api/gateway.ts`는 Vercel Serverless 함수 기반이며, GPU 추론 실행에 부적합.
- Gemma 대형 모델을 안정적으로 돌리려면 별도 추론 서비스 필요.
  - 옵션 A: 사내 GPU 서버(vLLM/TGI)
  - 옵션 B: Cloud Run + GPU
  - 옵션 C: 온프레미스 Ollama(소규모)

### 2.3 정확도 관점
- Gemma는 OCR 전용 엔진이 아니므로, 실제 텍스트 추출은 전용 OCR 엔진과 조합 권장.
- 권장 조합: **OCR 엔진(추출) + Gemma(정규화/해석/채점/코칭 생성)**

---

## 3) 권장 타겟 아키텍처

## 3.1 상위 구조
1. 입력 이미지 수신 (기존 `OcrAnalysis`)
2. 서버 오케스트레이터 호출 (`/api/gateway?action=ocr.hybrid`)
3. 오케스트레이터에서:
   - 1차: OCR 엔진으로 텍스트 추출
   - 2차: Gemma로 구조화(JSON) + 품질 점수 + 근거 생성
   - 3차: 실패 시 정책 기반 fallback
4. `WorkerRecord`로 정규화 후 반환

## 3.2 Provider 체인
- `providerChain` 기본값:
  - `local_ocr+gemma` -> `server_gemini` -> `client_gemini`
- 각 단계 실패 시 `ocrFailureCode`를 유지한 채 다음 provider 시도
- 최종 실패 시 코드/메시지/원인 스택 반환

## 3.3 실패 코드 표준 (현재 타입과 정합)
- `QUOTA`: 호출량 제한/429
- `KEY`: 인증 키 문제
- `FORMAT`: 파일 포맷/디코딩 문제
- `PARSE`: JSON/스키마 파싱 실패
- `PAYLOAD`: 용량 초과/손상/너무 짧음
- `NETWORK`: 타임아웃/게이트웨이/네트워크
- `UNKNOWN`: 기타

---

## 4) API 계약 설계

### 4.1 신규 Gateway Action
- `ocr.hybrid` 추가 (기존 `ocr.retry` 유지)

### 4.2 요청 스키마
```json
{
  "recordId": "string",
  "imageSource": "base64 or dataURL",
  "filenameHint": "string",
  "mode": "auto|local-first|gemma-only|gemini-only",
  "providerChain": ["local_ocr+gemma", "server_gemini", "client_gemini"],
  "trace": true
}
```

### 4.3 응답 스키마
```json
{
  "ok": true,
  "recordId": "...",
  "record": {
    "name": "...",
    "jobField": "...",
    "safetyScore": 72,
    "safetyLevel": "중급",
    "aiInsights": "...",
    "ocrErrorType": null,
    "ocrFailureCode": null
  },
  "trace": {
    "providerUsed": "local_ocr+gemma",
    "attempts": 2,
    "latencyMs": 1830,
    "fallbackUsed": false,
    "stages": [
      { "provider": "local_ocr+gemma", "status": "success", "latencyMs": 1830 }
    ]
  }
}
```

실패 응답 예시:
```json
{
  "ok": false,
  "recordId": "...",
  "code": "PARSE",
  "message": "Gemma JSON 파싱 실패",
  "trace": {
    "providerUsed": "local_ocr+gemma",
    "fallbackUsed": true,
    "stages": [
      { "provider": "local_ocr+gemma", "status": "fail", "code": "PARSE" },
      { "provider": "server_gemini", "status": "fail", "code": "QUOTA" }
    ]
  }
}
```

---

## 5) 모듈 설계

### 5.1 신규 서버 모듈(권장)
- `lib/server/ocr/providers/localOcrProvider.ts`
  - 이미지 전처리, OCR 텍스트 추출
- `lib/server/ocr/providers/gemmaStructuringProvider.ts`
  - OCR 텍스트 -> WorkerRecord 파셜 JSON
- `lib/server/ocr/providers/geminiProvider.ts`
  - 기존 Gemini 서버 추론 래퍼
- `lib/server/ocr/orchestrator.ts`
  - provider chain 실행, timeout/retry/fallback, trace 생성
- `lib/server/ocr/errorCode.ts`
  - 에러 메시지 -> `OcrFailureCode` 표준 매핑

### 5.2 기존 코드 연동 지점
- `api/gateway.ts`
  - `GatewayAction`에 `ocr.hybrid` 추가
  - `case 'ocr.hybrid'` 분기 추가
- `pages/OcrAnalysis.tsx`
  - `requestServerRetryAnalysis`를 `requestHybridAnalysis`로 확장
  - 실패코드(`ocrFailureCode`)별 UI 안내 문구 차등화
- `services/geminiService.ts`
  - 클라이언트 fallback provider로만 유지(최후 fallback)

---

## 6) 프롬프트/출력 규격 (Gemma 단계)

### 6.1 Gemma 입력
- OCR 엔진 추출 텍스트
- 파일명, 감지 언어, 공종 후보, 기존 규칙(LANGUAGE_POLICY/STRICT_SCORE_POLICY 요약본)

### 6.2 Gemma 출력 (강제 JSON)
- 최소 필수:
  - `name`, `jobField`, `teamLeader`, `date`, `nationality`, `language`
  - `fullText`, `koreanTranslation`
  - `safetyScore`, `safetyLevel`, `scoreReasoning`
  - `aiInsights`, `actionable_coaching`, `actionable_coaching_native`
- JSON Schema 검증 실패 시 `PARSE`

### 6.3 후처리
- 기존 `enforceScoreGradeConsistency` 재사용
- 기존 `normalizeNationality` 재사용
- 기존 `detectTextBasedOcrError`는 보조 신호로만 사용

---

## 7) 관측성(Observability) 설계

### 7.1 저장 필드
- `WorkerRecord`에 이미 추가된 `ocrFailureCode` 사용
- 추가 권장 필드(옵션):
  - `ocrProviderUsed`
  - `ocrLatencyMs`
  - `ocrFallbackDepth`

### 7.2 로그 표준
- 각 단계 로그 필수 항목:
  - `recordId`, `provider`, `attempt`, `latencyMs`, `status`, `failureCode`

### 7.3 대시보드 지표
- 실패율(총/Provider별)
- 평균 지연(ms)
- fallback 발생률
- 실패코드 분포(QUOTA/FORMAT/PARSE/...)

---

## 8) 단계별 전환 계획 (Zero-Downtime)

### Phase 0: 준비
- Gemma 추론 서비스 별도 배포
- 헬스체크/부하테스트 완료

### Phase 1: 다크런(읽기 전용)
- 실제 사용자 응답은 기존 경로 유지
- 백그라운드에서 Gemma 결과만 수집/비교
- 지표: 파싱 성공률, 응답시간, 필드 누락률

### Phase 2: Canary 10%
- `mode=auto` 사용자 10%에 `ocr.hybrid` 적용
- 실패 시 즉시 `server_gemini` fallback

### Phase 3: 50% 확장
- 국가/공종/문서 품질 세그먼트별 정확도 확인
- 임계치 미달 세그먼트는 provider 체인 분리

### Phase 4: 기본 경로 전환
- `local_ocr+gemma`를 기본값으로 승격
- `client_gemini`는 최후 fallback 유지

---

## 9) 품질 게이트 (출시 기준)

- 파싱 성공률: 99% 이상
- 최종 실패율: 기존 대비 30% 이상 감소
- 평균 처리시간: 기존 대비 +20% 이내
- 치명 오류(UNKNOWN): 5% 미만
- 다국어 필드 누락률(native): 1% 미만

---

## 10) 보안/운영

- 이미지 원본 저장 최소화(필요 시 TTL 삭제)
- 추론 서비스 접근은 서버-서버 토큰으로 제한
- 모델 프롬프트/출력 로그는 PII 마스킹
- 장애 시 Circuit Breaker: Gemma 장애가 전체 OCR 중단으로 전파되지 않게 구성

---

## 11) 현재 버전 기준 즉시 실행 항목 (실행 순서)

1. `api/gateway.ts`에 `ocr.hybrid` 액션 설계 반영
2. Gemma 오케스트레이터 모듈 초안 구현
3. `OcrAnalysis.tsx`에서 재분석 호출을 `ocr.hybrid` 우선으로 전환
4. 실패코드별 사용자 안내 텍스트 차등화
5. 실패코드 분포 카드(QUOTA/FORMAT/PARSE/...) 상단 노출

---

## 12) 의사결정 요약

- Gemma를 도입하되, OCR 전용 엔진과 결합한 **하이브리드**가 정답.
- 목표는 “완벽 OCR”이 아니라, **실패율 감소 + 원인 가시화 + 비용 구조 최적화**.
- 현행 코드와 충돌 없이 단계적 전환 가능.
