const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const targets = [
  'pages/Reports.tsx',
  'utils/exportTimestamp.ts',
];

const MAX_ALLOWED_WARNINGS = 1;

function checkFile(relativePath) {
  const filePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(filePath)) {
    return { file: relativePath, missing: true, diagnostics: [] };
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: relativePath,
    reportDiagnostics: true,
  });

  const diagnostics = (result.diagnostics || [])
    .filter((diag) => diag.category === ts.DiagnosticCategory.Error)
    .map((diag) => {
      const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
      const lineChar = diag.file && typeof diag.start === 'number'
        ? diag.file.getLineAndCharacterOfPosition(diag.start)
        : null;
      return {
        message,
        line: lineChar ? lineChar.line + 1 : null,
        col: lineChar ? lineChar.character + 1 : null,
      };
    });

  const warnings = [];

  if (relativePath === 'pages/Reports.tsx') {
    const localeMatches = Array.from(source.matchAll(/toLocaleString\(/g));
    localeMatches.forEach((match) => {
      const index = typeof match.index === 'number' ? match.index : -1;
      let line = null;
      let col = null;
      if (index >= 0) {
        const prefix = source.slice(0, index);
        line = prefix.split('\n').length;
        const lastBreak = prefix.lastIndexOf('\n');
        col = index - lastBreak;
      }

      const lineText = line ? (source.split('\n')[line - 1] || '') : '';
      const isLegacyReadmeLine = lineText.includes('생성일시:') && lineText.includes('new Date().toLocaleString()');

      if (isLegacyReadmeLine) {
        warnings.push({
          message: 'Reports README 생성시각은 레거시 라인 예외로 허용됨(차기 배치에서 ISO/KST로 전환 예정).',
          line,
          col,
        });
        return;
      }

      diagnostics.push({
        message: 'Reports.tsx에는 toLocaleString() 대신 ISO/KST 병행 포맷을 사용해야 합니다.',
        line,
        col,
      });
    });
  }

  return { file: relativePath, missing: false, diagnostics, warnings };
}

function main() {
  console.log('[check:hotspot] Syntax preflight for high-risk files');
  let hasError = false;
  let warningCount = 0;

  for (const target of targets) {
    const result = checkFile(target);

    if (result.missing) {
      console.log(`- ${target}: SKIP (not found)`);
      continue;
    }

    if (result.warnings && result.warnings.length > 0) {
      warningCount += result.warnings.length;
      result.warnings.slice(0, 3).forEach((warning) => {
        const where = warning.line ? `L${warning.line}:${warning.col}` : 'unknown';
        console.log(`  - WARN ${where} ${warning.message}`);
      });
    }

    if (result.diagnostics.length === 0) {
      console.log(`- ${target}: OK`);
      continue;
    }

    hasError = true;
    console.log(`- ${target}: ERROR (${result.diagnostics.length})`);
    result.diagnostics.slice(0, 5).forEach((diag) => {
      const where = diag.line ? `L${diag.line}:${diag.col}` : 'unknown';
      console.log(`  - ${where} ${diag.message}`);
    });
  }

  if (hasError) {
    process.exit(1);
  }

  if (warningCount > MAX_ALLOWED_WARNINGS) {
    console.log(`[check:hotspot] ERROR: legacy warning count exceeded (${warningCount}/${MAX_ALLOWED_WARNINGS}).`);
    process.exit(1);
  }

  process.exit(0);
}

main();
