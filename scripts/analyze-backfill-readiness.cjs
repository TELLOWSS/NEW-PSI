const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  input: 'reports/records-export.json',
  outputJson: 'reports/backfill-readiness.json',
  outputMd: 'reports/backfill-readiness.md',
  estInputTokensPerRecord: 900,
  estOutputTokensPerRecord: 350,
  ocrInputTokensPerImage: 1800,
  ocrOutputTokensPerImage: 250,
  unitCostPer1kInput: 0.002,
  unitCostPer1kOutput: 0.006,
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

    const numericMap = {
      '--est-input-tokens': 'estInputTokensPerRecord',
      '--est-output-tokens': 'estOutputTokensPerRecord',
      '--ocr-input-tokens': 'ocrInputTokensPerImage',
      '--ocr-output-tokens': 'ocrOutputTokensPerImage',
      '--cost-input-1k': 'unitCostPer1kInput',
      '--cost-output-1k': 'unitCostPer1kOutput',
    };

    if (numericMap[arg]) {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value >= 0) {
        options[numericMap[arg]] = value;
      }
      i += 1;
    }
  }

  return options;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
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

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hasValidImage(record) {
  const source = String(record.originalImage || record.image || '').trim();
  return source.length > 50;
}

function aggregateHandwritten(record) {
  const answers = Array.isArray(record.handwrittenAnswers) ? record.handwrittenAnswers : [];
  const joined = answers
    .map((item) => normalizeText(item.answerText || item.koreanTranslation || ''))
    .filter(Boolean)
    .join(' ')
    .trim();
  return {
    count: answers.length,
    text: joined,
  };
}

function hasStructuredBackfillSignals(record) {
  const scoreBreakdown = record && typeof record.scoreBreakdown === 'object' ? record.scoreBreakdown : null;
  const scoreKeys = scoreBreakdown
    ? [
        'psychological',
        'jobUnderstanding',
        'riskAssessmentUnderstanding',
        'proficiency',
        'improvementExecution',
        'repeatViolationPenalty',
      ].filter((key) => Number.isFinite(Number(scoreBreakdown[key])))
    : [];

  const hasSafetyScore = Number.isFinite(Number(record.safetyScore));
  const hasActionHistory = Array.isArray(record.actionHistory) && record.actionHistory.length > 0;
  const hasAuditTrail = Array.isArray(record.auditTrail) && record.auditTrail.length > 0;
  const hasApprovalHistory = Array.isArray(record.approvalHistory) && record.approvalHistory.length > 0;

  if (scoreKeys.length >= 4) {
    return true;
  }

  const signalCount = [hasSafetyScore, hasActionHistory, hasAuditTrail, hasApprovalHistory].filter(Boolean).length;
  return signalCount >= 2;
}

function detectCorruptionSignals(text) {
  if (!text) return false;
  const sample = text.toLowerCase();
  if (/\?{3,}|��|undefined|nullnull|nan/.test(sample)) return true;
  return false;
}

function detectNeedsOcr(record) {
  const fullText = normalizeText(record.fullText);
  const koText = normalizeText(record.koreanTranslation);
  const answers = aggregateHandwritten(record);
  const combined = [fullText, koText, answers.text].filter(Boolean).join(' ').trim();

  const shortText = combined.length < 30;
  const missingAllText = !fullText && !koText && !answers.text;
  const hasImage = hasValidImage(record);
  const corrupted = detectCorruptionSignals(combined);
  const structuredBackfill = hasStructuredBackfillSignals(record);

  if ((missingAllText || shortText) && !hasImage && structuredBackfill) {
    return {
      tier: 'NO_OCR_NEEDED',
      reason: '텍스트/이미지 부족하지만 구조화 이력 기반 백필 가능',
    };
  }

  if ((missingAllText || shortText || corrupted) && hasImage) {
    return {
      tier: 'OCR_REQUIRED',
      reason: missingAllText
        ? '텍스트 없음 + 원본 이미지 존재'
        : corrupted
          ? '텍스트 깨짐 신호 + 원본 이미지 존재'
          : '텍스트 과소(30자 미만) + 원본 이미지 존재',
    };
  }

  if (missingAllText || shortText || corrupted) {
    return {
      tier: 'TEXT_ONLY_REVIEW',
      reason: missingAllText
        ? '텍스트 없음(이미지 없음): 수기원본 확인 필요'
        : corrupted
          ? '텍스트 깨짐 신호(이미지 없음): 수기원본 확인 필요'
          : '텍스트 과소(30자 미만): 관리자 검토 필요',
    };
  }

  return {
    tier: 'NO_OCR_NEEDED',
    reason: '텍스트 기반 재채점 가능',
  };
}

function estimateCost(count, inputTokensPerRecord, outputTokensPerRecord, input1k, output1k) {
  const totalInputTokens = count * inputTokensPerRecord;
  const totalOutputTokens = count * outputTokensPerRecord;
  const inputCost = (totalInputTokens / 1000) * input1k;
  const outputCost = (totalOutputTokens / 1000) * output1k;
  return {
    records: count,
    totalInputTokens,
    totalOutputTokens,
    inputCost: Number(inputCost.toFixed(4)),
    outputCost: Number(outputCost.toFixed(4)),
    totalCost: Number((inputCost + outputCost).toFixed(4)),
  };
}

function summarizeByKey(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = String(row[key] || '미상');
    map.set(value, (map.get(value) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function buildReport(records, options) {
  const rows = records.map((record, idx) => {
    const readiness = detectNeedsOcr(record);
    const answers = aggregateHandwritten(record);
    const fullText = normalizeText(record.fullText);
    const koText = normalizeText(record.koreanTranslation);
    const combinedLength = [fullText, koText, answers.text].join(' ').trim().length;

    return {
      id: String(record.id || `row-${idx + 1}`),
      name: String(record.name || '미상'),
      nationality: String(record.nationality || '미상'),
      jobField: String(record.jobField || '미분류'),
      teamLeader: String(record.teamLeader || '미지정'),
      date: String(record.date || ''),
      hasImage: hasValidImage(record),
      answerCount: answers.count,
      textLength: combinedLength,
      readinessTier: readiness.tier,
      readinessReason: readiness.reason,
    };
  });

  const total = rows.length;
  const noOcr = rows.filter((r) => r.readinessTier === 'NO_OCR_NEEDED');
  const ocrRequired = rows.filter((r) => r.readinessTier === 'OCR_REQUIRED');
  const textOnlyReview = rows.filter((r) => r.readinessTier === 'TEXT_ONLY_REVIEW');

  const noOcrCost = estimateCost(
    noOcr.length,
    options.estInputTokensPerRecord,
    options.estOutputTokensPerRecord,
    options.unitCostPer1kInput,
    options.unitCostPer1kOutput
  );

  const ocrCost = estimateCost(
    ocrRequired.length,
    options.ocrInputTokensPerImage,
    options.ocrOutputTokensPerImage,
    options.unitCostPer1kInput,
    options.unitCostPer1kOutput
  );

  const fullReOcrCost = estimateCost(
    total,
    options.ocrInputTokensPerImage,
    options.ocrOutputTokensPerImage,
    options.unitCostPer1kInput,
    options.unitCostPer1kOutput
  );

  const selectiveCost = Number((noOcrCost.totalCost + ocrCost.totalCost).toFixed(4));
  const savings = Number((fullReOcrCost.totalCost - selectiveCost).toFixed(4));
  const savingsRate = fullReOcrCost.totalCost > 0
    ? Number(((savings / fullReOcrCost.totalCost) * 100).toFixed(2))
    : 0;

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      totalRecords: total,
      assumptions: {
        estInputTokensPerRecord: options.estInputTokensPerRecord,
        estOutputTokensPerRecord: options.estOutputTokensPerRecord,
        ocrInputTokensPerImage: options.ocrInputTokensPerImage,
        ocrOutputTokensPerImage: options.ocrOutputTokensPerImage,
        unitCostPer1kInput: options.unitCostPer1kInput,
        unitCostPer1kOutput: options.unitCostPer1kOutput,
      },
    },
    readiness: {
      noOcrNeeded: noOcr.length,
      ocrRequired: ocrRequired.length,
      textOnlyReview: textOnlyReview.length,
      noOcrNeededRate: total > 0 ? Number(((noOcr.length / total) * 100).toFixed(2)) : 0,
      ocrRequiredRate: total > 0 ? Number(((ocrRequired.length / total) * 100).toFixed(2)) : 0,
      textOnlyReviewRate: total > 0 ? Number(((textOnlyReview.length / total) * 100).toFixed(2)) : 0,
    },
    costEstimate: {
      selective: {
        textBackfill: noOcrCost,
        ocrFallback: ocrCost,
        totalCost: selectiveCost,
      },
      fullReOcr: fullReOcrCost,
      savings,
      savingsRate,
    },
    byJobField: summarizeByKey(rows, 'jobField'),
    byNationality: summarizeByKey(rows, 'nationality'),
    ocrRequiredTop: ocrRequired.slice(0, 30),
    textOnlyReviewTop: textOnlyReview.slice(0, 30),
    rows,
  };
}

function writeMarkdown(filePath, report, sourceInput) {
  const lines = [];
  lines.push('# 백필 준비도 및 비용 추정 리포트');
  lines.push('');
  lines.push(`- 생성시각(UTC): ${report.meta.generatedAt}`);
  lines.push(`- 입력 데이터: ${sourceInput}`);
  lines.push(`- 총 레코드: ${report.meta.totalRecords}`);
  lines.push('');

  lines.push('## 분류 요약');
  lines.push('');
  lines.push(`- OCR 재실행 불필요: ${report.readiness.noOcrNeeded}건 (${report.readiness.noOcrNeededRate}%)`);
  lines.push(`- OCR 재실행 필요: ${report.readiness.ocrRequired}건 (${report.readiness.ocrRequiredRate}%)`);
  lines.push(`- 텍스트 수기검토 필요(이미지 없음): ${report.readiness.textOnlyReview}건 (${report.readiness.textOnlyReviewRate}%)`);
  lines.push('');

  lines.push('## 비용 추정');
  lines.push('');
  lines.push(`- 선택적 처리 총비용(텍스트 백필 + 예외 OCR): ${report.costEstimate.selective.totalCost}`);
  lines.push(`- 전수 OCR 총비용(가정): ${report.costEstimate.fullReOcr.totalCost}`);
  lines.push(`- 절감액(가정): ${report.costEstimate.savings}`);
  lines.push(`- 절감률(가정): ${report.costEstimate.savingsRate}%`);
  lines.push('');

  lines.push('## 공종 분포');
  lines.push('');
  lines.push('| 공종 | 건수 |');
  lines.push('| --- | ---: |');
  for (const row of report.byJobField.slice(0, 15)) {
    lines.push(`| ${row.name} | ${row.count} |`);
  }
  lines.push('');

  lines.push('## OCR 재실행 필요 상위 목록');
  lines.push('');
  lines.push('| ID | 이름 | 공종 | 국적 | 사유 | 텍스트길이 | 이미지 |');
  lines.push('| --- | --- | --- | --- | --- | ---: | --- |');
  for (const row of report.ocrRequiredTop) {
    lines.push(`| ${row.id} | ${row.name} | ${row.jobField} | ${row.nationality} | ${row.readinessReason} | ${row.textLength} | ${row.hasImage ? 'Y' : 'N'} |`);
  }

  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(process.cwd(), opts.input);
  const outputJsonPath = path.resolve(process.cwd(), opts.outputJson);
  const outputMdPath = path.resolve(process.cwd(), opts.outputMd);

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ 입력 파일이 없습니다: ${opts.input}`);
    process.exit(1);
  }

  const payload = loadJson(inputPath);
  const records = extractRecords(payload);

  if (!Array.isArray(records) || records.length === 0) {
    console.error('❌ workerRecords 배열을 찾지 못했습니다.');
    process.exit(1);
  }

  const report = buildReport(records, opts);

  ensureDir(outputJsonPath);
  ensureDir(outputMdPath);
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeMarkdown(outputMdPath, report, opts.input);

  console.log('=== 백필 준비도 분석 ===');
  console.log(`입력: ${opts.input}`);
  console.log(`총 레코드: ${report.meta.totalRecords}`);
  console.log(`NO_OCR_NEEDED: ${report.readiness.noOcrNeeded}`);
  console.log(`OCR_REQUIRED: ${report.readiness.ocrRequired}`);
  console.log(`TEXT_ONLY_REVIEW: ${report.readiness.textOnlyReview}`);
  console.log(`선택적 처리 비용(가정): ${report.costEstimate.selective.totalCost}`);
  console.log(`전수 OCR 비용(가정): ${report.costEstimate.fullReOcr.totalCost}`);
  console.log(`절감률(가정): ${report.costEstimate.savingsRate}%`);
  console.log(`JSON 리포트: ${opts.outputJson}`);
  console.log(`MD 리포트: ${opts.outputMd}`);
}

main();
