const fs = require('fs');
const path = require('path');

const DEFAULT_JOURNAL = 'UPGRADE_STORY_OPERATIONS_JOURNAL_2026-04-22.md';
const SECTION_TITLE = '## 8) 일자별 스토리 로그';
const DEFAULT_BACKFILL_REPORT = 'reports/backfill-readiness.json';
const DEFAULT_SCORE_REPORT = 'reports/score-consistency-strict8.json';
const DEFAULT_POLICY_REPORT = 'reports/policy-impact.json';
const DEFAULT_METRIC_HISTORY = 'reports/story-metrics-history.json';

function parseArgs(argv) {
  const args = {
    date: '',
    change: '',
    impact: '',
    next: '',
    journal: DEFAULT_JOURNAL,
    autoFromReports: false,
    autoDelta: true,
    backfillReport: DEFAULT_BACKFILL_REPORT,
    scoreReport: DEFAULT_SCORE_REPORT,
    policyReport: DEFAULT_POLICY_REPORT,
    metricHistory: DEFAULT_METRIC_HISTORY,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!value) continue;

    if (key === '--date') {
      args.date = String(value).trim();
      i += 1;
      continue;
    }
    if (key === '--change') {
      args.change = String(value).trim();
      i += 1;
      continue;
    }
    if (key === '--impact') {
      args.impact = String(value).trim();
      i += 1;
      continue;
    }
    if (key === '--next') {
      args.next = String(value).trim();
      i += 1;
      continue;
    }
    if (key === '--journal') {
      args.journal = String(value).trim() || DEFAULT_JOURNAL;
      i += 1;
      continue;
    }
    if (key === '--backfill-report') {
      args.backfillReport = String(value).trim() || DEFAULT_BACKFILL_REPORT;
      i += 1;
      continue;
    }
    if (key === '--score-report') {
      args.scoreReport = String(value).trim() || DEFAULT_SCORE_REPORT;
      i += 1;
      continue;
    }
    if (key === '--policy-report') {
      args.policyReport = String(value).trim() || DEFAULT_POLICY_REPORT;
      i += 1;
      continue;
    }
    if (key === '--metric-history') {
      args.metricHistory = String(value).trim() || DEFAULT_METRIC_HISTORY;
      i += 1;
      continue;
    }
    if (key === '--auto-from-reports') {
      args.autoFromReports = true;
      continue;
    }
    if (key === '--no-delta') {
      args.autoDelta = false;
      continue;
    }
  }

  return args;
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readMetricHistory(historyPath) {
  const payload = readJsonSafe(historyPath);
  if (!payload || !Array.isArray(payload.entries)) {
    return { entries: [] };
  }
  return payload;
}

function writeMetricHistory(historyPath, payload) {
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function collectAutoMetrics(args) {
  const backfillPath = path.resolve(process.cwd(), args.backfillReport || DEFAULT_BACKFILL_REPORT);
  const scorePath = path.resolve(process.cwd(), args.scoreReport || DEFAULT_SCORE_REPORT);
  const policyPath = path.resolve(process.cwd(), args.policyReport || DEFAULT_POLICY_REPORT);

  const backfill = readJsonSafe(backfillPath);
  const score = readJsonSafe(scorePath);
  const policy = readJsonSafe(policyPath);

  return {
    backfill: {
      totalRecords: toNumber(backfill && backfill.meta && backfill.meta.totalRecords, null),
      noOcrNeededRate: toNumber(backfill && backfill.readiness && backfill.readiness.noOcrNeededRate, null),
      ocrRequiredRate: toNumber(backfill && backfill.readiness && backfill.readiness.ocrRequiredRate, null),
      savingsRate: toNumber(backfill && backfill.costEstimate && backfill.costEstimate.savingsRate, null),
    },
    score: {
      status: String((score && score.status) || '').toUpperCase() || null,
      pairCount: toNumber(score && score.pairCount, null),
      maxGap: toNumber(score && score.thresholds && score.thresholds.maxGap, null),
    },
    policy: {
      averageDelta: toNumber(policy && policy.summary && policy.summary.averageDelta, null),
      operationalPenaltyAppliedRate: toNumber(policy && policy.summary && policy.summary.operationalPenaltyAppliedRate, null),
    },
  };
}

function asSigned(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return null;
  const fixed = Number(value).toFixed(digits);
  return Number(value) > 0 ? `+${fixed}` : fixed;
}

function buildDeltaText(currentMetrics, previousMetrics) {
  if (!previousMetrics) {
    return '전일대비 기준점 없음(이번 실행을 기준점으로 저장)';
  }

  const deltas = [];

  const savingsDelta = toNumber(currentMetrics.backfill.savingsRate, null) - toNumber(previousMetrics.backfill && previousMetrics.backfill.savingsRate, 0);
  if (Number.isFinite(savingsDelta)) {
    deltas.push(`절감률 ${asSigned(savingsDelta)}%p`);
  }

  const ocrDelta = toNumber(currentMetrics.backfill.ocrRequiredRate, null) - toNumber(previousMetrics.backfill && previousMetrics.backfill.ocrRequiredRate, 0);
  if (Number.isFinite(ocrDelta)) {
    deltas.push(`OCR_REQUIRED ${asSigned(ocrDelta)}%p`);
  }

  const pairDelta = toNumber(currentMetrics.score.pairCount, null) - toNumber(previousMetrics.score && previousMetrics.score.pairCount, 0);
  if (Number.isFinite(pairDelta)) {
    deltas.push(`비교쌍 ${asSigned(pairDelta, 0)}건`);
  }

  const policyDelta = toNumber(currentMetrics.policy.averageDelta, null) - toNumber(previousMetrics.policy && previousMetrics.policy.averageDelta, 0);
  if (Number.isFinite(policyDelta)) {
    deltas.push(`정책 평균Δ ${asSigned(policyDelta)}`);
  }

  const prevStatus = String((previousMetrics.score && previousMetrics.score.status) || '').toUpperCase();
  const currStatus = String(currentMetrics.score.status || '').toUpperCase();
  if (currStatus || prevStatus) {
    deltas.push(`strict8 ${prevStatus || '-'}→${currStatus || '-'}`);
  }

  return deltas.length > 0 ? `전일대비 ${deltas.join(', ')}` : '전일대비 변화 계산 불가';
}

function autoImpactFromReports(args) {
  const metrics = collectAutoMetrics(args);

  const historyPath = path.resolve(process.cwd(), args.metricHistory || DEFAULT_METRIC_HISTORY);
  const history = readMetricHistory(historyPath);
  const previous = history.entries.length > 0 ? history.entries[history.entries.length - 1] : null;

  history.entries.push({
    timestamp: new Date().toISOString(),
    date: args.date || getTodayKst(),
    backfill: metrics.backfill,
    score: metrics.score,
    policy: metrics.policy,
  });
  writeMetricHistory(historyPath, history);

  const impactTokens = [];

  {
    const total = toNumber(metrics.backfill.totalRecords, 0);
    const noOcrRate = toNumber(metrics.backfill.noOcrNeededRate, null);
    const ocrRate = toNumber(metrics.backfill.ocrRequiredRate, null);
    const savingsRate = toNumber(metrics.backfill.savingsRate, null);

    const backfillSummary = [
      total !== null ? `백필 ${total}건` : null,
      noOcrRate !== null ? `NO_OCR ${noOcrRate}%` : null,
      ocrRate !== null ? `OCR_REQUIRED ${ocrRate}%` : null,
      savingsRate !== null ? `절감률 ${savingsRate}%` : null,
    ]
      .filter(Boolean)
      .join(', ');

    if (backfillSummary) {
      impactTokens.push(backfillSummary);
    }
  }

  {
    const status = String(metrics.score.status || '').toUpperCase();
    const pairCount = toNumber(metrics.score.pairCount, null);
    const maxGap = toNumber(metrics.score.maxGap, null);
    const scoreSummary = [
      status ? `strict8 ${status}` : null,
      pairCount !== null ? `비교쌍 ${pairCount}` : null,
      maxGap !== null ? `허용편차 ±${maxGap}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    if (scoreSummary) {
      impactTokens.push(scoreSummary);
    }
  }

  {
    const delta = toNumber(metrics.policy.averageDelta, null);
    const appliedRate = toNumber(metrics.policy.operationalPenaltyAppliedRate, null);
    const policySummary = [
      delta !== null ? `정책 평균Δ ${delta}` : null,
      appliedRate !== null ? `운영패널티 적용률 ${appliedRate}%` : null,
    ]
      .filter(Boolean)
      .join(', ');
    if (policySummary) {
      impactTokens.push(policySummary);
    }
  }

  if (impactTokens.length === 0) {
    return '자동 집계 리포트가 없어 영향 수치를 생성하지 못함(수동 입력 필요)';
  }

  if (args.autoDelta !== false) {
    impactTokens.push(buildDeltaText(metrics, previous));
  }

  return impactTokens.join(' | ');
}

function autoNextFromBackfill(args) {
  const backfillPath = path.resolve(process.cwd(), args.backfillReport || DEFAULT_BACKFILL_REPORT);
  const backfill = readJsonSafe(backfillPath);
  const ocrRequired = toNumber(backfill && backfill.readiness && backfill.readiness.ocrRequired, 0);
  if (ocrRequired > 0) {
    return `OCR_REQUIRED ${ocrRequired}건 상위군 배치 OCR 처리 및 재측정`;
  }
  return '실데이터 투입 후 OCR_REQUIRED 발생 구간 재점검';
}

function getTodayKst() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function ensureSection(text) {
  if (text.includes(SECTION_TITLE)) {
    return text;
  }

  const suffix = [
    '',
    '---',
    '',
    SECTION_TITLE,
    '',
    '_아직 기록 없음. 아래 명령으로 첫 로그를 추가하세요._',
    '',
    '- `npm run log:story -- --date 2026-04-22 --change "무엇을 바꿨는가" --impact "비용/품질/재현성 영향" --next "내일 첫 작업"`',
    '',
  ].join('\n');

  return `${text.trimEnd()}\n${suffix}`;
}

function buildEntry({ date, change, impact, next }) {
  return [
    `### ${date}`,
    `- 변경: ${change}`,
    `- 영향: ${impact}`,
    `- 다음: ${next}`,
    '',
  ].join('\n');
}

function appendEntry(text, entry) {
  const lines = text
    .split('\n')
    .filter(
      (line) =>
        line.trim() !== '_아직 기록 없음. 아래 명령으로 첫 로그를 추가하세요._' &&
        !line.includes('npm run log:story -- --date 2026-04-22 --change')
    );
  const sectionIndex = lines.findIndex((line) => line.trim() === SECTION_TITLE);
  if (sectionIndex === -1) {
    return `${text.trimEnd()}\n\n${SECTION_TITLE}\n\n${entry}`;
  }

  const insertIndex = lines.length;
  const output = [...lines.slice(0, insertIndex), entry.trimEnd(), '', ...lines.slice(insertIndex)];
  return `${output.join('\n').replace(/\n{3,}$/g, '\n\n')}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date || getTodayKst();
  const change = args.change || (args.autoFromReports ? '운영 리포트 자동 집계 로그 추가' : '');
  const impact = args.impact || (args.autoFromReports ? autoImpactFromReports(args) : '');
  const next = args.next || (args.autoFromReports ? autoNextFromBackfill(args) : '');

  if (!change || !impact || !next) {
    console.error('❌ 필수 인자 누락: --change, --impact, --next');
    console.error('예시: npm run log:story -- --date 2026-04-22 --change "분류 규칙 보정" --impact "재현성 유지" --next "실데이터 재실행"');
    console.error('자동집계: npm run log:story -- --auto-from-reports --date 2026-04-22 --change "오늘 변경" --next "내일 첫 작업"');
    process.exit(1);
  }

  const journalPath = path.resolve(process.cwd(), args.journal || DEFAULT_JOURNAL);
  if (!fs.existsSync(journalPath)) {
    console.error(`❌ 운영일지 파일을 찾지 못했습니다: ${journalPath}`);
    process.exit(1);
  }

  const original = fs.readFileSync(journalPath, 'utf8');
  const withSection = ensureSection(original);
  const entry = buildEntry({ date, change, impact, next });
  const updated = appendEntry(withSection, entry);

  fs.writeFileSync(journalPath, `${updated.trimEnd()}\n`, 'utf8');

  console.log('=== 스토리 로그 추가 완료 ===');
  console.log(`파일: ${args.journal || DEFAULT_JOURNAL}`);
  console.log(`날짜: ${date}`);
  console.log(`변경: ${change}`);
  console.log(`영향: ${impact}`);
  console.log(`다음: ${next}`);
}

main();
