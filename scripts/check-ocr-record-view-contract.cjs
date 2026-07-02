const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcePath = path.join(root, 'pages', 'OcrAnalysis.tsx');
const packagePath = path.join(root, 'package.json');

const source = fs.readFileSync(sourcePath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const requiredMarkers = [
  'isOcrAnalyzedRecord',
  'recordScopeFilter',
  'recordMonthFilter',
  'recordMonthOptions',
  'visibleRecordListRecords',
  'hiddenRecordListCount',
  'INITIAL_RECORD_RENDER_LIMIT',
  'RECORD_RENDER_INCREMENT',
  'data-ocr-record-view="scope-month-filter"',
  'data-ocr-record-view={`scope-${value}`}',
  'data-ocr-record-view="month-tabs"',
  'data-ocr-record-view="load-more"',
  'OCR 분석만',
  '월별 분류',
];

const missing = requiredMarkers.filter((marker) => !source.includes(marker));
const scriptValue = packageJson.scripts?.['check:ocr-record-view'];

if (!scriptValue || !scriptValue.includes('check-ocr-record-view-contract.cjs')) {
  missing.push('package.json script check:ocr-record-view');
}

if (missing.length > 0) {
  console.error('[check-ocr-record-view-contract] FAIL');
  missing.forEach((marker) => console.error(`- missing: ${marker}`));
  process.exit(1);
}

console.log('[check-ocr-record-view-contract] PASS');
console.log('- OCR-only scope, monthly tabs, and progressive row rendering are present.');
