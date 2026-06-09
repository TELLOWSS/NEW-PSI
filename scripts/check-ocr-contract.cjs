const fs = require('node:fs');
const path = require('node:path');

const checks = [
  ['pages/OcrAnalysis.tsx', ['analyzeWorkerRiskAssessment', 'analyzeHarnessRecord', 'ocrConfidence', 'secondPassStatus']],
  ['services/geminiService.ts', ['analyzeWorkerRiskAssessment', 'scoreBreakdown']],
  ['types.ts', ['SixMetricBreakdown', 'repeatViolationPenalty', 'improvementExecution']],
];

let failed = false;
for (const [relativePath, requiredTokens] of checks) {
  const fullPath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`[check:ocr-contract] missing ${relativePath}`);
    failed = true;
    continue;
  }
  const source = fs.readFileSync(fullPath, 'utf8');
  const missing = requiredTokens.filter((token) => !source.includes(token));
  if (missing.length) {
    console.error(`[check:ocr-contract] ${relativePath} missing: ${missing.join(', ')}`);
    failed = true;
  } else {
    console.log(`[check:ocr-contract] ${relativePath}: OK`);
  }
}

if (failed) process.exit(1);
