const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const failures = [];

const mustContain = [
  ['utils/safetyLevelUtils.ts', 'SAFETY_SIGNAL_COPY'],
  ['utils/safetyLevelUtils.ts', "score: '위험인식 신호'"],
  ['utils/safetyLevelUtils.ts', "level: '지원단계'"],
  ['utils/safetyLevelUtils.ts', "signal: '보호신호'"],
  ['utils/safetyLevelUtils.ts', "priority: '우선지원'"],
  ['utils/safetyLevelUtils.ts', 'getSafetyLevelDisplayLabel'],
  ['pages/OcrAnalysis.tsx', 'SAFETY_SIGNAL_COPY.score'],
  ['pages/WorkerManagement.tsx', 'SAFETY_SIGNAL_COPY.signal'],
  ['pages/Reports.tsx', 'getSafetyLevelDisplayLabel'],
  ['pages/IndividualReport.tsx', '개인별 수치·순위·감점'],
  ['components/modals/RecordDetailModal.tsx', 'supportStageLabel'],
  ['components/modals/WorkerHistoryModal.tsx', 'SAFETY_SIGNAL_COPY.score'],
  ['components/shared/CircularProgress.tsx', 'getSafetyLevelDisplayLabel'],
  ['utils/reportLanguagePolicy.ts', "totalScore: '위험인식 신호'"],
  ['utils/reportLanguagePolicy.ts', "beginner: '우선지원'"],
  ['utils/reportLanguagePolicy.ts', "beginner: 'Priority support'"],
];

for (const [file, needle] of mustContain) {
  const text = read(file);
  if (!text.includes(needle)) {
    failures.push(`${file}: missing "${needle}"`);
  }
}

const productFacingFiles = [
  'pages/OcrAnalysis.tsx',
  'pages/WorkerManagement.tsx',
  'pages/Reports.tsx',
  'pages/IndividualReport.tsx',
  'pages/PerformanceAnalysis.tsx',
  'components/ReportTemplate.tsx',
  'components/shared/CircularProgress.tsx',
  'components/modals/WorkerHistoryModal.tsx',
  'utils/evidenceReportUtils.ts',
];

for (const file of productFacingFiles) {
  const text = read(file);
  if (/\bLEVEL\b/.test(text)) failures.push(`${file}: product-facing LEVEL label remains`);
  if (/\bSIGNAL\b/.test(text)) failures.push(`${file}: product-facing SIGNAL label remains`);
  if (text.includes('응답품질')) failures.push(`${file}: old response-quality wording remains`);
  if (text.includes('확인단계')) failures.push(`${file}: old confirmation-stage wording remains`);
  if (text.includes('개인 점수')) failures.push(`${file}: personal-score wording remains`);
}

if (failures.length > 0) {
  console.error('❌ PSI care-language contract failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('✅ PSI care-language contract passed');
