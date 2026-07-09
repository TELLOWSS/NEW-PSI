const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const files = {
  intro: read('pages/Introduction.tsx'),
  education: read('pages/A4EducationMaterial.tsx'),
  training: read('pages/AdminTraining.tsx'),
  settings: read('pages/Settings.tsx'),
  layout: read('components/Layout.tsx'),
  workBoard: read('components/IntegratedWorkBoard.tsx'),
  routeMeta: read('config/routeMeta.ts'),
  identityDoc: read('docs/PSI_정체성_운영구조_정정_2026-07-09.md'),
  packageJson: JSON.parse(read('package.json')),
};

const failures = [];

const mustContain = [
  ['pages/Introduction.tsx', files.intro, '5문항·6지표'],
  ['pages/Introduction.tsx', files.intro, '공식 리포트'],
  ['pages/Introduction.tsx', files.intro, '원페이지 교육자료'],
  ['pages/Introduction.tsx', files.intro, '파일럿 QR/음성 안내'],
  ['pages/Introduction.tsx', files.intro, '수기 기록 → OCR 분석 → 공식 리포트 → 교육자료 → 추적관리'],
  ['pages/A4EducationMaterial.tsx', files.education, '한 장짜리 위험성평가 교육자료'],
  ['pages/A4EducationMaterial.tsx', files.education, 'QR/음성 파일럿으로 보내기'],
  ['pages/AdminTraining.tsx', files.training, 'QR·음성 안내 파일럿'],
  ['pages/Settings.tsx', files.settings, 'QR/음성 파일럿 기본 언어 세트'],
  ['components/Layout.tsx', files.layout, "label: '교육자료'"],
  ['components/IntegratedWorkBoard.tsx', files.workBoard, '공식 리포트, 원페이지 교육자료 및 개선율 추이'],
  ['components/IntegratedWorkBoard.tsx', files.workBoard, 'QR·음성 파일럿'],
  ['config/routeMeta.ts', files.routeMeta, "practitionerLabel: 'QR/음성 파일럿'"],
  ['docs/PSI_정체성_운영구조_정정_2026-07-09.md', files.identityDoc, '다국어/QR은 아직 파일럿 보조 채널'],
];

const forbiddenInProductScreens = [
  ['pages/Introduction.tsx', files.intro, '다국어 교육 / QR'],
  ['pages/Introduction.tsx', files.intro, '다국어 QR'],
  ['pages/Introduction.tsx', files.intro, '모국어 안내와 교육 환류'],
  ['pages/Introduction.tsx', files.intro, '모국어·리포트·추적'],
  ['pages/Introduction.tsx', files.intro, '모국어 신호'],
  ['pages/A4EducationMaterial.tsx', files.education, '다국어 교육 원문으로 보내기'],
  ['pages/A4EducationMaterial.tsx', files.education, '다국어 교육으로 이어갑니다'],
  ['pages/Settings.tsx', files.settings, '다국어 교육 기본 언어 세트'],
  ['components/Layout.tsx', files.layout, "label: '교육/QR'"],
  ['components/IntegratedWorkBoard.tsx', files.workBoard, '다국어 위험성평가 교육 전파'],
  ['components/IntegratedWorkBoard.tsx', files.workBoard, '다국어 교육 & QR'],
  ['components/IntegratedWorkBoard.tsx', files.workBoard, '다국어 교육·QR'],
  ['config/routeMeta.ts', files.routeMeta, "practitionerLabel: '다국어 교육 / QR'"],
];

for (const [file, content, marker] of mustContain) {
  if (!content.includes(marker)) failures.push(`${file}: missing "${marker}"`);
}

for (const [file, content, marker] of forbiddenInProductScreens) {
  if (content.includes(marker)) failures.push(`${file}: outdated core-positioning phrase remains "${marker}"`);
}

const checkScript = files.packageJson.scripts?.['check:product-identity'] || '';
const verifyFast = files.packageJson.scripts?.['verify:fast'] || '';

if (!checkScript.includes('check-product-identity-contract.cjs')) {
  failures.push('package.json script check:product-identity');
}

if (!verifyFast.includes('check:product-identity')) {
  failures.push('verify:fast includes check:product-identity');
}

if (failures.length > 0) {
  console.error('[check-product-identity-contract] FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[check-product-identity-contract] PASS');
console.log('- Product identity is centered on OCR/AI 5Q/6 indicators, manager-verified reports, one-page education material, and monthly tracking.');
console.log('- QR/multilingual delivery is framed as a pilot support channel.');
