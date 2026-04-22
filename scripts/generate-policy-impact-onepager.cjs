const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  input: 'reports/policy-impact.json',
  output: 'reports/policy-impact-onepager.md',
};

function parseArgs(argv) {
  const options = { ...DEFAULTS };
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
    }
  }
  return options;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function formatSigned(value) {
  const n = toNumber(value);
  if (n > 0) return `+${n}`;
  return `${n}`;
}

function buildExecutiveHeadline(summary) {
  const delta = toNumber(summary.averageDelta);
  const stdBefore = toNumber(summary.legacyStdDev);
  const stdAfter = toNumber(summary.proposedStdDev);
  const stdDelta = Number((stdAfter - stdBefore).toFixed(2));

  if (delta <= 0 && stdDelta <= 0) {
    return `운영 패널티 전환 후 평균 점수는 ${Math.abs(delta)}p 하향되었고, 변동성은 ${Math.abs(stdDelta)}p 축소되어 공정성과 안정성이 동시 개선되었습니다.`;
  }

  if (delta <= 0 && stdDelta > 0) {
    return `운영 패널티 전환 후 평균 점수는 ${Math.abs(delta)}p 하향되어 규율 기반 판별력은 강화되었으나, 변동성은 ${stdDelta}p 증가해 세부 룰 보정이 필요합니다.`;
  }

  return `운영 패널티 전환 후 평균 점수는 ${formatSigned(delta)}p 변화했고, 변동성 변화는 ${formatSigned(stdDelta)}p 입니다.`;
}

function buildOnePager(report) {
  const meta = report.meta || {};
  const summary = report.summary || {};
  const jobFieldSummary = Array.isArray(report.jobFieldSummary) ? report.jobFieldSummary : [];
  const topPenalty = Array.isArray(report.topPenalty) ? report.topPenalty.slice(0, 5) : [];

  const lines = [];
  lines.push('# PSI 운영 패널티 전환 1페이지 요약');
  lines.push('');
  lines.push(`- 생성시각(UTC): ${meta.generatedAt || new Date().toISOString()}`);
  lines.push(`- 분석대상 레코드: ${toNumber(meta.totalRecords)}건`);
  lines.push(`- 운영 패널티 상한: ${toNumber(meta.maxPenalty)}점`);
  lines.push('');

  lines.push('## 핵심 메시지');
  lines.push('');
  lines.push(`- ${buildExecutiveHeadline(summary)}`);
  lines.push(`- 운영 패널티 적용률은 ${toNumber(summary.operationalPenaltyAppliedRate).toFixed(2)}%이며, 승인군/반려군 점수 분리도를 통해 관리 개입 우선순위를 제시할 수 있습니다.`);
  lines.push('');

  lines.push('## KPI 스냅샷');
  lines.push('');
  lines.push('| 지표 | Legacy | Proposed | 변화 |');
  lines.push('| --- | ---: | ---: | ---: |');
  lines.push(`| 평균 점수 | ${toNumber(summary.legacyAverage).toFixed(2)} | ${toNumber(summary.proposedAverage).toFixed(2)} | ${formatSigned(Number((toNumber(summary.proposedAverage) - toNumber(summary.legacyAverage)).toFixed(2)))} |`);
  lines.push(`| 점수 표준편차 | ${toNumber(summary.legacyStdDev).toFixed(2)} | ${toNumber(summary.proposedStdDev).toFixed(2)} | ${formatSigned(Number((toNumber(summary.proposedStdDev) - toNumber(summary.legacyStdDev)).toFixed(2)))} |`);
  lines.push(`| 반려군 평균 | ${toNumber(summary.rejectedGroupAvgLegacy).toFixed(2)} | ${toNumber(summary.rejectedGroupAvgProposed).toFixed(2)} | ${formatSigned(Number((toNumber(summary.rejectedGroupAvgProposed) - toNumber(summary.rejectedGroupAvgLegacy)).toFixed(2)))} |`);
  lines.push(`| 승인군 평균 | ${toNumber(summary.approvedGroupAvgLegacy).toFixed(2)} | ${toNumber(summary.approvedGroupAvgProposed).toFixed(2)} | ${formatSigned(Number((toNumber(summary.approvedGroupAvgProposed) - toNumber(summary.approvedGroupAvgLegacy)).toFixed(2)))} |`);
  lines.push('');

  lines.push('## 공종별 요약');
  lines.push('');
  lines.push('| 공종 | 건수 | Legacy 평균 | Proposed 평균 | 평균Δ |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  for (const row of jobFieldSummary.slice(0, 8)) {
    lines.push(`| ${row.jobField} | ${toNumber(row.count)} | ${toNumber(row.legacyAvg).toFixed(2)} | ${toNumber(row.proposedAvg).toFixed(2)} | ${formatSigned(toNumber(row.avgDelta).toFixed(2))} |`);
  }
  lines.push('');

  lines.push('## 운영 패널티 상위 사례(Top 5)');
  lines.push('');
  lines.push('| ID | 이름 | 공종 | 패널티 | 근거 |');
  lines.push('| --- | --- | --- | ---: | --- |');
  for (const row of topPenalty) {
    lines.push(`| ${row.id} | ${row.name} | ${row.jobField} | ${toNumber(row.operationalPenalty)} | ${(row.operationalPenaltyReasons || []).join(' / ') || '-'} |`);
  }
  lines.push('');

  lines.push('## 대외 발표 포인트');
  lines.push('');
  lines.push('- 기록지 평가(역량)와 현장 이행(규율)을 분리한 이중 평가 구조를 적용했습니다.');
  lines.push('- 릴리즈 파이프라인에서 점수 일관성 strict8(±8) 게이트를 통과한 데이터만 배포합니다.');
  lines.push('- 실증 리포트는 JSON/Markdown으로 남아 재현 가능한 근거 체계를 제공합니다.');

  return `${lines.join('\n')}\n`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(process.cwd(), opts.input);
  const outputPath = path.resolve(process.cwd(), opts.output);

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ 입력 파일이 없습니다: ${opts.input}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const report = JSON.parse(raw);
  const content = buildOnePager(report);

  ensureDirFor(outputPath);
  fs.writeFileSync(outputPath, content, 'utf8');

  console.log('=== 정책 실증 1페이지 요약 생성 ===');
  console.log(`입력: ${opts.input}`);
  console.log(`출력: ${opts.output}`);
}

main();
