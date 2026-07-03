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
};

const sources = Object.fromEntries(
  Object.entries(files).map(([key, filePath]) => [key, fs.readFileSync(filePath, 'utf8')]),
);
const packageJson = JSON.parse(sources.packageJson);

const requiredMarkers = [
  ['ocrPage', 'MAX_FREE_OCR_BATCH_RECORDS = 10'],
  ['ocrPage', 'FREE_MODE_QUOTA_ABORT_THRESHOLD = 1'],
  ['ocrPage', 'PAID_MODE_QUOTA_ABORT_THRESHOLD = 3'],
  ['ocrPage', '무료 모드 보호로 이번 실행 제외'],
  ['ocrPage', 'quotaProtectionLabel'],
  ['ocrPage', 'isOperationalScoreRecord'],
  ['ocrPage', 'getOperationalSafetyScore'],
  ['ocrPage', '점수 집계 제외'],
  ['ocrPage', 'handleNormalizeCurrentOcrMetadata'],
  ['ocrPage', '날짜·공종 표준화'],
  ['ocrPage', 'operationalSafetyScore'],
  ['geminiService', 'normalizeOcrRecordMetadata<WorkerRecord>'],
  ['gateway', 'normalizeOcrRecordMetadata({'],
  ['normalization', 'export const normalizeOcrRecordMetadata'],
  ['normalization', '문서 본문 날짜 기준 보정'],
  ['normalization', '본문 위험요인 기준 공종 보정'],
  ['normalization', 'isFailureOnlyRecord'],
  ['workerIdentity', '시스템동바리'],
  ['workerIdentity', '유도원'],
  ['workerIdentity', '콘크리트'],
  ['workerIdentity', '안전시설'],
];

const missing = requiredMarkers
  .filter(([sourceKey, marker]) => !sources[sourceKey].includes(marker))
  .map(([sourceKey, marker]) => `${sourceKey}: ${marker}`);

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
console.log('- OCR batch protection, failure score isolation, and date/job post-processing are protected.');
