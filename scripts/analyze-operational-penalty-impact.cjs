const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  input: 'reports/records-export.json',
  outputJson: 'reports/policy-impact.json',
  outputMd: 'reports/policy-impact.md',
  maxPenalty: 20,
};

function parseArgs(argv) {
  const options = {
    input: DEFAULTS.input,
    outputJson: DEFAULTS.outputJson,
    outputMd: DEFAULTS.outputMd,
    maxPenalty: DEFAULTS.maxPenalty,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') {
      options.input = String(argv[i + 1] || '').trim() || options.input;
      i += 1;
      continue;
    }
    if (arg === '--output-json') {
      options.outputJson = String(argv[i + 1] || '').trim() || options.outputJson;
      i += 1;
      continue;
    }
    if (arg === '--output-md') {
      options.outputMd = String(argv[i + 1] || '').trim() || options.outputMd;
      i += 1;
      continue;
    }
    if (arg === '--max-penalty') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) options.maxPenalty = Math.round(value);
      i += 1;
    }
  }

  return options;
}

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeMetric(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeBreakdown(scoreBreakdown) {
  if (!scoreBreakdown || typeof scoreBreakdown !== 'object') return null;
  const source = scoreBreakdown;
  return {
    psychological: normalizeMetric(source.psychological, 0, 10),
    jobUnderstanding: normalizeMetric(source.jobUnderstanding, 0, 20),
    riskAssessmentUnderstanding: normalizeMetric(source.riskAssessmentUnderstanding, 0, 20),
    proficiency: normalizeMetric(source.proficiency, 0, 30),
    improvementExecution: normalizeMetric(source.improvementExecution, 0, 20),
    repeatViolationPenalty: normalizeMetric(source.repeatViolationPenalty, 0, 30),
  };
}

function computeBaseFiveScore(breakdown, fallbackSafetyScore) {
  if (!breakdown) {
    return clampScore(fallbackSafetyScore);
  }
  return clampScore(
    breakdown.psychological +
    breakdown.jobUnderstanding +
    breakdown.riskAssessmentUnderstanding +
    breakdown.proficiency +
    breakdown.improvementExecution
  );
}

function textContainsViolationSignal(text) {
  return /위반|미준수|미착용|무단|통제선\s*미준수|안전대\s*미체결|재발|반려|승인\s*차단|불이행/i.test(String(text || ''));
}

function inferOperationalPenalty(record, maxPenalty) {
  let score = 0;
  const reasons = [];

  const scoreAdjustmentHistory = Array.isArray(record.scoreAdjustmentHistory) ? record.scoreAdjustmentHistory : [];
  const behaviorAdjustments = scoreAdjustmentHistory.filter((entry) => String(entry.reasonCode || '') === 'BEHAVIOR_NON_COMPLIANCE');
  if (behaviorAdjustments.length > 0) {
    const add = Math.min(8, behaviorAdjustments.length * 4);
    score += add;
    reasons.push(`행동불이행 점수조정 ${behaviorAdjustments.length}건(+${add})`);
  }

  const actionHistory = Array.isArray(record.actionHistory) ? record.actionHistory : [];
  const violationActions = actionHistory.filter((entry) => textContainsViolationSignal(`${entry.actionType || ''} ${entry.detail || ''}`));
  if (violationActions.length > 0) {
    const add = Math.min(6, violationActions.length * 3);
    score += add;
    reasons.push(`조치이력 내 규율위반 신호 ${violationActions.length}건(+${add})`);
  }

  const auditTrail = Array.isArray(record.auditTrail) ? record.auditTrail : [];
  const violationAudits = auditTrail.filter((entry) => textContainsViolationSignal(entry.note || ''));
  if (violationAudits.length > 0) {
    const add = Math.min(6, violationAudits.length * 2);
    score += add;
    reasons.push(`감사로그 내 규율위반 신호 ${violationAudits.length}건(+${add})`);
  }

  if (String(record.reviewStatus || '').toUpperCase() === 'REJECTED') {
    score += 6;
    reasons.push('관리자 리뷰 반려 이력(+6)');
  }

  const approvalHistory = Array.isArray(record.approvalHistory) ? record.approvalHistory : [];
  const rejectedApprovals = approvalHistory.filter((entry) => String(entry.status || '').toLowerCase() === 'rejected');
  if (rejectedApprovals.length > 0) {
    const add = Math.min(4, rejectedApprovals.length * 2);
    score += add;
    reasons.push(`승인 이력 반려 ${rejectedApprovals.length}건(+${add})`);
  }

  const capped = Math.max(0, Math.min(maxPenalty, Math.round(score)));
  return {
    penalty: capped,
    reasons,
  };
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values) {
  if (values.length < 2) return 0;
  const mean = avg(values);
  const variance = avg(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function extractRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.workerRecords)) return payload.workerRecords;
  if (payload && Array.isArray(payload.records)) return payload.records;
  if (payload && payload.data && Array.isArray(payload.data.workerRecords)) return payload.data.workerRecords;
  return [];
}

function buildComparison(records, maxPenalty) {
  const normalized = records.map((record, index) => {
    const breakdown = normalizeBreakdown(record.scoreBreakdown);
    const baseFiveScore = computeBaseFiveScore(breakdown, record.safetyScore);
    const legacyTextPenalty = breakdown ? breakdown.repeatViolationPenalty : 0;
    const legacyFinalScore = clampScore(
      Number.isFinite(Number(record.safetyScore)) ? Number(record.safetyScore) : baseFiveScore - legacyTextPenalty
    );

    const operational = inferOperationalPenalty(record, maxPenalty);
    const proposedFinalScore = clampScore(baseFiveScore - operational.penalty);

    return {
      id: String(record.id || `row-${index + 1}`),
      name: String(record.name || '미상'),
      nationality: String(record.nationality || '미상'),
      jobField: String(record.jobField || '미분류'),
      teamLeader: String(record.teamLeader || '미지정'),
      date: String(record.date || ''),
      baseFiveScore,
      legacyTextPenalty,
      legacyFinalScore,
      operationalPenalty: operational.penalty,
      operationalPenaltyReasons: operational.reasons,
      proposedFinalScore,
      delta: proposedFinalScore - legacyFinalScore,
      reviewStatus: String(record.reviewStatus || ''),
      approvalStatus: String(record.approvalStatus || ''),
    };
  });

  const legacyScores = normalized.map((item) => item.legacyFinalScore);
  const proposedScores = normalized.map((item) => item.proposedFinalScore);

  const byJobField = {};
  for (const row of normalized) {
    if (!byJobField[row.jobField]) byJobField[row.jobField] = [];
    byJobField[row.jobField].push(row);
  }

  const jobFieldSummary = Object.entries(byJobField).map(([jobField, items]) => ({
    jobField,
    count: items.length,
    legacyAvg: Number(avg(items.map((item) => item.legacyFinalScore)).toFixed(2)),
    proposedAvg: Number(avg(items.map((item) => item.proposedFinalScore)).toFixed(2)),
    legacyStdDev: Number(stddev(items.map((item) => item.legacyFinalScore)).toFixed(2)),
    proposedStdDev: Number(stddev(items.map((item) => item.proposedFinalScore)).toFixed(2)),
    avgDelta: Number(avg(items.map((item) => item.delta)).toFixed(2)),
  })).sort((a, b) => b.count - a.count);

  const approvalRejected = normalized.filter((item) => item.reviewStatus.toUpperCase() === 'REJECTED' || item.approvalStatus.toUpperCase() === 'REJECTED');
  const approvalApproved = normalized.filter((item) => item.reviewStatus.toUpperCase() === 'APPROVED' || item.approvalStatus.toUpperCase() === 'APPROVED');

  const topPenalty = [...normalized]
    .filter((item) => item.operationalPenalty > 0)
    .sort((a, b) => b.operationalPenalty - a.operationalPenalty)
    .slice(0, 10);

  const topDelta = [...normalized]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 10);

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      totalRecords: normalized.length,
      maxPenalty,
    },
    summary: {
      legacyAverage: Number(avg(legacyScores).toFixed(2)),
      proposedAverage: Number(avg(proposedScores).toFixed(2)),
      averageDelta: Number(avg(normalized.map((item) => item.delta)).toFixed(2)),
      legacyStdDev: Number(stddev(legacyScores).toFixed(2)),
      proposedStdDev: Number(stddev(proposedScores).toFixed(2)),
      operationalPenaltyAppliedCount: normalized.filter((item) => item.operationalPenalty > 0).length,
      operationalPenaltyAppliedRate: Number(((normalized.filter((item) => item.operationalPenalty > 0).length / Math.max(1, normalized.length)) * 100).toFixed(2)),
      rejectedGroupAvgLegacy: Number(avg(approvalRejected.map((item) => item.legacyFinalScore)).toFixed(2)),
      rejectedGroupAvgProposed: Number(avg(approvalRejected.map((item) => item.proposedFinalScore)).toFixed(2)),
      approvedGroupAvgLegacy: Number(avg(approvalApproved.map((item) => item.legacyFinalScore)).toFixed(2)),
      approvedGroupAvgProposed: Number(avg(approvalApproved.map((item) => item.proposedFinalScore)).toFixed(2)),
    },
    jobFieldSummary,
    topPenalty,
    topDelta,
    rows: normalized,
  };
}

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function writeMarkdown(reportPath, result, sourcePath) {
  const lines = [];
  lines.push('# 운영 패널티 전환 실증 리포트');
  lines.push('');
  lines.push(`- 생성시각(UTC): ${result.meta.generatedAt}`);
  lines.push(`- 입력 데이터: ${sourcePath}`);
  lines.push(`- 총 레코드: ${result.meta.totalRecords}`);
  lines.push(`- 운영 패널티 상한: ${result.meta.maxPenalty}`);
  lines.push('');
  lines.push('## 핵심 요약');
  lines.push('');
  lines.push(`- Legacy 평균점수: ${result.summary.legacyAverage}`);
  lines.push(`- Proposed 평균점수: ${result.summary.proposedAverage}`);
  lines.push(`- 평균 변화(Δ): ${result.summary.averageDelta}`);
  lines.push(`- Legacy 표준편차: ${result.summary.legacyStdDev}`);
  lines.push(`- Proposed 표준편차: ${result.summary.proposedStdDev}`);
  lines.push(`- 운영 패널티 적용률: ${result.summary.operationalPenaltyAppliedRate}% (${result.summary.operationalPenaltyAppliedCount}건)`);
  lines.push('');
  lines.push('## 승인상태 분리도');
  lines.push('');
  lines.push(`- 반려군 Legacy 평균: ${result.summary.rejectedGroupAvgLegacy}`);
  lines.push(`- 반려군 Proposed 평균: ${result.summary.rejectedGroupAvgProposed}`);
  lines.push(`- 승인군 Legacy 평균: ${result.summary.approvedGroupAvgLegacy}`);
  lines.push(`- 승인군 Proposed 평균: ${result.summary.approvedGroupAvgProposed}`);
  lines.push('');
  lines.push('## 공종별 변동성');
  lines.push('');
  lines.push('| 공종 | 건수 | Legacy 평균 | Proposed 평균 | Legacy 표준편차 | Proposed 표준편차 | 평균Δ |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const row of result.jobFieldSummary) {
    lines.push(`| ${row.jobField} | ${row.count} | ${row.legacyAvg} | ${row.proposedAvg} | ${row.legacyStdDev} | ${row.proposedStdDev} | ${row.avgDelta} |`);
  }
  lines.push('');
  lines.push('## 운영 패널티 상위 10건');
  lines.push('');
  lines.push('| ID | 이름 | 공종 | 운영패널티 | 근거 |');
  lines.push('| --- | --- | --- | ---: | --- |');
  for (const row of result.topPenalty) {
    lines.push(`| ${row.id} | ${row.name} | ${row.jobField} | ${row.operationalPenalty} | ${row.operationalPenaltyReasons.join(' / ') || '-'} |`);
  }
  lines.push('');
  lines.push('## 점수 변화 상위 10건 (절대값 기준)');
  lines.push('');
  lines.push('| ID | 이름 | 공종 | Legacy | Proposed | Δ |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: |');
  for (const row of result.topDelta) {
    lines.push(`| ${row.id} | ${row.name} | ${row.jobField} | ${row.legacyFinalScore} | ${row.proposedFinalScore} | ${row.delta} |`);
  }

  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(process.cwd(), opts.input);
  const outputJsonPath = path.resolve(process.cwd(), opts.outputJson);
  const outputMdPath = path.resolve(process.cwd(), opts.outputMd);

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ 입력 파일이 없습니다: ${opts.input}`);
    console.error('   - 위험성평가 기록 JSON을 준비한 뒤 --input 경로로 실행하세요.');
    process.exit(1);
  }

  const payload = loadJson(inputPath);
  const records = extractRecords(payload);

  if (!Array.isArray(records) || records.length === 0) {
    console.error('❌ 입력 데이터에서 workerRecords 배열을 찾지 못했습니다.');
    process.exit(1);
  }

  const result = buildComparison(records, opts.maxPenalty);

  ensureDirFor(outputJsonPath);
  ensureDirFor(outputMdPath);
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  writeMarkdown(outputMdPath, result, opts.input);

  console.log('=== 운영 패널티 전환 실증 분석 ===');
  console.log(`입력: ${opts.input}`);
  console.log(`레코드: ${result.meta.totalRecords}건`);
  console.log(`Legacy 평균: ${result.summary.legacyAverage}`);
  console.log(`Proposed 평균: ${result.summary.proposedAverage}`);
  console.log(`운영 패널티 적용률: ${result.summary.operationalPenaltyAppliedRate}%`);
  console.log(`JSON 리포트: ${opts.outputJson}`);
  console.log(`MD 리포트: ${opts.outputMd}`);
}

main();
