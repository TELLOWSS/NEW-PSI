const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

function parseArgs(argv) {
  const options = {
    input: 'reports/judgment-tagging-quality.json',
    output: 'reports/judgment-tagging-ops-summary.md',
    date: new Date().toISOString().slice(0, 10),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') {
      options.input = String(argv[i + 1] || '').trim() || options.input;
      i += 1;
      continue;
    }
    if (arg === '--output') {
      options.output = String(argv[i + 1] || '').trim() || options.output;
      i += 1;
      continue;
    }
    if (arg === '--date') {
      options.date = String(argv[i + 1] || '').trim() || options.date;
      i += 1;
      continue;
    }
  }

  return options;
}

const CLI = parseArgs(process.argv.slice(2));

function resolve(filePath) {
  return path.resolve(root, filePath);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(resolve(filePath)), { recursive: true });
}

function readJson(filePath) {
  const target = resolve(filePath);
  if (!fs.existsSync(target)) {
    console.error(`❌ 입력 리포트가 없습니다: ${filePath}`);
    process.exit(1);
  }

  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (error) {
    console.error(`❌ JSON 파싱 실패: ${filePath}`);
    console.error(String(error.message || error));
    process.exit(1);
  }
}

function buildThreeLine(summary) {
  const status = String(summary.status || 'UNKNOWN');
  const errorCount = Number(summary.errorCount || 0);
  const warningCount = Number(summary.warningCount || 0);
  const filledRows = Number(summary.filledRows || 0);
  const unfilledRows = Number(summary.unfilledRows || 0);
  const actionItems = Array.isArray(summary.actionItems) ? summary.actionItems : [];

  const completed =
    status === 'PASS'
      ? `완료: 태깅 QA 검증 PASS (입력 ${filledRows}건, 미입력 ${unfilledRows}건, 경고 ${warningCount}건)`
      : `완료: 태깅 QA 검증 실행 (입력 ${filledRows}건, 오류 ${errorCount}건, 경고 ${warningCount}건)`;

  const next =
    actionItems.length > 0
      ? `다음: P${actionItems[0].priority} ${actionItems[0].title} (${actionItems[0].action})`
      : '다음: ACTION_TOP5 없음 — 신규 입력분 추가 후 재검증';

  const verification =
    status === 'PASS'
      ? '검증: check:judgment-tagging:report PASS'
      : `검증: check:judgment-tagging:report FAIL (오류 ${errorCount}건)`;

  return { completed, next, verification };
}

function main() {
  const summary = readJson(CLI.input);
  const lines3 = buildThreeLine(summary);
  const actionItems = Array.isArray(summary.actionItems) ? summary.actionItems : [];

  const mdLines = [
    '# PSI 태깅 QA OPS 3줄 요약',
    '',
    `- generatedAt: ${new Date().toISOString()}`,
    `- date: ${CLI.date}`,
    `- source: ${CLI.input}`,
    '',
    '## 운영 3줄',
    '',
    `- ${lines3.completed}`,
    `- ${lines3.next}`,
    `- ${lines3.verification}`,
    '',
  ];

  if (actionItems.length > 0) {
    mdLines.push('## ACTION_TOP5');
    mdLines.push('');
    mdLines.push('| priority | source | count | title | action |');
    mdLines.push('| ---: | --- | ---: | --- | --- |');
    actionItems.forEach((item) => {
      mdLines.push(`| ${item.priority} | ${item.source} | ${item.count} | ${item.title} | ${item.action} |`);
    });
    mdLines.push('');
  }

  ensureDir(CLI.output);
  fs.writeFileSync(resolve(CLI.output), `${mdLines.join('\n')}\n`, 'utf8');

  console.log('\n[PSI-TAG-OPS] OPS Summary Generated');
  console.log(`[PSI-TAG-OPS] OUTPUT=${CLI.output}`);
  console.log(`[PSI-TAG-OPS] ${lines3.completed}`);
  console.log(`[PSI-TAG-OPS] ${lines3.next}`);
  console.log(`[PSI-TAG-OPS] ${lines3.verification}`);
}

main();
