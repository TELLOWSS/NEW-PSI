const fs = require('node:fs');
const path = require('node:path');

const baseDir = path.join(process.cwd(), 'artifacts', 'mobile-qa', '2026-05-04');
const reportPath = path.join(process.cwd(), 'reports', 'mobile-qa-evidence-status.md');
const shouldWriteReport = process.argv.includes('--write-report');
const files = [
  '320-nav.png', '320-dashboard.png', '320-ocr.png', '320-predictive.png',
  '360-nav.png', '360-dashboard.png', '360-ocr.png', '360-predictive.png',
  '375-nav.png', '375-dashboard.png', '375-ocr.png', '375-predictive.png',
  '390-nav.png', '390-dashboard.png', '390-ocr.png', '390-predictive.png',
];

const rows = files.map((file) => {
  const fullPath = path.join(baseDir, file);
  const exists = fs.existsSync(fullPath);
  return { file, exists };
});

const existing = rows.filter((row) => row.exists).length;
const missing = rows.length - existing;
const nowIso = new Date().toISOString();

console.log('\n[MOBILE-QA] Evidence Check (2026-05-04)');
console.log(`[MOBILE-QA] Base: ${baseDir}`);
console.log('----------------------------------------');

for (const row of rows) {
  console.log(`${row.exists ? 'OK ' : 'MISS'}  ${row.file}`);
}

console.log('----------------------------------------');
console.log(`[MOBILE-QA] TOTAL_EXISTING=${existing}`);
console.log(`[MOBILE-QA] TOTAL_MISSING=${missing}`);

if (shouldWriteReport) {
  const missingRows = rows.filter((row) => !row.exists);
  const status = missing === 0 ? 'READY_FOR_FINALIZATION' : 'NOT_READY';
  const report = [
    '# MOBILE QA EVIDENCE STATUS',
    '',
    `- generatedAt: ${nowIso}`,
    `- baseDir: ${baseDir}`,
    `- totalExisting: ${existing}`,
    `- totalMissing: ${missing}`,
    `- status: ${status}`,
    '',
    '## Missing Files',
    ...(
      missingRows.length > 0
        ? missingRows.map((row) => `- ${row.file}`)
        : ['- none']
    ),
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`[MOBILE-QA] REPORT_WRITTEN=${reportPath}`);
}

if (missing > 0) {
  console.log('[MOBILE-QA] RESULT=NOT_READY');
  process.exitCode = 1;
} else {
  console.log('[MOBILE-QA] RESULT=READY_FOR_FINALIZATION');
}
