const fs = require('fs');
const path = require('path');

const root = process.cwd();

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const files = {
  topBar: read('components/shell/TopBar.tsx'),
  layout: read('components/Layout.tsx'),
  sidebar: read('components/Sidebar.tsx'),
  composition: read('utils/uiCompositionConfig.ts'),
  workBoard: read('components/IntegratedWorkBoard.tsx'),
  dashboard: read('pages/Dashboard.tsx'),
  routeMeta: read('config/routeMeta.ts'),
  operationalMode: read('utils/operationalModeUtils.ts'),
  plainLanguageQa: read('scripts/verify-plain-language-ui.mjs'),
  packageJson: JSON.parse(read('package.json')),
};

const failures = [];

const assertAbsent = (name, content, marker) => {
  if (content.includes(marker)) failures.push(`${name}: remove "${marker}"`);
};

const assertPresent = (name, content, marker) => {
  if (!content.includes(marker)) failures.push(`${name}: missing "${marker}"`);
};

assertAbsent('TopBar', files.topBar, 'onGoToMobileHub');
assertAbsent('TopBar', files.topBar, '12채널 허브');
assertAbsent('TopBar', files.topBar, '12채널 모바일 연동 허브');
assertAbsent('Layout', files.layout, 'handleGoToMobileHub');
assertAbsent('Layout', files.layout, 'mobile-sync-hub');
assertPresent('Sidebar', files.sidebar, "id: 'safety-compliance-hub'");
assertPresent('uiCompositionConfig', files.composition, "'safety-compliance-hub'");
assertPresent('operationalModeUtils', files.operationalMode, "'safety-compliance-hub'");
assertAbsent('IntegratedWorkBoard', files.workBoard, "'safety-compliance-hub'");
assertAbsent('IntegratedWorkBoard', files.workBoard, 'Control Hub');
assertAbsent('Dashboard', files.dashboard, '12채널');
assertAbsent('Dashboard', files.dashboard, '12 Channels');
assertAbsent('Dashboard', files.dashboard, 'mobile-sync-hub');
assertAbsent('plain-language QA seed', files.plainLanguageQa, "'safety-compliance-hub'");

assertPresent('Dashboard', files.dashboard, '현장 모바일 실행 흐름');
assertPresent('Dashboard', files.dashboard, 'MOBILE FIELD FLOW');
assertPresent('Dashboard', files.dashboard, 'STEP {channel.step}');
assertPresent('IntegratedWorkBoard', files.workBoard, 'Core Flow');

const routeMetaBlock = files.routeMeta.match(/'safety-compliance-hub': createMeta\(\{[\s\S]*?\n    \}\),/);
if (!routeMetaBlock) {
  failures.push('routeMeta: safety-compliance-hub route meta block missing');
} else {
  const block = routeMetaBlock[0];
  assertPresent('routeMeta safety-compliance-hub', block, 'menuVisibleInPractitionerMode: true');
  assertPresent('routeMeta safety-compliance-hub', block, 'menuVisibleInWorkerMode: false');
  assertPresent('routeMeta safety-compliance-hub', block, 'menuVisibleInDeveloperMode: true');
}

const checkScript = files.packageJson.scripts?.['check:no-12-channel-hub'] || '';
const verifyFast = files.packageJson.scripts?.['verify:fast'] || '';

if (!checkScript.includes('check-no-12-channel-hub-contract.cjs')) {
  failures.push('package.json: check:no-12-channel-hub script missing');
}

if (!verifyFast.includes('check:no-12-channel-hub')) {
  failures.push('package.json: verify:fast must include check:no-12-channel-hub');
}

if (failures.length > 0) {
  console.error('[check-no-12-channel-hub-contract] FAIL');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-no-12-channel-hub-contract] PASS');
console.log('- Legacy 12-channel entry points remain removed while the approved safety compliance hub is available to practitioners and developers.');
