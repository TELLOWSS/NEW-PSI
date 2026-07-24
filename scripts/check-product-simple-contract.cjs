const fs = require('fs');
const path = require('path');

const root = process.cwd();
const introPath = path.join(root, 'pages', 'Introduction.tsx');
const packagePath = path.join(root, 'package.json');

const intro = fs.readFileSync(introPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const required = [
  ['pages/Introduction.tsx', 'showProductDepth'],
  ['pages/Introduction.tsx', 'data-product-simple="hero"'],
  ['pages/Introduction.tsx', 'data-product-simple="three-step-flow"'],
  ['pages/Introduction.tsx', 'data-product-simple="evidence-cards"'],
  ['pages/Introduction.tsx', 'data-product-simple="detail-toggle"'],
  ['pages/Introduction.tsx', 'data-product-simple="developer-detail"'],
  ['pages/Introduction.tsx', 'data-product-simple="developer-detail-board"'],
  ['pages/Introduction.tsx', 'PSI 운영 가치'],
  ['pages/Introduction.tsx', '기록에서 조치와 교육까지 이어지는 한 흐름'],
  ['pages/Introduction.tsx', '운영 흐름 빠른 체험'],
  ['pages/Introduction.tsx', 'isDeveloperExperience && showProductDepth'],
  ['pages/Introduction.tsx', '1. 기록지 넣기'],
  ['pages/Introduction.tsx', '2. 분석·검증'],
  ['pages/Introduction.tsx', '3. 리포트·추적'],
];

const missing = [];

for (const [file, marker] of required) {
  if (!intro.includes(marker)) {
    missing.push(`${file}: ${marker}`);
  }
}

const detailGateIndex = intro.indexOf('data-product-simple="developer-detail"');
const realMenuIndex = intro.indexOf('실제 프로그램 기능 연결');
if (detailGateIndex < 0 || realMenuIndex < 0 || realMenuIndex < detailGateIndex) {
  missing.push('pages/Introduction.tsx: detailed program menu must stay behind product detail toggle');
}

const boardGateIndex = intro.indexOf('data-product-simple="developer-detail-board"');
const upgradeBoardIndex = intro.indexOf('PROGRAM UPGRADE BOARD');
if (boardGateIndex < 0 || upgradeBoardIndex < 0 || upgradeBoardIndex < boardGateIndex) {
  missing.push('pages/Introduction.tsx: upgrade board must stay behind product detail toggle');
}

const checkScript = packageJson.scripts?.['check:product-simple'] || '';
const verifyFast = packageJson.scripts?.['verify:fast'] || '';

if (!checkScript.includes('check-product-simple-contract.cjs')) {
  missing.push('package.json script check:product-simple');
}

if (!verifyFast.includes('check:product-simple')) {
  missing.push('verify:fast includes check:product-simple');
}

if (missing.length > 0) {
  console.error('[check-product-simple-contract] FAIL');
  missing.forEach((item) => console.error(`- missing: ${item}`));
  process.exit(1);
}

console.log('[check-product-simple-contract] PASS');
console.log('- Product intro defaults to a concise field-value flow; buyer, QA, and internal boards remain developer-only.');
