const fs = require('fs');
const path = require('path');

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'utils', 'pdfCapture.ts'), 'utf8');

const requiredMarkers = [
  'const createIsolatedCaptureTarget',
  'const copyCanvasPixels',
  'data-psi-export-host',
  'const isolated = await createIsolatedCaptureTarget(target)',
  'const captureTarget = isolated.target',
  'toCanvas(captureTarget',
  'html2canvas(captureTarget',
  'isolated.cleanup()',
  "maxWidth = 'none'",
  "width: '210mm'",
];

const forbiddenMarkers = [
  "font-family: 'Malgun Gothic'",
  '[data-report-template-root="true"] .font-black',
  'toCanvas(target,',
  'html2canvas(target,',
  "clonedRoot.style.textRendering = 'auto'",
  "clonedRoot.style.letterSpacing = 'normal'",
];

const failures = [];

for (const marker of requiredMarkers) {
  if (!source.includes(marker)) {
    failures.push(`missing marker: ${marker}`);
  }
}

for (const marker of forbiddenMarkers) {
  if (source.includes(marker)) {
    failures.push(`forbidden marker remains: ${marker}`);
  }
}

if (failures.length > 0) {
  console.error('Export capture contract failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Export capture contract passed.');
