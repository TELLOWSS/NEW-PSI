const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcePath = path.join(root, 'pages', 'OcrAnalysis.tsx');
const packagePath = path.join(root, 'package.json');

const source = fs.readFileSync(sourcePath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const requiredMarkers = [
  'useDeferredValue',
  'LARGE_RECORD_MONTH_FIRST_THRESHOLD',
  'buildOcrRecordMonthIndex',
  'OcrRecordMonthIndex',
  'sourceRecordMonthIndex',
  'monthlyWorkingSetLabel',
  'activeMonthStats',
  'data-ocr-record-view="month-index"',
  'data-ocr-record-view="monthly-working-set"',
  '최신월 작업세트로',
  '전체 월 수동 보기',
];

const missing = requiredMarkers.filter((marker) => !source.includes(marker));
const scriptValue = packageJson.scripts?.['check:ocr-scale-view'];
const verifyFast = packageJson.scripts?.['verify:fast'] || '';

if (!scriptValue || !scriptValue.includes('check-ocr-scale-view-contract.cjs')) {
  missing.push('package.json script check:ocr-scale-view');
}

if (!verifyFast.includes('check:ocr-scale-view')) {
  missing.push('verify:fast includes check:ocr-scale-view');
}

if (missing.length > 0) {
  console.error('[check-ocr-scale-view-contract] FAIL');
  missing.forEach((marker) => console.error(`- missing: ${marker}`));
  process.exit(1);
}

console.log('[check-ocr-scale-view-contract] PASS');
console.log('- OCR record view has monthly index, month-first large-data mode, and deferred search.');
