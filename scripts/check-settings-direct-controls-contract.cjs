const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = {
  packageJson: path.join(root, 'package.json'),
  settingsPage: path.join(root, 'pages', 'Settings.tsx'),
  aiEngineSettings: path.join(root, 'utils', 'aiEngineSettings.ts'),
  actionButton: path.join(root, 'components', 'shared', 'ActionButton.tsx'),
};

const sources = Object.fromEntries(
  Object.entries(files).map(([key, filePath]) => [key, fs.readFileSync(filePath, 'utf8')]),
);
const packageJson = JSON.parse(sources.packageJson);

const requiredMarkers = [
  ['settingsPage', 'DirectControlState'],
  ['settingsPage', 'directControlState'],
  ['settingsPage', 'persistSettingsImmediately'],
  ['settingsPage', 'handleDirectStatusCheck'],
  ['settingsPage', 'handleDirectPolicyCheck'],
  ['settingsPage', 'handleDirectStorageCheck'],
  ['settingsPage', 'handleDirectOcrEngineChange'],
  ['settingsPage', 'handleDirectStrictApprovalChange'],
  ['settingsPage', 'handleDirectBatchPreset'],
  ['settingsPage', 'handleDirectStableMode'],
  ['settingsPage', 'handleDirectScaleMode'],
  ['settingsPage', '운영 직접 제어'],
  ['settingsPage', '현재 상태 확인'],
  ['settingsPage', '운영 기준 체크'],
  ['settingsPage', '저장 상태 점검'],
  ['settingsPage', '무료 안정 운영'],
  ['settingsPage', '유료 대량 운영'],
  ['settingsPage', 'OCR 빠른 분석'],
  ['settingsPage', '엄격 승인 기준'],
  ['settingsPage', '배치 100건'],
  ['settingsPage', 'ActionButton'],
  ['aiEngineSettings', 'setAiEngineSettings'],
  ['aiEngineSettings', 'AI_ENGINE_SETTINGS_CHANGED_EVENT'],
  ['actionButton', 'ActionButtonVariant'],
];

const missing = requiredMarkers
  .filter(([sourceKey, marker]) => !sources[sourceKey].includes(marker))
  .map(([sourceKey, marker]) => `${sourceKey}: ${marker}`);

const scriptValue = packageJson.scripts?.['check:settings-direct-controls'];
const verifyFast = packageJson.scripts?.['verify:fast'] || '';

if (!scriptValue || !scriptValue.includes('check-settings-direct-controls-contract.cjs')) {
  missing.push('package.json script check:settings-direct-controls');
}

if (!verifyFast.includes('check:settings-direct-controls')) {
  missing.push('verify:fast includes check:settings-direct-controls');
}

if (missing.length > 0) {
  console.error('[check-settings-direct-controls-contract] FAIL');
  missing.forEach((marker) => console.error(`- missing: ${marker}`));
  process.exit(1);
}

console.log('[check-settings-direct-controls-contract] PASS');
console.log('- Settings direct controls expose status checks, policy checks, storage checks, and one-click operating mode changes.');
