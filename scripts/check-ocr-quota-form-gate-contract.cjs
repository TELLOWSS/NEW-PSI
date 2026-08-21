const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = {
  packageJson: path.join(root, 'package.json'),
  ocrPage: path.join(root, 'pages', 'OcrAnalysis.tsx'),
  geminiService: path.join(root, 'services', 'geminiService.ts'),
  gateway: path.join(root, 'api', 'gateway.ts'),
  engineSettings: path.join(root, 'utils', 'aiEngineSettings.ts'),
  routingQuality: path.join(root, 'utils', 'ocrRoutingQuality.ts'),
  documentValidation: path.join(root, 'utils', 'ocrDocumentValidation.ts'),
  ocrPolicy: path.join(root, 'config', 'ocrPolicy.ts'),
};

const sources = Object.fromEntries(
  Object.entries(files).map(([key, filePath]) => [key, fs.readFileSync(filePath, 'utf8')]),
);
const packageJson = JSON.parse(sources.packageJson);

const requiredMarkers = [
  ['engineSettings', 'resolveGeminiOcrModelChain = ('],
  ['engineSettings', 'options?: { isPaidApiMode?: boolean }'],
  ['engineSettings', "id: 'gemini-3.5-flash-lite'"],
  ['engineSettings', "id: 'gemini-3.7-flash'"],
  ['engineSettings', 'estimateGeminiOcrCostUsd'],
  ['engineSettings', 'evaluateGeminiOcrCostGuard'],
  ['geminiService', 'const gatewayResult = await requestServerOcrAnalysis({'],
  ['geminiService', 'evaluateChangedPsiFormCoverage'],
  ['geminiService', '변경 PSI 양식 Q1~Q5 답변 추출 완료'],
  ['geminiService', 'NEW-PSI 양식 또는 PSI-RA-01 양식이 보이면 Q1, Q2, Q3, Q4, Q5'],
  ['gateway', "allowPreviewPro = process.env.OCR_ALLOW_PREVIEW_PRO === 'true'"],
  ['gateway', 'OCR_RETRY_MAX_OUTPUT_TOKENS'],
  ['gateway', 'OCR_RETRY_MAX_BILLABLE_OUTPUT_TOKENS'],
  ['gateway', 'OCR_DEFAULT_MAX_USD_PER_DOCUMENT'],
  ['gateway', 'evaluateGeminiOcrCostGuard({'],
  ['gateway', 'shouldPreferOcrQualityCandidate(candidateQuality, bestQuality)'],
  ['gateway', 'candidateQuality.shouldEscalate'],
  ['gateway', 'evaluateChangedPsiFormCoverage'],
  ['gateway', 'NEW-PSI 양식 또는 PSI-RA-01 양식이면 Q1 위험 작업'],
  ['routingQuality', 'OCR_AUTO_ACCEPTANCE_THRESHOLD = 0.86'],
  ['routingQuality', 'hasCriticalIdentityValues'],
  ['routingQuality', 'assessPsiDocumentEvidence'],
  ['routingQuality', 'shouldPreferOcrQualityCandidate'],
  ['documentValidation', 'assessPsiDocumentEvidence'],
  ['documentValidation', 'hasPsiTitleEvidence'],
  ['documentValidation', 'questionCount'],
  ['documentValidation', 'new[-\\s]?psi'],
  ['documentValidation', 'psi[-\\s]?ra[-\\s]?0?1'],
  ['ocrPolicy', 'maxOutputTokens: 3_072'],
  ['ocrPage', 'getRecordFailureHeadline'],
  ['ocrPage', 'getRecordFailureDisplayLabel'],
  ['ocrPage', 'API 한도 초과로 대기 중입니다.'],
  ['ocrPage', 'requestServerOcrAnalysis'],
  ['ocrPage', 'prepareOcrFileForGateway'],
];

const missing = requiredMarkers
  .filter(([sourceKey, marker]) => !sources[sourceKey].includes(marker))
  .map(([sourceKey, marker]) => `${sourceKey}: ${marker}`);

// 핵심 의미를 구조로 확인해 변수명 주변의 사소한 편집에는 덜 민감하게 유지한다.
const requiredPatterns = [
  ['routingQuality', /criticalValues\s*=\s*\[[\s\S]{0,500}fieldConfidences\.nationality[\s\S]{0,260}fieldConfidences\.handwrittenAnswers/, '국적을 포함한 핵심 필드 최저 신뢰도'],
  ['routingQuality', /hasCriticalIdentityValues[\s\S]{0,700}raw\.nationality[\s\S]{0,900}(?:placeholder|PLACEHOLDER)/i, '국적 빈값·자리표시자 자동확정 차단'],
  ['routingQuality', /candidate\.isVerifiedPsiForm\s*!==\s*current\.isVerifiedPsiForm[\s\S]{0,160}return candidate\.isVerifiedPsiForm/, '정밀 모델 오판보다 구조 검증 PSI 후보 우선'],
  ['documentValidation', /const hasPsiIdentifier[\s\S]{0,1000}const questionCount[\s\S]{0,240}questionCount\s*>=\s*4/, 'PSI 제목·Q1~Q5 결정론적 증거'],
  ['documentValidation', /isSufficient:\s*hasPsiTitleEvidence\s*&&\s*hasQuestionStructure/, 'PSI 문서 증거 fail-closed 결합'],
  ['gateway', /OCR_RETRY_MAX_OUTPUT_TOKENS\s*=\s*3_072/, '생성 출력 3,072토큰 제한'],
  ['gateway', /OCR_RETRY_MAX_BILLABLE_OUTPUT_TOKENS\s*=\s*OCR_RETRY_MAX_OUTPUT_TOKENS\s*\*\s*2/, '보이는 출력과 thinking 보수 예약'],
  ['gateway', /OCR_DEFAULT_MAX_USD_PER_DOCUMENT\s*=\s*0\.05/, '문서당 기본 USD 0.05 상한'],
];

for (const [sourceKey, pattern, label] of requiredPatterns) {
  if (!pattern.test(sources[sourceKey])) {
    missing.push(`${sourceKey}: ${label}`);
  }
}

// analyzeSingleRecord 안의 유일한 생성 지점이 실제 토큰 계산 → 누적비용 가드 뒤에 있는지 확인한다.
const analyzeStart = sources.gateway.indexOf('async function analyzeSingleRecord');
const analyzeEnd = sources.gateway.indexOf('async function handleOcrRetry', analyzeStart);
const analyzeSource = analyzeStart >= 0 && analyzeEnd > analyzeStart
  ? sources.gateway.slice(analyzeStart, analyzeEnd)
  : '';
const countOccurrences = (text, needle) => text.split(needle).length - 1;
const countTokensIndex = analyzeSource.indexOf(':countTokens');
const costGuardIndex = analyzeSource.indexOf('evaluateGeminiOcrCostGuard({');
const generateContentIndex = analyzeSource.indexOf(':generateContent');

if (!analyzeSource) {
  missing.push('gateway: analyzeSingleRecord 비용 가드 검사 범위');
} else {
  if (!(countTokensIndex >= 0 && countTokensIndex < costGuardIndex && costGuardIndex < generateContentIndex)) {
    missing.push('gateway: countTokens → USD 비용 가드 → generateContent 호출 순서');
  }
  if (countOccurrences(analyzeSource, ':generateContent') !== 1) {
    missing.push('gateway: analyzeSingleRecord 생성 호출 지점 단일화');
  }
  if (countOccurrences(analyzeSource, ':countTokens') !== 1) {
    missing.push('gateway: analyzeSingleRecord 실제 입력 토큰 계산 지점 단일화');
  }
  if (countOccurrences(analyzeSource, "'x-goog-api-key': apiKey") < 2) {
    missing.push('gateway: countTokens/generateContent x-goog-api-key 헤더 인증');
  }
  if (analyzeSource.includes('?key=${apiKey}')) {
    missing.push('gateway: URL 쿼리 API 키 금지');
  }
  if (!/maxBillableOutputTokens:\s*OCR_RETRY_MAX_BILLABLE_OUTPUT_TOKENS/.test(analyzeSource)) {
    missing.push('gateway: 누적비용 가드에 6,144 billable 출력 예약 전달');
  }
  if (!/maxOutputTokens:\s*OCR_RETRY_MAX_OUTPUT_TOKENS/.test(analyzeSource)) {
    missing.push('gateway: generateContent 3,072 출력 상한 전달');
  }
}

const scriptValue = packageJson.scripts?.['check:ocr-quota-form-gate'];
const verifyFast = packageJson.scripts?.['verify:fast'] || '';

if (!scriptValue || !scriptValue.includes('check-ocr-quota-form-gate-contract.cjs')) {
  missing.push('package.json script check:ocr-quota-form-gate');
}

if (!verifyFast.includes('check:ocr-quota-form-gate')) {
  missing.push('verify:fast includes check:ocr-quota-form-gate');
}

if (missing.length > 0) {
  console.error('[check-ocr-quota-form-gate-contract] FAIL');
  missing.forEach((marker) => console.error(`- missing: ${marker}`));
  process.exit(1);
}

console.log('[check-ocr-quota-form-gate-contract] PASS');
console.log('- OCR quota labels, deterministic PSI/Q1-Q5 evidence, nationality-aware quality routing, guarded token/cost budget, and safe candidate selection are protected.');
