# PSI OCR 비용·정확도 검증 및 개선 보고서

- 검증 기준일: 2026-08-22
- 대상: NEW-PSI 수기 문서 OCR, 구조화 추출, 운영 재분석 경로
- 결론: 기존 구현은 실제 정답 데이터셋과 호출 비용 기록이 없어 "최고 정확도·최저 비용"을 입증할 수 없었다. 이번 변경으로 즉시 제거할 수 있는 중복 호출과 과신 판정을 없애고, 저가 모델에서 시작해 품질이 부족한 문서만 정밀 모델로 한 번 승격하는 구조로 바꿨다. 또한 모든 공급자 생성 호출 전에 실제 입력 토큰과 최악 출력 예산을 검사해 문서당 비용 상한을 넘는 호출은 실행 전에 차단한다.

## 1. 기존 구현에서 확인된 문제

1. 이미지 1건을 분석하면서 검색용 시드 추출, 임베딩, 본 OCR을 연속 호출할 수 있어 비용과 지연이 불필요하게 증가했다.
2. 초기 업로드는 브라우저에서 API 키를 사용해 공급자에게 직접 전송하는 경로가 중심이었다. 운영 환경의 키 관리와 개인정보 통제가 약했다.
3. 모델 기본값이 최신 정식 모델 체계와 맞지 않았고, 사용 모델·토큰·건당 추정 비용 기록도 없었다.
4. 신뢰도나 점수가 누락되면 높은 기본값을 넣어 실제보다 정확해 보일 수 있었다.
5. Q1~Q5 누락, 이름·날짜·공종·수기 인식 신뢰도 저하를 자동확정 전에 막는 공통 품질 게이트가 없었다.
6. Vercel 함수 제한과 서버 타임아웃 설정이 맞지 않았고, 큰 base64 요청은 4.5MB 본문 제한에 걸릴 수 있었다.
7. 현재 백업에는 OCR 결과는 있으나 사람이 확정한 문자·필드별 정답표가 없어 CER/WER 또는 필드 정확도를 계산할 수 없다.

## 2. 이번에 적용한 비용·정확도 개선

### 적응형 모델 라우팅

- 자동 모드 1차: `gemini-3.5-flash-lite` — 현재 정식 저가 모델
- 자동 모드 2차: 품질 게이트를 통과하지 못한 문서만 `gemini-3.7-flash`
- 고정밀 모드: `gemini-3.7-flash` 우선
- 공급자 호출 상한: 문서당 2회
- Preview Pro는 서버에서 `OCR_ALLOW_PREVIEW_PRO=true`를 명시한 경우에만 예외 폴백으로 허용
- 기본 건당 추정비용 상한: USD 0.05, `OCR_MAX_USD_PER_DOCUMENT`로 조정
- 각 모델 시도는 먼저 Gemini `countTokens`를 호출해 이미지/PDF와 프롬프트를 포함한 실제 입력 토큰을 확인한다. 토큰 계산이 실패하거나 0이면 생성 호출을 fail-closed 방식으로 중단한다.
- 생성 출력은 `maxOutputTokens=3,072`로 제한하고, 비용 가드에서는 보이는 JSON 3,072토큰과 동적 thinking 3,072토큰을 합친 최악의 6,144 출력 토큰을 보수적으로 예약한다.
- 이미 사용한 비용과 다음 모델의 최악 비용을 합산한 값이 USD 0.05를 넘으면 정밀 승격을 포함한 해당 생성 호출을 실행하지 않는다.
- Gemini 인증정보는 URL 쿼리 문자열에 넣지 않고 `countTokens`와 `generateContent` 모두 `x-goog-api-key` 헤더로 전달한다.
- Gemini 3 계열의 불필요한 샘플링 설정을 제거하고, 저가 모델은 최소 사고 수준, 정밀 모델은 낮은 사고 수준을 사용한다.

### 품질 게이트

자동확정은 다음 조건을 모두 평가한 종합 점수 0.86 이상일 때만 허용한다.

- OCR 전체 신뢰도: 가중치 50%
- 이름·공종·날짜·국적·수기 인식 핵심 필드의 최저 신뢰도: 가중치 30%, 필드 기준 0.82
- Q1~Q5 중 최소 4개 답변 확보: 가중치 20%

누락 신뢰도는 0으로 처리한다. 이름·공종·날짜·국적 중 빈값이나 `미상`, `미분류`, `식별 대기` 같은 자리표시자가 있으면 모델의 숫자 신뢰도가 높아도 자동확정하지 않는다.

모델의 `isPsiForm` 자기판정만 믿지 않는다. `PSI`, `NEW-PSI`, `PSI-RA-01` 제목·양식번호 증거와 Q1~Q5 문항 구조를 결정론적으로 다시 확인한다. 저가 모델이 PSI 문서를 잘못 부정했더라도 제목과 Q1~Q5 증거가 충분하면 정밀 모델로 한 번 재확인하고, 증거가 부족한 일반 문서는 비용을 더 쓰지 않는다.

여러 모델 결과가 생기면 단순 품질점수 최대값이 아니라 다음 순서로 안전한 후보를 선택한다.

1. 제목·양식번호와 Q1~Q5 구조가 검증된 PSI 후보
2. 관리자 검수가 필요 없는 후보
3. 품질 미달 사유가 더 적은 후보
4. Q1~Q5 답변 수가 더 많은 후보
5. 핵심 필드 최저 신뢰도가 더 높은 후보
6. 위 조건이 같을 때만 종합 품질점수가 높은 후보

이 순서로 정밀 모델의 `isPsiForm=false` 오판이 구조적으로 검증된 PSI 1차 결과를 덮어써 정상 문서를 폐기하는 상황도 막는다.

낮은 품질은 정밀 모델로 최대 한 번만 승격하고, 그래도 부족하면 관리자 원본 검수로 보낸다.

### 비용·운영 추적

OCR 기록과 검증 패키지에 다음 값을 남긴다.

- 실제 사용 모델과 시도 모델 목록
- 정밀 모델 승격 및 비용 상한 차단 여부
- 입력·출력·사고 토큰
- 공식 단가 기준 건당 추정 비용
- 품질 점수와 미달 사유
- 호출 횟수, 지연 시간, 최종 오류 코드

### 보안·전송 안정성

- OCR 원본은 운영·개발 환경 모두 서버 게이트웨이로만 전송하며, 토큰·비용가드를 우회하는 브라우저 직접 폴백은 사용하지 않는다. 설정 화면의 로컬 무료/유료 키는 브라우저 보조기능용임을 명시하고 서버 OCR 키와 분리했다.
- 신규 파일과 저장된 base64 원본에 동일한 전처리 정책을 적용한다. base64 헤더만 신뢰하지 않고 실제 매직바이트로 PDF/JPEG/PNG/GIF/WebP/HEIC/HEIF/BMP 형식을 다시 판별한다.
- 클라이언트는 이미지를 긴 변 3,508px 이내, 약 2.85MB 원본 목표로 축소한다. BMP는 투명 배경을 흰색으로 합성해 고품질 JPEG로 변환하고, HEIC/HEIF는 브라우저 디코더가 없더라도 안전 크기 안이면 공급자의 직접 지원 경로로 보낸다.
- 서버도 base64 무결성, 실제 바이트 크기 3MB 이하, 매직바이트 형식, HEIC/HEIF 브랜드를 다시 검사한다. BMP가 서버까지 그대로 도착하면 JPEG 변환 누락으로 차단한다.
- PDF는 클라이언트와 서버 양쪽에서 단일 페이지만 허용한다. 용량 또는 페이지 수가 한도를 넘으면 무리하게 변환하지 않고 페이지 분리·압축 안내를 제공한다.
- 관리자 세션 만료 또는 권한 오류(`HTTP_401`, `HTTP_403`, `OCR_UPSTREAM_AUTH`, 서버 키 누락)는 브라우저 OCR로 우회하지 않는다. 재분석은 요청 전 기록한 `IN_PROGRESS`를 원래 상태로 복구하고, 신규 업로드는 실패 레코드를 생성하지 않은 채 현재 파일부터 목록에 남긴 후 배치를 즉시 중단한다.
- Vercel 함수 실행 상한을 실제 OCR 체인에 맞게 60초로 조정했다.

## 3. 공식 단가와 후보군 판단

| 후보 | 공식 확인 사항 | PSI에서의 판단 |
|---|---|---|
| Gemini 3.5 Flash-Lite | 입력 USD 0.30/백만 토큰, 출력 USD 2.50/백만 토큰 | 구조화 추출 1차 가성비 모델 |
| Gemini 3.7 Flash | 2026-12-31까지 입력 USD 0.75/백만, 출력·사고 USD 3.75/백만 토큰 | 품질 미달 문서용 정밀 모델 |
| Google Document AI Enterprise OCR | 월 1,000페이지 무료 후 일반 OCR USD 1.50/1,000페이지 | 고정 문서 OCR A/B 후보, 기울기·품질·레이아웃 기능 강점 |
| Azure Document Intelligence Read | 한국어 인쇄·수기 지원, 한국 중부 리전 지원 | 데이터 거주성과 한국어 수기 OCR A/B 후보 |
| NAVER CLOVA OCR | 한국어 수기와 문서 OCR 제품군 | 국내 문서용 챌린저 후보, 실제 PSI 표본 견적 필요 |
| AWS Textract | 공식 FAQ의 수기 지원이 표준 영문 알파벳 중심 | 다국어 PSI 수기 기본 후보에서 제외 |

LLM 토큰 비용과 페이지형 전문 OCR 비용은 과금 단위가 달라 표의 숫자만으로 승자를 정할 수 없다. 문서당 실제 토큰, 재시도율, 수동 검수 시간을 합친 총비용으로 비교해야 한다.

## 4. "최고"를 객관적으로 확정하기 위한 벤치마크

현재 백업 579건 중 이미지가 있는 기록은 472건이지만 정답 라벨이 없다. 다음 조건의 300~500페이지 정답 세트를 먼저 구축한다.

- 한국어와 주요 근로자 모국어, 서로 다른 필체
- 정상 촬영, 회전, 그림자, 흐림, 저조도, 구김
- 기존 양식과 변경 양식
- 안전·개인정보를 제거하거나 적법하게 비식별 처리한 원본
- 이름, 날짜, 공종, Q1~Q5, 전체 수기 원문, 최종 안전점수의 사람 확정 정답

동일 문서를 Gemini 적응형 경로, Azure Read, Google Document AI, CLOVA OCR에 보내 다음을 측정한다.

1. 문자 오류율(CER)과 단어 오류율(WER)
2. 이름·날짜·공종·Q1~Q5 필드 완전일치율
3. 수기 답변 의미 보존율과 번역 검수 통과율
4. 자동확정 정밀도, 수동 검수 전환율, 치명적 오판율
5. 페이지당 API 비용, 재시도 포함 총비용, 관리자 검수 시간 비용
6. P50/P95 지연, 429·5xx·파싱 실패율

권장 선발 규칙은 `치명적 오판 0건`을 우선 제약으로 두고, 필드 완전일치율이 동률 범위일 때 월 총비용이 가장 낮은 경로를 선택하는 것이다. 정답 세트 결과 없이 특정 공급자를 "최고 정확도"로 단정하지 않는다.

## 5. 운영 권장 설정

- 필수 서버 변수: `GEMINI_API_KEY`
- 선택 변수: `OCR_MAX_USD_PER_DOCUMENT=0.05`
- 예외 검증용: `OCR_ALLOW_PREVIEW_PRO=false`
- 기본 엔진: 자동(저가 우선, 품질 미달만 정밀 승격)
- 비용 가드: 모든 `generateContent` 전에 `countTokens` 성공과 문서당 최악 비용 상한 통과가 필수
- 자동확정 핵심값: 이름·공종·날짜·국적·수기 답변과 PSI 제목/Q1~Q5 결정론적 증거
- 정기 점검: 월별 품질 점수, 정밀 승격률, 건당 비용, 수동 검수율을 함께 비교
- 전문 OCR 공급자 도입 전: 데이터 처리지역, 보존정책, 개인정보 처리계약을 먼저 검토

## 6. 공식 근거

- Gemini API 가격: <https://ai.google.dev/gemini-api/docs/pricing>
- Gemini 최신 모델·마이그레이션: <https://ai.google.dev/gemini-api/docs/latest-model>
- Gemini 3.7 Flash: <https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash>
- Gemini 사고 설정: <https://ai.google.dev/gemini-api/docs/generate-content/thinking>
- 이미지 해상도와 토큰: <https://ai.google.dev/gemini-api/docs/media-resolution>
- 구조화 출력: <https://ai.google.dev/gemini-api/docs/structured-output>
- Google Document AI 가격: <https://cloud.google.com/products/document-ai/pricing>
- Google Enterprise Document OCR: <https://docs.cloud.google.com/document-ai/docs/enterprise-document-ocr>
- Azure OCR 개요: <https://learn.microsoft.com/azure/ai-services/computer-vision/overview-ocr>
- Azure OCR 언어 지원: <https://learn.microsoft.com/azure/ai-services/document-intelligence/language-support/ocr?view=doc-intel-4.0.0>
- Azure Document Intelligence 가격: <https://azure.microsoft.com/pricing/details/document-intelligence/>
- AWS Textract FAQ: <https://aws.amazon.com/textract/faqs/>
- Vercel 함수 제한: <https://vercel.com/docs/functions/limitations>
