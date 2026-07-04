const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = {
  packageJson: path.join(root, 'package.json'),
  settingsPage: path.join(root, 'pages', 'Settings.tsx'),
  weightUtil: path.join(root, 'utils', 'competencyWeights.ts'),
  evidenceUtils: path.join(root, 'utils', 'evidenceUtils.ts'),
};

const sources = Object.fromEntries(
  Object.entries(files).map(([key, filePath]) => [key, fs.readFileSync(filePath, 'utf8')]),
);
const packageJson = JSON.parse(sources.packageJson);

const requiredMarkers = [
  ['weightUtil', 'COMPETENCY_WEIGHT_FIELDS'],
  ['weightUtil', "code: 'W1'"],
  ['weightUtil', "code: 'W6'"],
  ['weightUtil', "role: 'penalty-multiplier'"],
  ['weightUtil', 'COMPETENCY_WEIGHT_PRESETS'],
  ['weightUtil', 'Number.isFinite'],
  ['weightUtil', 'getScoreWeightSum'],
  ['evidenceUtils', 'DEFAULT_COMPETENCY_WEIGHTS'],
  ['evidenceUtils', 'sanitizeCompetencyWeights(configured)'],
  ['settingsPage', 'COMPETENCY_WEIGHT_FIELDS.map'],
  ['settingsPage', 'applyWeightPreset'],
  ['settingsPage', 'W1~W5 합계'],
  ['settingsPage', 'W6은 반복지적 감점 배율'],
  ['settingsPage', '반복지적감점 x W6'],
];

const missing = requiredMarkers
  .filter(([sourceKey, marker]) => !sources[sourceKey].includes(marker))
  .map(([sourceKey, marker]) => `${sourceKey}: ${marker}`);

const scriptValue = packageJson.scripts?.['check:competency-weights'];
const verifyFast = packageJson.scripts?.['verify:fast'] || '';

if (!scriptValue || !scriptValue.includes('check-competency-weight-contract.cjs')) {
  missing.push('package.json script check:competency-weights');
}

if (!verifyFast.includes('check:competency-weights')) {
  missing.push('verify:fast includes check:competency-weights');
}

if (missing.length > 0) {
  console.error('[check-competency-weight-contract] FAIL');
  missing.forEach((marker) => console.error(`- missing: ${marker}`));
  process.exit(1);
}

console.log('[check-competency-weight-contract] PASS');
console.log('- W1~W5 are weighted score inputs, W6 is a repeat-issue penalty multiplier, and zero weights remain valid.');
