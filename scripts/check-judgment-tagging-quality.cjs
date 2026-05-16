const fs = require('node:fs');
const path = require('node:path');
const xlsx = require('xlsx');

const root = process.cwd();

const DEFAULTS = {
  input: 'templates/psi_judgment_tagging_template_v1.csv',
  codebook: 'templates/psi_judgment_tag_codebook_v1_24_2026-05-16.csv',
  ontology: 'templates/psi_ontology_v1_seed_2026-05-16.csv',
  reportJsonPath: '',
  reportMdPath: '',
};

const REQUIRED_COLUMNS = [
  'recordId',
  'sourceType',
  'rawText',
  'riskCategory',
  'riskSubcategory',
  'riskCategoryCode',
  'riskSubcategoryCode',
  'ontologyNodeId',
  'judgmentTags',
  'judgmentTagCodes',
  'vectorTaskUnderstanding',
  'vectorHazardRecognition',
  'vectorSequenceUnderstanding',
  'vectorRiskNormalization',
  'vectorResponseCapability',
  'linkedMetric',
  'precursorSignal',
  'recommendedAction',
  'recommendedActionCode',
  'reviewNeeded',
];

const ALLOWED = {
  sourceType: new Set(['manual-note', 'interview', 'education-response', 'ocr-record']),
  shiftType: new Set(['day', 'night', '']),
  vector: new Set(['low', 'mid', 'high']),
  linkedMetric: new Set([
    'psychological',
    'jobUnderstanding',
    'riskAssessmentUnderstanding',
    'proficiency',
    'improvementExecution',
    'repeatViolationPenalty',
  ]),
  precursorSignal: new Set(['Y', 'N', 'suspected']),
  reviewNeeded: new Set(['Y', 'N']),
};

function parseCliArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') {
      options.input = String(argv[i + 1] || '').trim() || options.input;
      i += 1;
      continue;
    }
    if (arg === '--codebook') {
      options.codebook = String(argv[i + 1] || '').trim() || options.codebook;
      i += 1;
      continue;
    }
    if (arg === '--ontology') {
      options.ontology = String(argv[i + 1] || '').trim() || options.ontology;
      i += 1;
      continue;
    }
    if (arg === '--report-json') {
      options.reportJsonPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--report-md') {
      options.reportMdPath = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
  }
  return options;
}

const CLI = parseCliArgs(process.argv.slice(2));

function resolveFromRoot(filePath) {
  return path.resolve(root, filePath);
}

function readCsvRows(filePath) {
  const resolved = resolveFromRoot(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`❌ 파일을 찾을 수 없습니다: ${filePath}`);
    process.exit(1);
  }

  const workbook = xlsx.readFile(resolved, { raw: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  return xlsx.utils.sheet_to_json(sheet, { defval: '' });
}

function normalize(value) {
  return String(value ?? '').trim();
}

function splitSemicolon(value) {
  return normalize(value)
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

function ensureParentDir(filePath) {
  const dir = path.dirname(resolveFromRoot(filePath));
  fs.mkdirSync(dir, { recursive: true });
}

function writeReports(summary) {
  if (CLI.reportJsonPath) {
    ensureParentDir(CLI.reportJsonPath);
    fs.writeFileSync(resolveFromRoot(CLI.reportJsonPath), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(`📄 JSON 리포트 저장: ${CLI.reportJsonPath}`);
  }

  if (CLI.reportMdPath) {
    ensureParentDir(CLI.reportMdPath);
    const lines = [
      '# PSI 판단태깅 품질검증 리포트',
      '',
      `- 생성 시각(UTC): ${summary.meta.generatedAt}`,
      `- 입력 파일: ${summary.meta.input}`,
      `- 코드북: ${summary.meta.codebook}`,
      `- 온톨로지: ${summary.meta.ontology}`,
      `- 전체 행 수: ${summary.totalRows}`,
      `- 입력 완료 행 수: ${summary.filledRows}`,
      `- 미입력 행 수: ${summary.unfilledRows}`,
      `- 오류 수: ${summary.errorCount}`,
      `- 경고 수: ${summary.warningCount}`,
      `- 상태: ${summary.status}`,
      '',
    ];

    if (summary.errorCount > 0) {
      lines.push('## 오류 상세');
      lines.push('');
      lines.push('| row | field | message |');
      lines.push('| ---: | --- | --- |');
      for (const item of summary.errors) {
        lines.push(`| ${item.row} | ${item.field} | ${item.message} |`);
      }
      lines.push('');
    }

    if (summary.warningCount > 0) {
      lines.push('## 경고 상세');
      lines.push('');
      lines.push('| row | field | message |');
      lines.push('| ---: | --- | --- |');
      for (const item of summary.warnings) {
        lines.push(`| ${item.row} | ${item.field} | ${item.message} |`);
      }
      lines.push('');
    }

    fs.writeFileSync(resolveFromRoot(CLI.reportMdPath), `${lines.join('\n')}\n`, 'utf8');
    console.log(`📝 Markdown 리포트 저장: ${CLI.reportMdPath}`);
  }
}

function isUnfilledRow(row) {
  const keyFields = [
    'sourceType',
    'rawText',
    'riskCategory',
    'riskSubcategory',
    'judgmentTags',
    'judgmentTagCodes',
    'recommendedAction',
  ];
  return keyFields.every((key) => normalize(row[key]) === '');
}

function main() {
  const rows = readCsvRows(CLI.input);
  const codebookRows = readCsvRows(CLI.codebook);
  const ontologyRows = readCsvRows(CLI.ontology);

  const codeSet = new Set(codebookRows.map((row) => normalize(row.tagCode)).filter(Boolean));
  const ontologySet = new Set(
    ontologyRows.map((row) => `${normalize(row.riskCategoryCode)}|${normalize(row.riskSubcategoryCode)}|${normalize(row.ontologyNodeId)}`)
  );

  const errors = [];
  const warnings = [];
  let filledRows = 0;
  let unfilledRows = 0;

  const header = rows[0] ? Object.keys(rows[0]) : [];
  for (const column of REQUIRED_COLUMNS) {
    if (!header.includes(column)) {
      errors.push({ row: 0, field: column, message: '필수 컬럼 누락' });
    }
  }

  const idSet = new Set();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNo = i + 2;

    if (isUnfilledRow(row)) {
      unfilledRows += 1;
      continue;
    }
    filledRows += 1;

    const recordId = normalize(row.recordId);
    if (!recordId) {
      errors.push({ row: rowNo, field: 'recordId', message: 'recordId 값이 비어 있음' });
    } else if (idSet.has(recordId)) {
      errors.push({ row: rowNo, field: 'recordId', message: `중복 recordId: ${recordId}` });
    } else {
      idSet.add(recordId);
    }

    for (const field of REQUIRED_COLUMNS) {
      if (!normalize(row[field])) {
        errors.push({ row: rowNo, field, message: '필수값 누락' });
      }
    }

    const sourceType = normalize(row.sourceType);
    if (sourceType && !ALLOWED.sourceType.has(sourceType)) {
      errors.push({ row: rowNo, field: 'sourceType', message: `허용되지 않은 값: ${sourceType}` });
    }

    const shiftType = normalize(row.shiftType);
    if (!ALLOWED.shiftType.has(shiftType)) {
      errors.push({ row: rowNo, field: 'shiftType', message: `허용되지 않은 값: ${shiftType}` });
    }

    const vectors = [
      'vectorTaskUnderstanding',
      'vectorHazardRecognition',
      'vectorSequenceUnderstanding',
      'vectorRiskNormalization',
      'vectorResponseCapability',
    ];

    for (const field of vectors) {
      const value = normalize(row[field]);
      if (value && !ALLOWED.vector.has(value)) {
        errors.push({ row: rowNo, field, message: `허용되지 않은 값: ${value}` });
      }
    }

    const linkedMetric = normalize(row.linkedMetric);
    if (linkedMetric && !ALLOWED.linkedMetric.has(linkedMetric)) {
      errors.push({ row: rowNo, field: 'linkedMetric', message: `허용되지 않은 지표 키: ${linkedMetric}` });
    }

    const precursorSignal = normalize(row.precursorSignal);
    if (precursorSignal && !ALLOWED.precursorSignal.has(precursorSignal)) {
      errors.push({ row: rowNo, field: 'precursorSignal', message: `허용되지 않은 값: ${precursorSignal}` });
    }

    const reviewNeeded = normalize(row.reviewNeeded);
    if (reviewNeeded && !ALLOWED.reviewNeeded.has(reviewNeeded)) {
      errors.push({ row: rowNo, field: 'reviewNeeded', message: `허용되지 않은 값: ${reviewNeeded}` });
    }
    if (reviewNeeded === 'Y' && !normalize(row.reviewer)) {
      warnings.push({ row: rowNo, field: 'reviewer', message: 'reviewNeeded=Y 이지만 reviewer가 비어 있음' });
    }

    const tags = splitSemicolon(row.judgmentTags);
    const tagCodes = splitSemicolon(row.judgmentTagCodes);

    if (tags.length !== tagCodes.length) {
      errors.push({ row: rowNo, field: 'judgmentTagCodes', message: `태그 수(${tags.length})와 코드 수(${tagCodes.length}) 불일치` });
    }

    const duplicates = tagCodes.filter((code, idx) => tagCodes.indexOf(code) !== idx);
    if (duplicates.length > 0) {
      errors.push({ row: rowNo, field: 'judgmentTagCodes', message: `중복 코드 존재: ${[...new Set(duplicates)].join(', ')}` });
    }

    for (const code of tagCodes) {
      if (!codeSet.has(code)) {
        errors.push({ row: rowNo, field: 'judgmentTagCodes', message: `코드북 미정의 코드: ${code}` });
      }
    }

    const ontologyKey = `${normalize(row.riskCategoryCode)}|${normalize(row.riskSubcategoryCode)}|${normalize(row.ontologyNodeId)}`;
    if (!ontologySet.has(ontologyKey)) {
      errors.push({ row: rowNo, field: 'ontologyNodeId', message: `온톨로지 시드 미정의 조합: ${ontologyKey}` });
    }
  }

  const status = errors.length === 0 ? 'PASS' : 'FAIL';
  const summary = {
    status,
    totalRows: rows.length,
    filledRows,
    unfilledRows,
    errorCount: errors.length,
    warningCount: warnings.length,
    errors,
    warnings,
    meta: {
      generatedAt: new Date().toISOString(),
      input: CLI.input,
      codebook: CLI.codebook,
      ontology: CLI.ontology,
    },
  };

  console.log('\n[PSI-TAG-QA] Judgment Tagging Quality Check');
  console.log(`[PSI-TAG-QA] INPUT=${CLI.input}`);
  console.log(`[PSI-TAG-QA] FILLED_ROWS=${filledRows}`);
  console.log(`[PSI-TAG-QA] UNFILLED_ROWS=${unfilledRows}`);
  console.log(`[PSI-TAG-QA] ERRORS=${errors.length}`);
  console.log(`[PSI-TAG-QA] WARNINGS=${warnings.length}`);

  if (errors.length > 0) {
    console.log('----------------------------------------');
    errors.slice(0, 30).forEach((item) => {
      console.log(`ERR row=${item.row} field=${item.field} :: ${item.message}`);
    });
    if (errors.length > 30) {
      console.log(`... (${errors.length - 30} more errors)`);
    }
  }

  if (warnings.length > 0) {
    console.log('----------------------------------------');
    warnings.slice(0, 20).forEach((item) => {
      console.log(`WARN row=${item.row} field=${item.field} :: ${item.message}`);
    });
    if (warnings.length > 20) {
      console.log(`... (${warnings.length - 20} more warnings)`);
    }
  }

  writeReports(summary);

  if (status === 'PASS') {
    console.log('[PSI-TAG-QA] RESULT=PASS');
  } else {
    console.log('[PSI-TAG-QA] RESULT=FAIL');
    process.exitCode = 1;
  }
}

main();
