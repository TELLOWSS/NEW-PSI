const fs = require('fs');
const path = require('path');

const root = process.cwd();
const paths = {
  intro: path.join(root, 'pages', 'Introduction.tsx'),
  layout: path.join(root, 'components', 'Layout.tsx'),
  session: path.join(root, 'utils', 'onePointProofSession.ts'),
  package: path.join(root, 'package.json'),
};

const read = (filePath) => fs.readFileSync(filePath, 'utf8');
const intro = read(paths.intro);
const layout = read(paths.layout);
const session = read(paths.session);
const packageJson = JSON.parse(read(paths.package));

const required = [
  ['pages/Introduction.tsx', intro, 'data-one-point-proof="panel"'],
  ['pages/Introduction.tsx', intro, 'onePointProofSteps'],
  ['pages/Introduction.tsx', intro, 'onePointProofMetrics'],
  ['pages/Introduction.tsx', intro, "marker: 'stage-scan'"],
  ['pages/Introduction.tsx', intro, "marker: 'stage-q1-separation'"],
  ['pages/Introduction.tsx', intro, "marker: 'stage-manager-review'"],
  ['pages/Introduction.tsx', intro, "marker: 'stage-native-feedback'"],
  ['pages/Introduction.tsx', intro, 'data-one-point-proof="progress-state"'],
  ['pages/Introduction.tsx', intro, 'data-one-point-proof="next-stage"'],
  ['pages/Introduction.tsx', intro, 'handleOpenOnePointProofStage'],
  ['pages/Introduction.tsx', intro, 'startOnePointProofStage'],
  ['pages/Introduction.tsx', intro, '공종과 Q1 실제 위험작업'],
  ['pages/Introduction.tsx', intro, '관리자 검증 후 모국어 안내와 개인 안전역량, 월별 추적관리'],
  ['components/Layout.tsx', layout, 'data-one-point-proof-return="banner"'],
  ['components/Layout.tsx', layout, 'data-one-point-proof-return="action-return"'],
  ['components/Layout.tsx', layout, 'data-one-point-proof-return="action-end"'],
  ['components/Layout.tsx', layout, 'handleReturnToOnePointProof'],
  ['components/Layout.tsx', layout, 'markOnePointProofReturned'],
  ['utils/onePointProofSession.ts', session, 'ONE_POINT_PROOF_STORAGE_KEY'],
  ['utils/onePointProofSession.ts', session, 'ONE_POINT_PROOF_SESSION_EVENT'],
  ['utils/onePointProofSession.ts', session, 'ONE_POINT_PROOF_STAGES'],
  ['utils/onePointProofSession.ts', session, 'readOnePointProofSession'],
  ['utils/onePointProofSession.ts', session, 'clearOnePointProofSession'],
];

const missing = [];

for (const [file, content, marker] of required) {
  if (!content.includes(marker)) {
    missing.push(`${file}: ${marker}`);
  }
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
console.log('- Proof panel, stage progress, return banner, return action, and shared proof session are present.');
