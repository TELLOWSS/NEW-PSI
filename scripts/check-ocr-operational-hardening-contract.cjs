const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = {
  packageJson: path.join(root, 'package.json'),
  ocrPage: path.join(root, 'pages', 'OcrAnalysis.tsx'),
  geminiService: path.join(root, 'services', 'geminiService.ts'),
  gateway: path.join(root, 'api', 'gateway.ts'),
  normalization: path.join(root, 'utils', 'ocrRecordNormalization.ts'),
  workerIdentity: path.join(root, 'utils', 'workerIdentity.ts'),
  gatewayPayload: path.join(root, 'utils', 'ocrGatewayPayload.ts'),
  filePolicy: path.join(root, 'utils', 'ocrFilePolicy.ts'),
  ocrPolicy: path.join(root, 'config', 'ocrPolicy.ts'),
  gatewayClient: path.join(root, 'services', 'ocrGatewayService.ts'),
  harnessValidation: path.join(root, 'lib', 'server', 'harness', 'inputValidators.ts'),
  harnessRouter: path.join(root, 'lib', 'server', 'harness', 'router.ts'),
};

const sources = Object.fromEntries(
  Object.entries(files).map(([key, filePath]) => [key, fs.readFileSync(filePath, 'utf8')]),
);
const packageJson = JSON.parse(sources.packageJson);

const requiredMarkers = [
  ['ocrPage', 'MAX_FREE_OCR_BATCH_RECORDS = 10'],
  ['ocrPage', 'FREE_MODE_QUOTA_ABORT_THRESHOLD = 1'],
  ['ocrPage', 'PAID_MODE_QUOTA_ABORT_THRESHOLD = 3'],
  ['ocrPage', '비용절약 보호로 이번 실행 제외'],
  ['ocrPage', 'quotaProtectionLabel'],
  ['ocrPage', 'isOperationalScoreRecord'],
  ['ocrPage', 'isScoreRevalidationNeeded'],
  ['ocrPage', 'getOperationalSafetyScore'],
  ['ocrPage', 'SCORE_ZERO_WITH_COMPLETE_ANSWERS'],
  ['ocrPage', '신호 집계 제외'],
  ['ocrPage', 'handleNormalizeCurrentOcrMetadata'],
  ['ocrPage', '날짜·공종 표준화'],
  ['ocrPage', 'operationalSafetyScore'],
  ['ocrPage', 'requiresManualReview: quality.requiresManualReview'],
  ['ocrPage', 'Harness 완료 응답보다 OCR 관리자 검수 상태를 우선 보존했습니다.'],
  ['geminiService', 'normalizeOcrRecordMetadata<WorkerRecord>'],
  ['gateway', 'normalizeOcrRecordMetadata({'],
  ['normalization', 'export const normalizeOcrRecordMetadata'],
  ['normalization', '문서 본문 날짜 기준 보정'],
  ['normalization', '문항 답변으로 보이는 공종값 격리'],
  ['normalization', 'isFailureOnlyRecord'],
  ['workerIdentity', '시스템동바리'],
  ['workerIdentity', '유도원'],
  ['workerIdentity', '콘크리트'],
  ['workerIdentity', '안전시설'],
  ['gatewayPayload', 'prepareOcrSourceForGateway'],
  ['filePolicy', "'image/heif'"],
  ['ocrPolicy', 'allowClientFallbackInProduction: false'],
  ['gatewayClient', '`HTTP_${response.status}`'],
  ['harnessValidation', 'OCR_QUALITY_GATE_REVIEW'],
  ['harnessRouter', "workflowState === 'manual_review_required'"],
];

// 문구 전체가 아니라 안전 경계의 구조를 확인해 사소한 UI 카피 변경에는 깨지지 않게 한다.
const requiredPatterns = [
  ['gatewayPayload', /OCR_GATEWAY_MAX_LONG_EDGE\s*=\s*3_508/, 'A4 300-DPI 기준 긴 변 3,508px'],
  ['gatewayPayload', /OCR_GATEWAY_MAX_PDF_PAGES\s*=\s*1/, '클라이언트 단일페이지 PDF 제한'],
  ['gatewayPayload', /requiresConversion\s*=\s*mimeType\s*===\s*['"]image\/bmp['"]/, 'BMP→JPEG 변환 분기'],
  ['gatewayPayload', /new File\(\[blob\],[\s\S]{0,180}type:\s*['"]image\/jpeg['"]/, '변환 결과 JPEG 고정'],
  ['gatewayPayload', /isDirectlySupportedOcrMimeType[\s\S]{0,240}HEIC\/HEIF/, 'HEIC/HEIF 직접 지원 폴백'],
  ['gatewayPayload', /detectOcrSourceMimeType[\s\S]{0,900}(?:매직|bytes|ascii)/, 'base64 실제 바이트 형식 검사'],
  ['gateway', /OCR_RETRY_MAX_IMAGE_BYTES\s*=\s*3\s*\*\s*1024\s*\*\s*1024/, '서버 3MB 원본 제한'],
  ['gateway', /assertSinglePagePdfPayload\(normalizedBase64\)/, '서버 단일페이지 PDF 재검사'],
  ['gateway', /BMP는 브라우저에서 JPEG로 변환/, '서버 BMP 변환 누락 차단'],
  ['ocrPage', /브라우저 직접 호출은 countTokens\/건당비용 가드를 우회[\s\S]{0,120}throw serverError/, '개발환경 포함 브라우저 OCR 폴백 차단'],
  ['ocrPage', /if \(isExpiredAdminSession\) \{[\s\S]{0,900}stopRef\.current\s*=\s*true[\s\S]{0,400}break/, '인증만료 즉시 일괄중단'],
  ['ocrPage', /await persistRecordUpdate\(record\);[\s\S]{0,900}분석 전 상태로 복구/, '재분석 인증만료 시 IN_PROGRESS 원상복구'],
  ['ocrPage', /수동 중단·예외가 최종 저장 전에 발생하면 IN_PROGRESS를 남기지 않는다[\s\S]{0,900}nextIndex:\s*Math\.min\(currentRecordCompleted\s*\?\s*i\s*\+\s*1\s*:\s*i/, '미완료 기록 원상복구 및 현재 인덱스 재개'],
  ['ocrPage', /실패 레코드는 만들지 않고 현재 파일부터 선택 목록에 남겨[\s\S]{0,420}실패 기록은 생성하지 않았습니다/, '신규 업로드 인증만료 시 무오염 중단'],
];

const missing = requiredMarkers
  .filter(([sourceKey, marker]) => !sources[sourceKey].includes(marker))
  .map(([sourceKey, marker]) => `${sourceKey}: ${marker}`);

for (const [sourceKey, pattern, label] of requiredPatterns) {
  if (!pattern.test(sources[sourceKey])) {
    missing.push(`${sourceKey}: ${label}`);
  }
}

if (/analyzeWorkerRiskAssessment\s*\(/.test(sources.ocrPage)) {
  missing.push('ocrPage: 서버 비용가드를 우회하는 브라우저 OCR 호출 금지');
}

const scriptValue = packageJson.scripts?.['check:ocr-operational-hardening'];
const verifyFast = packageJson.scripts?.['verify:fast'] || '';

if (!scriptValue || !scriptValue.includes('check-ocr-operational-hardening-contract.cjs')) {
  missing.push('package.json script check:ocr-operational-hardening');
}

if (!verifyFast.includes('check:ocr-operational-hardening')) {
  missing.push('verify:fast includes check:ocr-operational-hardening');
}

if (missing.length > 0) {
  console.error('[check-ocr-operational-hardening-contract] FAIL');
  missing.forEach((marker) => console.error(`- missing: ${marker}`));
  process.exit(1);
}

console.log('[check-ocr-operational-hardening-contract] PASS');
console.log('- OCR batch protection, client/server payload validation, auth-expiry no-contamination stop, manual-review state preservation, and metadata normalization are protected.');
