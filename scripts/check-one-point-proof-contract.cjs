const fs = require('fs');
const path = require('path');

const root = process.cwd();
const introPath = path.join(root, 'pages', 'Introduction.tsx');
const planPath = path.join(root, 'docs', 'PSI_단순화_정확성_상품검증_실행계획_2026-07-07.md');
const packagePath = path.join(root, 'package.json');

const intro = fs.readFileSync(introPath, 'utf8');
const plan = fs.existsSync(planPath) ? fs.readFileSync(planPath, 'utf8') : '';
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const requiredIntroMarkers = [
  'data-one-point-proof="panel"',
  'onePointProofSteps',
  'onePointProofMetrics',
  "marker: 'stage-scan'",
  "marker: 'stage-q1-separation'",
  "marker: 'stage-manager-review'",
  "marker: 'stage-native-feedback'",
  "marker: 'metric-two-minute'",
  "marker: 'metric-one-record'",
  "marker: 'metric-closed-loop'",
  'data-one-point-proof="action-ocr"',
  'data-one-point-proof="action-report"',
  'data-one-point-proof="action-native-guidance"',
  'data-one-point-proof="action-tracking"',
  '공종과 Q1 실제 위험작업',
  '관리자 검증 후 모국어 안내와 개인 안전역량, 월별 추적관리',
];

const requiredPlanMarkers = [
  'P2. 발표용 원포인트 증명 모드',
  '2분 안에 PSI의 가치를 증명',
  '공종과 Q1 실제 위험작업 분리 표시',
  '월별 추적관리 화면으로 연결',
];

const missing = [];

for (const marker of requiredIntroMarkers) {
  if (!intro.includes(marker)) missing.push(`Introduction.tsx: ${marker}`);
}

for (const marker of requiredPlanMarkers) {
  if (!plan.includes(marker)) missing.push(`상품검증 실행계획: ${marker}`);
}

const checkScript = packageJson.scripts?.['check:one-point-proof'] || '';
const verifyFast = packageJson.scripts?.['verify:fast'] || '';

if (!checkScript.includes('check-one-point-proof-contract.cjs')) {
  missing.push('package.json script check:one-point-proof');
}

if (!verifyFast.includes('check:one-point-proof')) {
  missing.push('verify:fast includes check:one-point-proof');
}

if (missing.length > 0) {
  console.error('[check-one-point-proof-contract] FAIL');
  missing.forEach((item) => console.error(`- missing: ${item}`));
  process.exit(1);
}

console.log('[check-one-point-proof-contract] PASS');
console.log('- 2-minute proof panel, Q1/job separation message, native guidance, report, and monthly tracking links are present.');
