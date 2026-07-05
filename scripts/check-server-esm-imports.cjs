const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = {
  packageJson: path.join(root, 'package.json'),
  gateway: path.join(root, 'api', 'gateway.ts'),
  ocrVerificationLanguageUtils: path.join(root, 'utils', 'ocrVerificationLanguageUtils.ts'),
};

const sources = Object.fromEntries(
  Object.entries(files).map(([key, filePath]) => [key, fs.readFileSync(filePath, 'utf8')]),
);
const packageJson = JSON.parse(sources.packageJson);

const requiredMarkers = [
  ['gateway', "../utils/ocrVerificationLanguageUtils.js"],
  ['ocrVerificationLanguageUtils', "./reportLanguagePolicy.js"],
];

const missing = requiredMarkers
  .filter(([sourceKey, marker]) => !sources[sourceKey].includes(marker))
  .map(([sourceKey, marker]) => `${sourceKey}: ${marker}`);

const scriptValue = packageJson.scripts?.['check:server-esm-imports'];
const verifyFast = packageJson.scripts?.['verify:fast'] || '';

if (!scriptValue || !scriptValue.includes('check-server-esm-imports.cjs')) {
  missing.push('package.json script check:server-esm-imports');
}

if (!verifyFast.includes('check:server-esm-imports')) {
  missing.push('verify:fast includes check:server-esm-imports');
}

if (missing.length > 0) {
  console.error('[check-server-esm-imports] FAIL');
  missing.forEach((marker) => console.error(`- missing: ${marker}`));
  process.exit(1);
}

console.log('[check-server-esm-imports] PASS');
console.log('- Server-side ESM imports used by /api/gateway keep explicit .js extensions.');
