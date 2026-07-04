const fs = require('fs');
const path = require('path');

const root = process.cwd();

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) return fallback;
  return args[index + 1];
};

const inputPath = path.resolve(root, readArg('--input', path.join('templates', 'psi_field_validation_before_after_2026-07-04.csv')));
const outputMdPath = path.resolve(root, readArg('--output-md', path.join('reports', 'field-validation-feedback-report.md')));
const outputJsonPath = path.resolve(root, readArg('--output-json', path.join('reports', 'field-validation-feedback-report.json')));

const parseCsvLine = (line) => {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
};

const parseCsv = (csv) => {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || '';
      row.__rowNumber = String(rowIndex + 2);
      return row;
    }, {});
  });
};

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const formatNumber = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '';
  return String(Math.round(Number(value) * 100) / 100);
};

const average = (values) => {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
};

const isImprovedStatus = (before, after) => {
  const rank = {
    '': 0,
    미확인: 1,
    보완필요: 2,
    준비중: 3,
    반영완료: 4,
    전달완료: 5,
  };
  return (rank[after] || 0) > (rank[before] || 0);
};

const escapeMd = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

if (!fs.existsSync(inputPath)) {
  console.error(`[field-validation-feedback] input not found: ${inputPath}`);
  process.exit(1);
}

const rows = parseCsv(fs.readFileSync(inputPath, 'utf8'));
const details = rows.map((row) => {
  const beforeScore = toNumberOrNull(row.beforeScore);
  const afterScore = toNumberOrNull(row.afterScore);
  const beforeCompetency = toNumberOrNull(row.beforeCompetencyWeightedScore);
  const afterCompetency = toNumberOrNull(row.afterCompetencyWeightedScore);
  const scoreDelta = beforeScore === null || afterScore === null ? null : afterScore - beforeScore;
  const competencyDelta = beforeCompetency === null || afterCompetency === null ? null : afterCompetency - beforeCompetency;
  const completed = Boolean(
    (row.recordId || row.workerName)
      && beforeScore !== null
      && afterScore !== null
      && beforeCompetency !== null
      && afterCompetency !== null
  );

  return {
    rowNumber: Number(row.__rowNumber),
    sample: row.sample || '',
    nationality: row.nationality || '',
    formVersion: row.formVersion || '',
    recordId: row.recordId || '',
    workerName: row.workerName || '',
    jobField: row.jobField || '',
    managerEditField: row.managerEditField || '',
    beforeScore,
    afterScore,
    scoreDelta,
    beforeNativeGuidanceStatus: row.beforeNativeGuidanceStatus || '',
    afterNativeGuidanceStatus: row.afterNativeGuidanceStatus || '',
    nativeGuidanceImproved: isImprovedStatus(row.beforeNativeGuidanceStatus || '', row.afterNativeGuidanceStatus || ''),
    beforeCompetencyWeightedScore: beforeCompetency,
    afterCompetencyWeightedScore: afterCompetency,
    competencyDelta,
    beforeApprovalReadiness: row.beforeApprovalReadiness || '',
    afterApprovalReadiness: row.afterApprovalReadiness || '',
    approvalChanged: (row.beforeApprovalReadiness || '') !== (row.afterApprovalReadiness || ''),
    evidenceFile: row.evidenceFile || '',
    note: row.note || '',
    completed,
  };
});

const completedRows = details.filter((row) => row.completed);
const summary = {
  generatedAt: new Date().toISOString(),
  input: path.relative(root, inputPath).replace(/\\/g, '/'),
  totalRows: details.length,
  completedRows: completedRows.length,
  averageScoreDelta: average(completedRows.map((row) => row.scoreDelta).filter((value) => value !== null)),
  averageCompetencyDelta: average(completedRows.map((row) => row.competencyDelta).filter((value) => value !== null)),
  nativeGuidanceImproved: completedRows.filter((row) => row.nativeGuidanceImproved).length,
  approvalChanged: completedRows.filter((row) => row.approvalChanged).length,
};

const jsonReport = {
  summary,
  details,
};

const summaryRows = [
  ['전체 행', summary.totalRows],
  ['입력 완료 행', summary.completedRows],
  ['평균 분석점수 변화', formatNumber(summary.averageScoreDelta)],
  ['평균 개인 안전역량 변화', formatNumber(summary.averageCompetencyDelta)],
  ['모국어 안내 개선 건', summary.nativeGuidanceImproved],
  ['승인 준비도 변경 건', summary.approvalChanged],
];

const detailHeader = [
  '샘플',
  '국적',
  '수정 항목',
  '분석점수 전',
  '분석점수 후',
  '점수 변화',
  '모국어 안내 전',
  '모국어 안내 후',
  '안전역량 전',
  '안전역량 후',
  '역량 변화',
  '승인 준비도',
  '비고',
];

const md = [
  '# PSI 현장 검증 전후 환류표',
  '',
  `생성일: ${summary.generatedAt}`,
  `입력 파일: \`${summary.input}\``,
  '',
  '## 요약',
  '',
  '| 항목 | 값 |',
  '|---|---:|',
  ...summaryRows.map(([label, value]) => `| ${escapeMd(label)} | ${escapeMd(value)} |`),
  '',
  '## 전후 비교표',
  '',
  `| ${detailHeader.join(' | ')} |`,
  `| ${detailHeader.map(() => '---').join(' | ')} |`,
  ...details.map((row) => {
    const approval = `${row.beforeApprovalReadiness || ''} -> ${row.afterApprovalReadiness || ''}`.trim();
    return [
      row.sample,
      row.nationality,
      row.managerEditField,
      formatNumber(row.beforeScore),
      formatNumber(row.afterScore),
      formatNumber(row.scoreDelta),
      row.beforeNativeGuidanceStatus,
      row.afterNativeGuidanceStatus,
      formatNumber(row.beforeCompetencyWeightedScore),
      formatNumber(row.afterCompetencyWeightedScore),
      formatNumber(row.competencyDelta),
      approval === '->' ? '' : approval,
      row.note,
    ].map(escapeMd).join(' | ');
  }).map((line) => `| ${line} |`),
  '',
  '## 사용 방법',
  '',
  '1. OCR 분석 결과에서 관리자 수정 전 값을 CSV의 before 항목에 적습니다.',
  '2. 관리자 검증 후 한국어 보호 해석, 모국어 안내 상태, 개인 안전역량 점수를 after 항목에 적습니다.',
  '3. 이 명령을 실행하면 표와 JSON 리포트가 다시 생성됩니다: `npm run report:field-validation-feedback`',
  '4. 생성된 표는 바이어 설명, 월별 검증회의, 다음 OCR 품질 개선 근거로 사용합니다.',
  '',
].join('\n');

fs.mkdirSync(path.dirname(outputMdPath), { recursive: true });
fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
fs.writeFileSync(outputMdPath, md, 'utf8');
fs.writeFileSync(outputJsonPath, `${JSON.stringify(jsonReport, null, 2)}\n`, 'utf8');

console.log('[field-validation-feedback] report generated');
console.log(`- markdown: ${path.relative(root, outputMdPath)}`);
console.log(`- json: ${path.relative(root, outputJsonPath)}`);
