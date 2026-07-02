const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourcePath = path.join(root, 'pages', 'OcrAnalysis.tsx');
const packagePath = path.join(root, 'package.json');

const source = fs.readFileSync(sourcePath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const requiredMarkers = [
  'data-mobile-proof="field-mode"',
  'data-mobile-proof="proof-line"',
  'data-mobile-proof="metric-total-records"',
  'data-mobile-proof="metric-tracked-workers"',
  'data-mobile-proof="metric-review-required"',
  'data-mobile-proof="metric-protection"',
  'data-mobile-proof="action-scan"',
  'data-mobile-proof="action-report"',
  'data-mobile-proof="action-tracking"',
  'data-mobile-proof="action-evidence-export"',
  'data-mobile-proof="tracking-summary"',
  'data-mobile-proof="sticky-actions"',
  'handleOpenMobileCapture',
  'handleOpenMobilePriorityReport',
  'handleOpenMobileTrackingReview',
  'mobileProofSnapshot',
  'mobilePriorityReportRecord',
  'newOcrCaptureSectionRef',
  'workerTrackingSectionRef',
];

const missing = requiredMarkers.filter((marker) => !source.includes(marker));
const scriptValue = packageJson.scripts?.['check:mobile-field-mode'];

if (!scriptValue || !scriptValue.includes('check-mobile-field-mode-contract.cjs')) {
  missing.push('package.json script check:mobile-field-mode');
}

if (missing.length > 0) {
  console.error('[check-mobile-field-mode-contract] FAIL');
  missing.forEach((marker) => console.error(`- missing: ${marker}`));
  process.exit(1);
}

console.log('[check-mobile-field-mode-contract] PASS');
console.log('- field mode proof panel, mobile actions, tracking anchor, and sticky actions are present.');
