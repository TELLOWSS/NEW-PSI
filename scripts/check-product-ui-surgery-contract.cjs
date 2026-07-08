const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = {
  modal: path.join(root, 'components', 'modals', 'RecordDetailModal.tsx'),
  ocr: path.join(root, 'pages', 'OcrAnalysis.tsx'),
  package: path.join(root, 'package.json'),
};

const read = (filePath) => fs.readFileSync(filePath, 'utf8');
const modal = read(files.modal);
const ocr = read(files.ocr);
const packageJson = JSON.parse(read(files.package));

const missing = [];

const required = [
  ['components/modals/RecordDetailModal.tsx', modal, '근로자 보호 판단'],
  ['components/modals/RecordDetailModal.tsx', modal, "label: '보호 판단'"],
  ['components/modals/RecordDetailModal.tsx', modal, "label: '원문 대조'"],
  ['components/modals/RecordDetailModal.tsx', modal, "label: '개발자 검증'"],
  ['components/modals/RecordDetailModal.tsx', modal, '현장 보호 판단 모드'],
  ['components/modals/RecordDetailModal.tsx', modal, '관리자 원문 대조 모드'],
  ['components/modals/RecordDetailModal.tsx', modal, '개발자 검증 모드'],
  ['components/modals/RecordDetailModal.tsx', modal, "decisionQuickMetrics.filter((metric) => ['score', 'audit'].includes(metric.key))"],
  ['components/modals/RecordDetailModal.tsx', modal, 'isProfessionalReviewView ? ('],
  ['components/modals/RecordDetailModal.tsx', modal, '증빙 고유값: {record.evidenceHash || '],
  ['pages/OcrAnalysis.tsx', ocr, '보호 판단 열기'],
  ['pages/OcrAnalysis.tsx', ocr, '교육 리포트 열기'],
  ['pages/OcrAnalysis.tsx', ocr, '원본 재판독'],
  ['pages/OcrAnalysis.tsx', ocr, 'isDevMode && typeof r.ocrConfidence'],
];

for (const [file, content, marker] of required) {
  if (!content.includes(marker)) {
    missing.push(`${file}: ${marker}`);
  }
}

if (modal.includes("['score', 'confidence', 'audit']")) {
  missing.push('components/modals/RecordDetailModal.tsx: compact product view must not include OCR confidence metric card');
}

if (ocr.includes('상세 판단 바로보기')) {
  missing.push('pages/OcrAnalysis.tsx: replace 상세 판단 바로보기 with 보호 판단 language');
}

const checkScript = packageJson.scripts?.['check:product-ui-surgery'] || '';
const verifyFast = packageJson.scripts?.['verify:fast'] || '';

if (!checkScript.includes('check-product-ui-surgery-contract.cjs')) {
  missing.push('package.json script check:product-ui-surgery');
}

if (!verifyFast.includes('check:product-ui-surgery')) {
  missing.push('verify:fast includes check:product-ui-surgery');
}

if (missing.length > 0) {
  console.error('[check-product-ui-surgery-contract] FAIL');
  missing.forEach((item) => console.error(`- missing: ${item}`));
  process.exit(1);
}

console.log('[check-product-ui-surgery-contract] PASS');
console.log('- Worker detail and OCR list default to protection/education language while developer evidence remains gated.');
