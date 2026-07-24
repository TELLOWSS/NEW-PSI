const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const targetRoots = [
  'pages',
  'components',
  'config',
  'api',
  'services',
  'utils',
  'docs/daewoo_deck',
];

const explicitDocs = [
  'docs/PSI_상품설명서_브랜드스토리_2026-07-04.md',
  'docs/PSI_정체성_운영구조_정정_2026-07-09.md',
  'docs/PSI_3단계_교육환류_간편화_계획_2026-07-09.md',
  'docs/PSI_공모전_출시준비_심층리서치_검증계획_2026-07-09.md',
  'docs/PSI_정체성_상품화_검증_마스터플랜_2026-07-07.md',
  'docs/CODEX_STATE.md',
  'docs/PSI_DEVELOPMENT_GUARDRAILS.md',
  'reports/OCR_FORM_RECOGNITION_HARDENING_PLAN_2026-07-06.md',
];

const ignoredFiles = new Set([
  // These files intentionally mention TBM as a term that must not leak into translated worker-facing text.
  'utils/externalAiHandoff.ts',
  'utils/reportLanguagePolicy.ts',
]);

const allowedLinePatterns = [
  /productGroup:\s*'tbm'/,
  /id:\s*'ppt-pdf-one-page-summary'/,
  /id:\s*'a4-education-material'/,
  /id:\s*'admin-training'/,
  /id:\s*'safety-compliance-hub'/,
  /id:\s*'field-context-input'/,
  /id:\s*'intervention-coaching'/,
  /id:\s*'judgment-tagging-input'/,
  /SMART TBM.*제외/,
  /SMART TBM.*별개/,
];

const forbiddenPhrases = [
  'PSI TBM',
  'TBM Safety',
  'TBM 안전',
  'TBM 교육자료',
  'TBM 환류',
  'TBM 전파',
  'TBM 보호구',
  'TBM 시작',
  'TBM 안건',
  'TBM 현황',
  'TBM 행동',
  'TBM 교재',
  'TBM 참여',
  'TBM 배포',
  'TBM 시간',
  'TBM 즉각',
  '작업계획·TBM',
  '작업전 TBM',
  '작업 전 TBM',
  'TBM Education Studio',
];

const isTextFile = (filePath) => /\.(?:ts|tsx|js|jsx|cjs|mjs|md|html)$/i.test(filePath);

const walk = (absoluteDir, collector) => {
  if (!fs.existsSync(absoluteDir)) return;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'archive') continue;
    const absolutePath = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath, collector);
      continue;
    }
    if (entry.isFile() && isTextFile(absolutePath)) collector.push(absolutePath);
  }
};

const toRelative = (absolutePath) => path.relative(root, absolutePath).replace(/\\/g, '/');

const files = [];
for (const relativeRoot of targetRoots) walk(path.join(root, relativeRoot), files);
for (const relativePath of explicitDocs) {
  const absolutePath = path.join(root, relativePath);
  if (fs.existsSync(absolutePath)) files.push(absolutePath);
}

const uniqueFiles = [...new Set(files.map((absolutePath) => path.resolve(absolutePath)))];
const failures = [];

for (const absolutePath of uniqueFiles) {
  const relativePath = toRelative(absolutePath);
  if (ignoredFiles.has(relativePath)) continue;

  const content = fs.readFileSync(absolutePath, 'utf8');
  const lines = content.split(/\r?\n/u);

  lines.forEach((line, index) => {
    if (!/\bTBM\b|SMART TBM/u.test(line)) return;
    if (allowedLinePatterns.some((pattern) => pattern.test(line))) return;

    for (const phrase of forbiddenPhrases) {
      if (line.includes(phrase)) {
        failures.push(`${relativePath}:${index + 1} remove product-scope phrase "${phrase}"`);
      }
    }
  });
}

const routeMeta = fs.readFileSync(path.join(root, 'config/routeMeta.ts'), 'utf8');
if (!routeMeta.includes("developerLabel: 'Risk Assessment Education Studio'")) {
  failures.push('config/routeMeta.ts: a4 education developer label must stay PSI-scope aligned');
}

const a4Education = fs.readFileSync(path.join(root, 'pages/A4EducationMaterial.tsx'), 'utf8');
if (/headerTitle:\s*['"][^'"]*\bTBM\b/iu.test(a4Education)) {
  failures.push('pages/A4EducationMaterial.tsx: language headerTitle must not include TBM');
}
if (a4Education.includes("title: title || 'TBM Safety Guide'")) {
  failures.push('pages/A4EducationMaterial.tsx: fallback title must not be TBM Safety Guide');
}

if (failures.length > 0) {
  console.error('[check-psi-scope-language] FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[check-psi-scope-language] PASS');
console.log('- PSI product language is scoped to self-written risk assessment, OCR/AI validation, one-page education material, and cadence-aware feedback.');
console.log('- SMART TBM/TBM system wording is blocked from product-facing copy, except explicit boundary notes and internal compatibility keys.');
