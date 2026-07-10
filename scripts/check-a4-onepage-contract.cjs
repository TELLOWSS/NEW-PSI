const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const files = {
  page: read('pages/A4EducationMaterial.tsx'),
  training: read('pages/AdminTraining.tsx'),
  studio: read('utils/tbmEducationStudio.ts'),
  packageJson: JSON.parse(read('package.json')),
};

const failures = [];

const required = [
  ['pages/A4EducationMaterial.tsx', files.page, 'finishCompactSentence'],
  ['pages/A4EducationMaterial.tsx', files.page, 'trimToReadableBoundary'],
  ['pages/A4EducationMaterial.tsx', files.page, 'completeA4Items'],
  ['pages/A4EducationMaterial.tsx', files.page, 'supplementalRisks'],
  ['pages/A4EducationMaterial.tsx', files.page, 'translationNeedsRefresh'],
  ['pages/A4EducationMaterial.tsx', files.page, '기존 다국어 탭은 대조용으로 유지했습니다'],
  ['pages/A4EducationMaterial.tsx', files.page, '다국어 재생성 단계로 이동'],
  ['pages/AdminTraining.tsx', files.training, 'translationNeedsRefresh'],
  ['pages/AdminTraining.tsx', files.training, '기존 번역은 재사용하지 않고'],
  ['utils/tbmEducationStudio.ts', files.studio, 'translationNeedsRefresh?: boolean'],
];

for (const [file, content, marker] of required) {
  if (!content.includes(marker)) failures.push(`${file}: missing "${marker}"`);
}

const compactTextBody = files.page.match(/const compactText =[\s\S]*?const compactLines =/);
if (!compactTextBody) {
  failures.push('pages/A4EducationMaterial.tsx: compactText block not found');
} else {
  if (compactTextBody[0].includes('...')) {
    failures.push('pages/A4EducationMaterial.tsx: compactText must not append ellipsis to worker-facing A4 text');
  }
  if (compactTextBody[0].includes('slice(0, Math.max(0, maxLength - 3))')) {
    failures.push('pages/A4EducationMaterial.tsx: compactText still uses hard cut fallback');
  }
}

const markPackageBody = files.page.match(/const markPackageDraftChanged =[\s\S]*?const buildCurrentFallbackDraft =/);
if (!markPackageBody) {
  failures.push('pages/A4EducationMaterial.tsx: markPackageDraftChanged block not found');
} else if (markPackageBody[0].includes('setTranslatedTexts({})')) {
  failures.push('pages/A4EducationMaterial.tsx: package review must not erase translated language tabs');
}

const previewBlock = files.page.match(/<article ref=\{sheetRef\}[\s\S]*?<div className="mt-4 grid gap-2 sm:grid-cols-4 no-print">/);
if (!previewBlock) {
  failures.push('pages/A4EducationMaterial.tsx: A4 preview block not found');
} else {
  for (const forbidden of ['line-clamp', 'truncate']) {
    if (previewBlock[0].includes(forbidden)) {
      failures.push(`pages/A4EducationMaterial.tsx: A4 preview block should not visually cut final text with ${forbidden}`);
    }
  }
}

const checkScript = files.packageJson.scripts?.['check:a4-onepage'] || '';
const verifyFast = files.packageJson.scripts?.['verify:fast'] || '';

if (!checkScript.includes('check-a4-onepage-contract.cjs')) {
  failures.push('package.json script check:a4-onepage');
}

if (!verifyFast.includes('check:a4-onepage')) {
  failures.push('verify:fast includes check:a4-onepage');
}

if (failures.length > 0) {
  console.error('[check-a4-onepage-contract] FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[check-a4-onepage-contract] PASS');
console.log('- A4 education output keeps complete compact sentences, review-safe multilingual refresh, and filled one-page cards.');
