const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcePath = path.join(root, 'pages', 'OcrAnalysis.tsx');
const packagePath = path.join(root, 'package.json');

const source = fs.readFileSync(sourcePath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const requiredMarkers = [
  'handleExportOcrVerificationPackage',
  'NEW-PSI OCR verification package',
  'OCR 검증 패키지 저장',
  '정상/API 한도/양식 판독',
  'Q1~Q5 추출 상태',
  'questionCoverage',
  'scoreDiagnostics',
  'scoreReasoningPreview',
  'scoreBreakdown',
  'SCORE_ZERO_WITH_COMPLETE_ANSWERS',
  'OPERATIONAL_SCORE_EXCLUDED',
  'resultBuckets',
  'failureCodes',
  '원본 이미지는 포함하지 않았습니다',
  'records[].trace',
];

const missing = requiredMarkers.filter((marker) => !source.includes(marker));
const scriptValue = packageJson.scripts?.['check:ocr-verification-package'];
const verifyFast = packageJson.scripts?.['verify:fast'] || '';

if (!scriptValue || !scriptValue.includes('check-ocr-verification-package-contract.cjs')) {
  missing.push('package.json script check:ocr-verification-package');
}

if (!verifyFast.includes('check:ocr-verification-package')) {
  missing.push('verify:fast includes check:ocr-verification-package');
}

if (missing.length > 0) {
  console.error('[check-ocr-verification-package-contract] FAIL');
  missing.forEach((marker) => console.error(`- missing: ${marker}`));
  process.exit(1);
}

console.log('[check-ocr-verification-package-contract] PASS');
console.log('- OCR verification package export is available with privacy-safe diagnostics and Q1-Q5 coverage.');
