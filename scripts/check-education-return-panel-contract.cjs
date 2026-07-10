const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const files = {
  types: read('types.ts'),
  app: read('App.tsx'),
  routeMeta: read('config/routeMeta.ts'),
  sidebar: read('components/Sidebar.tsx'),
  layout: read('components/Layout.tsx'),
  workBoard: read('components/IntegratedWorkBoard.tsx'),
  page: read('pages/EducationReturn.tsx'),
  monthlyGuidance: read('pages/MonthlyGuidanceReport.tsx'),
  summary: read('utils/educationReturnSummary.ts'),
  operationalMode: read('utils/operationalModeUtils.ts'),
  uiComposition: read('utils/uiCompositionConfig.ts'),
  packageJson: JSON.parse(read('package.json')),
};

const failures = [];

const required = [
  ['types.ts', files.types, "'education-return'"],
  ['App.tsx', files.app, "lazyWithRecovery('EducationReturn'"],
  ['App.tsx', files.app, "currentPage === 'education-return'"],
  ['config/routeMeta.ts', files.routeMeta, "id: 'education-return'"],
  ['config/routeMeta.ts', files.routeMeta, "practitionerLabel: '교육 환류'"],
  ['components/Sidebar.tsx', files.sidebar, "id: 'education-return'"],
  ['components/Layout.tsx', files.layout, "predictive: ['education-return'"],
  ['components/IntegratedWorkBoard.tsx', files.workBoard, "setCurrentPage('education-return')"],
  ['pages/EducationReturn.tsx', files.page, 'data-education-return="page"'],
  ['pages/EducationReturn.tsx', files.page, 'data-education-return="three-step-flow"'],
  ['pages/EducationReturn.tsx', files.page, '찍는다'],
  ['pages/EducationReturn.tsx', files.page, '확인한다'],
  ['pages/EducationReturn.tsx', files.page, '교육한다'],
  ['pages/EducationReturn.tsx', files.page, '원페이지 교육자료'],
  ['pages/EducationReturn.tsx', files.page, '개인 보호 리포트'],
  ['pages/EducationReturn.tsx', files.page, '월별 계도·추적자료'],
  ['pages/EducationReturn.tsx', files.page, 'data-education-return="tracking-preview"'],
  ['pages/EducationReturn.tsx', files.page, 'QR/음성 파일럿'],
  ['pages/EducationReturn.tsx', files.page, "onNavigateToPage('a4-education-material')"],
  ['pages/EducationReturn.tsx', files.page, "onNavigateToPage('reports')"],
  ['pages/EducationReturn.tsx', files.page, "onNavigateToPage('monthly-guidance-report')"],
  ['pages/MonthlyGuidanceReport.tsx', files.monthlyGuidance, 'data-monthly-guidance="tracking-analysis"'],
  ['pages/MonthlyGuidanceReport.tsx', files.monthlyGuidance, 'data-monthly-guidance="trend-chart"'],
  ['pages/MonthlyGuidanceReport.tsx', files.monthlyGuidance, 'data-monthly-guidance="risk-bars"'],
  ['pages/MonthlyGuidanceReport.tsx', files.monthlyGuidance, 'data-monthly-guidance="metric-bars"'],
  ['pages/MonthlyGuidanceReport.tsx', files.monthlyGuidance, 'data-monthly-guidance="group-radar"'],
  ['pages/MonthlyGuidanceReport.tsx', files.monthlyGuidance, 'FieldRadarChart'],
  ['pages/MonthlyGuidanceReport.tsx', files.monthlyGuidance, '공종·팀 레이더 분석'],
  ['pages/MonthlyGuidanceReport.tsx', files.monthlyGuidance, '팀별'],
  ['pages/MonthlyGuidanceReport.tsx', files.monthlyGuidance, '공종별'],
  ['pages/MonthlyGuidanceReport.tsx', files.monthlyGuidance, 'buildMonthlyCoreMetricSeries'],
  ['pages/MonthlyGuidanceReport.tsx', files.monthlyGuidance, '실명·개인별 수치 제거 완료'],
  ['utils/educationReturnSummary.ts', files.summary, 'buildEducationReturnSummary'],
  ['utils/operationalModeUtils.ts', files.operationalMode, "'education-return'"],
  ['utils/uiCompositionConfig.ts', files.uiComposition, "'education-return'"],
];

for (const [file, content, marker] of required) {
  if (!content.includes(marker)) failures.push(`${file}: missing "${marker}"`);
}

const forbiddenPageMarkers = [
  '개인 점수',
  '초급',
  '중급',
  '고급',
  'LEVEL',
  'SIGNAL',
];

for (const marker of forbiddenPageMarkers) {
  if (files.page.includes(marker)) {
    failures.push(`pages/EducationReturn.tsx: product-facing evaluation wording remains "${marker}"`);
  }
}

const checkScript = files.packageJson.scripts?.['check:education-return-panel'] || '';
const verifyFast = files.packageJson.scripts?.['verify:fast'] || '';

if (!checkScript.includes('check-education-return-panel-contract.cjs')) {
  failures.push('package.json script check:education-return-panel');
}

if (!verifyFast.includes('check:education-return-panel')) {
  failures.push('verify:fast includes check:education-return-panel');
}

if (failures.length > 0) {
  console.error('[check-education-return-panel-contract] FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[check-education-return-panel-contract] PASS');
console.log('- Education return center keeps the simple scan-review-educate flow, three output cards, monthly tracking chart analysis, and group radar analysis.');
