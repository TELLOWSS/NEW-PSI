const fs = require('node:fs');
const path = require('node:path');
const xlsx = require('xlsx');

const root = process.cwd();

function parseArgs(argv) {
  const options = {
    tracker: 'templates/psi_judgment_tagging_progress_tracker_100_v1_2026-05-16.csv',
    opsSummary: 'reports/judgment-tagging-ops-summary.md',
    output: 'reports/judgment-tagging-r1-closeout.md',
    round: 'R1',
    date: new Date().toISOString().slice(0, 10),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tracker') {
      options.tracker = String(argv[i + 1] || '').trim() || options.tracker;
      i += 1;
      continue;
    }
    if (arg === '--ops-summary') {
      options.opsSummary = String(argv[i + 1] || '').trim() || options.opsSummary;
      i += 1;
      continue;
    }
    if (arg === '--output') {
      options.output = String(argv[i + 1] || '').trim() || options.output;
      i += 1;
      continue;
    }
    if (arg === '--round') {
      options.round = String(argv[i + 1] || '').trim() || options.round;
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

function normalize(value) {
  return String(value ?? '').trim();
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(resolve(filePath)), { recursive: true });
}

function readCsvRows(filePath) {
  const target = resolve(filePath);
  if (!fs.existsSync(target)) {
    console.error(`❌ tracker 파일이 없습니다: ${filePath}`);
    process.exit(1);
  }

  const workbook = xlsx.readFile(target, { raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet, { defval: '' });
}

function readOpsSummary(filePath) {
  const target = resolve(filePath);
  if (!fs.existsSync(target)) {
    return [];
  }

  const text = fs.readFileSync(target, 'utf8');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- 완료:') || line.startsWith('- 다음:') || line.startsWith('- 검증:'));
}

function summarizeRound(rows, round) {
  const targets = rows.filter((row) => normalize(row.round) === round);
  const total = targets.length;

  const byStatus = {
    notStarted: 0,
    inProgress: 0,
    tagged: 0,
    consensusDone: 0,
    qaPass: 0,
  };

  for (const row of targets) {
    const status = normalize(row.status).toLowerCase();
    const consensus = normalize(row.consensusStatus).toLowerCase();
    const qa = normalize(row.qaStatus).toLowerCase();

    if (!status || status === 'not-started') byStatus.notStarted += 1;
    if (status === 'in-progress') byStatus.inProgress += 1;
    if (status === 'tagged' || status === 'completed') byStatus.tagged += 1;
    if (consensus === 'done' || consensus === 'agreed' || consensus === 'completed') byStatus.consensusDone += 1;
    if (qa === 'pass' || qa === 'done' || qa === 'completed') byStatus.qaPass += 1;
  }

  return {
    total,
    ...byStatus,
  };
}

function buildThreeLines(stats, opsLines, round) {
  const completion =
    stats.qaPass >= stats.total && stats.total > 0
      ? `${round} ${stats.total}건 태깅/합의/QA 완료`
      : `${round} 진행중 (총 ${stats.total}건, QA PASS ${stats.qaPass}건)`;

  const next =
    stats.qaPass >= stats.total && stats.total > 0
      ? `${round} 종료, 다음 라운드 착수 준비`
      : `${round} 미완료 건 우선 정리 후 check:judgment-tagging:full 재실행`;

  const verification = opsLines.find((line) => line.startsWith('- 검증:')) || '- 검증: check:judgment-tagging:full 결과 확인 필요';

  return {
    completed: `- 완료: ${completion}`,
    next: `- 다음: ${next}`,
    verification,
  };
}

function main() {
  const rows = readCsvRows(CLI.tracker);
  const opsLines = readOpsSummary(CLI.opsSummary);
  const stats = summarizeRound(rows, CLI.round);
  const lines3 = buildThreeLines(stats, opsLines, CLI.round);

  const md = [
    `# PSI ${CLI.round} 종료 템플릿`,
    '',
    `- generatedAt: ${new Date().toISOString()}`,
    `- date: ${CLI.date}`,
    `- round: ${CLI.round}`,
    `- tracker: ${CLI.tracker}`,
    `- opsSummary: ${CLI.opsSummary}`,
    '',
    '## 라운드 상태',
    '',
    `- total: ${stats.total}`,
    `- notStarted: ${stats.notStarted}`,
    `- inProgress: ${stats.inProgress}`,
    `- tagged: ${stats.tagged}`,
    `- consensusDone: ${stats.consensusDone}`,
    `- qaPass: ${stats.qaPass}`,
    '',
    '## OPS 3줄 (복사용)',
    '',
    lines3.completed,
    lines3.next,
    lines3.verification,
    '',
  ].join('\n');

  ensureDir(CLI.output);
  fs.writeFileSync(resolve(CLI.output), `${md}\n`, 'utf8');

  console.log('\n[PSI-TAG-R1] Closeout Template Generated');
  console.log(`[PSI-TAG-R1] OUTPUT=${CLI.output}`);
  console.log(`[PSI-TAG-R1] ${lines3.completed}`);
  console.log(`[PSI-TAG-R1] ${lines3.next}`);
  console.log(`[PSI-TAG-R1] ${lines3.verification}`);
}

main();
