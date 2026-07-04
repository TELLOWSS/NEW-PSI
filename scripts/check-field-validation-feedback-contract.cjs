const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = {
  packageJson: path.join(root, 'package.json'),
  template: path.join(root, 'templates', 'psi_field_validation_before_after_2026-07-04.csv'),
  generator: path.join(root, 'scripts', 'generate-field-validation-feedback-report.cjs'),
  productDoc: path.join(root, 'docs', 'PSI_상품설명서_브랜드스토리_2026-07-04.md'),
};

const missingFiles = Object.entries(files)
  .filter(([, filePath]) => !fs.existsSync(filePath))
  .map(([key, filePath]) => `${key}: ${filePath}`);

if (missingFiles.length > 0) {
  console.error('[check-field-validation-feedback-contract] FAIL');
  missingFiles.forEach((marker) => console.error(`- missing file: ${marker}`));
  process.exit(1);
}

const sources = Object.fromEntries(
  Object.entries(files).map(([key, filePath]) => [key, fs.readFileSync(filePath, 'utf8')]),
);
const packageJson = JSON.parse(sources.packageJson);

const requiredMarkers = [
  ['template', 'beforeScore'],
  ['template', 'afterScore'],
  ['template', 'beforeNativeGuidanceStatus'],
  ['template', 'afterNativeGuidanceStatus'],
  ['template', 'beforeCompetencyWeightedScore'],
  ['template', 'afterCompetencyWeightedScore'],
  ['template', 'beforeApprovalReadiness'],
  ['template', 'afterApprovalReadiness'],
  ['generator', 'field-validation-feedback-report.md'],
  ['generator', 'field-validation-feedback-report.json'],
  ['generator', 'averageCompetencyDelta'],
  ['generator', 'nativeGuidanceImproved'],
  ['productDoc', 'templates/psi_field_validation_before_after_2026-07-04.csv'],
  ['productDoc', 'npm run report:field-validation-feedback'],
];

const missingMarkers = requiredMarkers
  .filter(([sourceKey, marker]) => !sources[sourceKey].includes(marker))
  .map(([sourceKey, marker]) => `${sourceKey}: ${marker}`);

const missing = [...missingMarkers];
const reportScript = packageJson.scripts?.['report:field-validation-feedback'];
const checkScript = packageJson.scripts?.['check:field-validation-feedback'];
const verifyFast = packageJson.scripts?.['verify:fast'] || '';

if (!reportScript || !reportScript.includes('generate-field-validation-feedback-report.cjs')) {
  missing.push('package.json script report:field-validation-feedback');
}

if (!checkScript || !checkScript.includes('check-field-validation-feedback-contract.cjs')) {
  missing.push('package.json script check:field-validation-feedback');
}

if (!verifyFast.includes('check:field-validation-feedback')) {
  missing.push('verify:fast includes check:field-validation-feedback');
}

if (missing.length > 0) {
  console.error('[check-field-validation-feedback-contract] FAIL');
  missing.forEach((marker) => console.error(`- missing: ${marker}`));
  process.exit(1);
}

console.log('[check-field-validation-feedback-contract] PASS');
console.log('- Field validation before/after data can be captured as CSV and converted into Markdown/JSON feedback reports.');
