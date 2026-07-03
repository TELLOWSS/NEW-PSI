const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = {
  packageJson: path.join(root, 'package.json'),
  ocrPage: path.join(root, 'pages', 'OcrAnalysis.tsx'),
  geminiService: path.join(root, 'services', 'geminiService.ts'),
  gateway: path.join(root, 'api', 'gateway.ts'),
  engineSettings: path.join(root, 'utils', 'aiEngineSettings.ts'),
};

const sources = Object.fromEntries(
  Object.entries(files).map(([key, filePath]) => [key, fs.readFileSync(filePath, 'utf8')]),
);
const packageJson = JSON.parse(sources.packageJson);

const requiredMarkers = [
  ['engineSettings', 'resolveGeminiOcrModelChain = ('],
  ['engineSettings', 'options?: { isPaidApiMode?: boolean }'],
  ['engineSettings', "return ['gemini-2.5-flash'];"],
  ['geminiService', 'resolveGeminiOcrModelChain(ocrEngine, { isPaidApiMode })'],
  ['geminiService', 'evaluateChangedPsiFormCoverage'],
  ['geminiService', '변경 PSI 양식 Q1~Q5 답변 추출 완료'],
  ['geminiService', 'NEW-PSI 양식 또는 PSI-RA-01 양식이 보이면 Q1, Q2, Q3, Q4, Q5'],
  ['gateway', 'resolveGeminiOcrModelChain(engine, { isPaidApiMode })'],
  ['gateway', 'req.body?.isPaidApiMode === true'],
  ['gateway', 'evaluateChangedPsiFormCoverage'],
  ['gateway', 'NEW-PSI 양식 또는 PSI-RA-01 양식이면 Q1 위험 작업'],
  ['ocrPage', 'getRecordFailureHeadline'],
  ['ocrPage', 'getRecordFailureDisplayLabel'],
  ['ocrPage', 'API 한도 초과로 대기 중입니다.'],
  ['ocrPage', 'isPaidApiMode,'],
];

const missing = requiredMarkers
  .filter(([sourceKey, marker]) => !sources[sourceKey].includes(marker))
  .map(([sourceKey, marker]) => `${sourceKey}: ${marker}`);

const scriptValue = packageJson.scripts?.['check:ocr-quota-form-gate'];
const verifyFast = packageJson.scripts?.['verify:fast'] || '';

if (!scriptValue || !scriptValue.includes('check-ocr-quota-form-gate-contract.cjs')) {
  missing.push('package.json script check:ocr-quota-form-gate');
}

if (!verifyFast.includes('check:ocr-quota-form-gate')) {
  missing.push('verify:fast includes check:ocr-quota-form-gate');
}

if (missing.length > 0) {
  console.error('[check-ocr-quota-form-gate-contract] FAIL');
  missing.forEach((marker) => console.error(`- missing: ${marker}`));
  process.exit(1);
}

console.log('[check-ocr-quota-form-gate-contract] PASS');
console.log('- OCR quota labels, free-mode model chain, and changed PSI Q1-Q5 coverage gate are protected.');
