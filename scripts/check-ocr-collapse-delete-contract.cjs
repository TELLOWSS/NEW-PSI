const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcePath = path.join(root, 'pages', 'OcrAnalysis.tsx');
const packagePath = path.join(root, 'package.json');

const source = fs.readFileSync(sourcePath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const requiredMarkers = [
  'showRecordControlPanel',
  'showWorkerTrackingPanel',
  'showRecordListPanel',
  'handleDeleteSingleRecord',
  'handleDeleteWorkerRecords',
  'data-ocr-collapse-delete="record-hub"',
  'data-ocr-collapse-delete="toggle-controls"',
  'data-ocr-collapse-delete="toggle-tracking"',
  'data-ocr-collapse-delete="toggle-record-list"',
  'data-ocr-collapse-delete="tracking-summary-collapsed"',
  'data-ocr-collapse-delete="record-list-collapsed"',
  'data-ocr-collapse-delete="delete-single-record"',
  'data-ocr-collapse-delete="delete-worker-records"',
  'data-ocr-collapse-delete="delete-focused-worker"',
  '필요한 묶음만 펼쳐서 확인합니다',
  '이 기록 삭제',
  '이 근로자 기록 삭제',
];

const missing = requiredMarkers.filter((marker) => !source.includes(marker));
const scriptValue = packageJson.scripts?.['check:ocr-collapse-delete'];
const verifyFast = packageJson.scripts?.['verify:fast'] || '';

if (!scriptValue || !scriptValue.includes('check-ocr-collapse-delete-contract.cjs')) {
  missing.push('package.json script check:ocr-collapse-delete');
}

if (!verifyFast.includes('check:ocr-collapse-delete')) {
  missing.push('verify:fast includes check:ocr-collapse-delete');
}

if (missing.length > 0) {
  console.error('[check-ocr-collapse-delete-contract] FAIL');
  missing.forEach((marker) => console.error(`- missing: ${marker}`));
  process.exit(1);
}

console.log('[check-ocr-collapse-delete-contract] PASS');
console.log('- OCR analysis has collapsible record sections and visible individual/worker delete actions.');
