const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEFAULTS = {
  input: 'reports/records-export.json',
  outputJson: 'reports/existing-records-audit.json',
  outputMd: 'reports/existing-records-audit.md',
  minSimilarity: 0.72,
  maxScoreGap: 8,
  today: '',
};

const REQUIRED_FIELDS = [
  'id',
  'name',
  'jobField',
  'date',
  'nationality',
  'safetyScore',
  'safetyLevel',
];

const CANONICAL_SLOTS = [
  { id: 'Q1_TASK', labels: ['Q1', '1', 'TASK', 'WORK', 'WORK_CONTENT', 'WORK_DESCRIPTION'] },
  { id: 'Q2_HAZARD', labels: ['Q2', '2', 'HAZARD', 'RISK_FACTOR', 'DANGER'] },
  { id: 'Q3_LEVEL', labels: ['Q3', '3', 'LEVEL', 'RISK_LEVEL', 'DANGER_LEVEL'] },
  { id: 'Q4_CONTROL', labels: ['Q4', '4', 'CONTROL', 'MEASURE', 'PREVENTION', 'ACTION'] },
  { id: 'Q5_COMMITMENT', labels: ['Q5', '5', 'COMMITMENT', 'PROMISE', 'CONFIRM', 'FOLLOWUP'] },
];

const GENERIC_VALUES = new Set([
  '',
  'UNKNOWN',
  'UNSPECIFIED',
  '미상',
  '미입력',
  '이름없음',
  '분석실패',
  'N/A',
]);

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
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
    if (arg === '--min-similarity') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value >= 0 && value <= 1) options.minSimilarity = value;
      i += 1;
      continue;
    }
    if (arg === '--max-score-gap') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value >= 0) options.maxScoreGap = Math.round(value);
      i += 1;
      continue;
    }
    if (arg === '--today') {
      options.today = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }

  return options;
}

function printHelp() {
  console.log([
    'NEW-PSI existing record audit',
    '',
    'Usage:',
    '  npm run audit:existing-records -- --input reports/records-export.json',
    '',
    'Options:',
    '  --input <path>          Exported NEW-PSI records JSON',
    '  --output-json <path>    JSON report path',
    '  --output-md <path>      Markdown report path',
    '  --min-similarity <n>    Similar-context threshold, default 0.72',
    '  --max-score-gap <n>     Allowed score gap for similar context, default 8',
    '  --today <YYYY-MM-DD>    Date used for future-date checks',
  ].join('\n'));
}

function resolvePath(inputPath) {
  return path.resolve(process.cwd(), inputPath);
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveRecords(payload) {
  if (Array.isArray(payload)) {
    return { records: payload, schemaVersion: 'legacy-array', exportedAt: '' };
  }
  if (!payload || typeof payload !== 'object') {
    return { records: [], schemaVersion: 'unknown', exportedAt: '' };
  }

  const obj = payload;
  const candidates = [
    obj.records,
    obj.workerRecords,
    obj.items,
    obj.data,
    obj.data && obj.data.records,
    obj.data && obj.data.workerRecords,
    obj.payload && obj.payload.records,
    obj.payload && obj.payload.workerRecords,
  ];
  const records = candidates.find(Array.isArray) || [];
  return {
    records,
    schemaVersion: normalizeText(obj.schemaVersion) || normalizeText(obj.version) || 'legacy-object',
    exportedAt: normalizeText(obj.exportedAt) || normalizeText(obj.createdAt),
  };
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[|]/g, '/');
}

function isGeneric(value) {
  return GENERIC_VALUES.has(normalizeKey(value)) || GENERIC_VALUES.has(normalizeText(value));
}

function numberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function rate(count, total) {
  return total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
  return sorted[index];
}

function summarizeNumbers(values) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  return {
    count: clean.length,
    min: clean.length ? clean[0] : 0,
    p25: percentile(clean, 0.25),
    p50: percentile(clean, 0.5),
    p75: percentile(clean, 0.75),
    max: clean.length ? clean[clean.length - 1] : 0,
    avg: Number(average(clean).toFixed(2)),
  };
}

function addCount(bucket, key) {
  const clean = normalizeText(key) || '미상';
  bucket[clean] = (bucket[clean] || 0) + 1;
}

function topCounts(bucket, limit = 10) {
  return Object.entries(bucket)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function toDateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  const raw = normalizeText(value);
  if (!raw) return '';

  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/.exec(raw);
  const dotted = /^(\d{4})[./](\d{1,2})[./](\d{1,2})/.exec(raw);
  const korean = /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/.exec(raw);
  const match = iso || dotted || korean;
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return '';
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toMonthKey(dateKey) {
  return dateKey ? dateKey.slice(0, 7) : '';
}

function hasImageEvidence(record) {
  const candidates = [
    record.originalImage,
    record.image,
    record.imageData,
    record.fileData,
    record.documentImage,
    record.scanImage,
  ];
  return candidates.some((value) => normalizeText(value).length > 50);
}

function normalizeQuestionSlot(value) {
  const raw = normalizeKey(value).replace(/[^A-Z0-9_]/g, '');
  if (!raw) return '';

  for (const slot of CANONICAL_SLOTS) {
    if (slot.id === raw || slot.labels.includes(raw)) return slot.id;
  }

  const numberMatch = raw.match(/[Q문항]?([1-5])/);
  if (numberMatch) {
    return CANONICAL_SLOTS[Number(numberMatch[1]) - 1].id;
  }

  return '';
}

function getAnswerText(item) {
  if (typeof item === 'string') return normalizeText(item);
  if (!item || typeof item !== 'object') return '';
  return normalizeText(
    item.answerText ||
      item.answer ||
      item.value ||
      item.text ||
      item.nativeText ||
      item.koreanTranslation ||
      item.nativeTranslation
  );
}

function extractAnswerSlots(record) {
  const slots = new Map();

  const answers = Array.isArray(record.handwrittenAnswers) ? record.handwrittenAnswers : [];
  answers.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const slot =
      normalizeQuestionSlot(item.canonicalQuestionId) ||
      normalizeQuestionSlot(item.questionId) ||
      normalizeQuestionSlot(item.questionNumber) ||
      normalizeQuestionSlot(item.label) ||
      CANONICAL_SLOTS[index]?.id ||
      '';
    const text = getAnswerText(item);
    if (slot && text) slots.set(slot, text);
  });

  const answerObject = record.answers || record.answerFields || record.questionSlots;
  if (answerObject && typeof answerObject === 'object' && !Array.isArray(answerObject)) {
    Object.entries(answerObject).forEach(([key, value]) => {
      const slot = normalizeQuestionSlot(key);
      const text = getAnswerText(value);
      if (slot && text) slots.set(slot, text);
    });
  }

  const directAliases = {
    Q1_TASK: ['q1', 'q1Task', 'task', 'workContent', 'workDescription'],
    Q2_HAZARD: ['q2', 'q2Hazard', 'hazard', 'riskFactor', 'dangerFactor'],
    Q3_LEVEL: ['q3', 'q3Level', 'riskLevel', 'dangerLevel'],
    Q4_CONTROL: ['q4', 'q4Control', 'controlMeasure', 'preventionMeasure'],
    Q5_COMMITMENT: ['q5', 'q5Commitment', 'commitment', 'promise', 'followup'],
  };

  Object.entries(directAliases).forEach(([slot, keys]) => {
    keys.forEach((key) => {
      const text = getAnswerText(record[key]);
      if (text) slots.set(slot, text);
    });
  });

  return slots;
}

function getHandwrittenText(record) {
  const slots = extractAnswerSlots(record);
  const arrayText = Array.isArray(record.handwrittenAnswers)
    ? record.handwrittenAnswers.map(getAnswerText).filter(Boolean).join(' ')
    : '';
  const fallbackText = [
    record.fullText,
    record.koreanTranslation,
    record.score_reason,
    record.aiInsights,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');
  return normalizeText([...slots.values()].join(' ') || arrayText || fallbackText);
}

function hasKoreanTranslation(record) {
  if (normalizeText(record.koreanTranslation).length > 10) return true;
  return Array.isArray(record.handwrittenAnswers)
    ? record.handwrittenAnswers.some((item) => normalizeText(item && item.koreanTranslation).length > 0)
    : false;
}

function hasNativeTranslation(record) {
  const nationality = normalizeText(record.nationality);
  if (!nationality || /한국|korea/i.test(nationality)) return true;
  if (normalizeText(record.aiInsights_native || record.improvement_native || record.actionable_coaching_native).length > 10) {
    return true;
  }
  return Array.isArray(record.handwrittenAnswers)
    ? record.handwrittenAnswers.some((item) => normalizeText(item && item.nativeTranslation).length > 0)
    : false;
}

function hasAiInsight(record) {
  return normalizeText(record.aiInsights || record.improvement || record.actionable_coaching).length > 10;
}

function hasFailureSignal(record) {
  const status = normalizeKey(record.ocrStatus);
  if (status && status !== 'TEXT_READY') return true;
  if (normalizeText(record.ocrErrorType || record.ocrFailureCode || record.ocrErrorMessage)) return true;
  const text = [
    record.aiInsights,
    record.fullText,
    record.koreanTranslation,
    record.harnessPersistenceWarning,
  ]
    .map(normalizeText)
    .join(' ')
    .toLowerCase();
  return /(분석\s*실패|오류|재시도|quota|429|api|parse|network|failed|error)/i.test(text);
}

function getWorkerKey(record, index) {
  const uuid = normalizeKey(record.worker_uuid || record.workerUuid);
  if (uuid) return `worker:${uuid}`;

  const employeeId = normalizeKey(record.employeeId);
  if (employeeId) return `employee:${employeeId}`;

  const qrId = normalizeKey(record.qrId);
  if (qrId) return `qr:${qrId}`;

  const name = normalizeKey(record.name);
  const job = normalizeKey(record.jobField);
  const nationality = normalizeKey(record.nationality);
  if (!isGeneric(name) && !isGeneric(job) && !isGeneric(nationality)) {
    return `name-job-nationality:${name}|${job}|${nationality}`;
  }

  return `record:${normalizeKey(record.id) || index + 1}`;
}

function buildWorkerGroups(records) {
  const map = new Map();
  records.forEach((record, index) => {
    const key = getWorkerKey(record, index);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  });

  return Array.from(map.entries()).map(([key, groupRecords]) => {
    const sorted = [...groupRecords].sort((a, b) => toDateKey(a.date).localeCompare(toDateKey(b.date)));
    const scores = sorted.map((record) => numberOrNull(record.safetyScore));
    const validScores = scores.filter((value) => value !== null);
    const deltaScore = validScores.length >= 2 ? validScores[validScores.length - 1] - validScores[0] : null;
    const months = new Set(sorted.map((record) => toMonthKey(toDateKey(record.date))).filter(Boolean));
    return {
      key,
      count: sorted.length,
      monthCount: months.size,
      firstDate: toDateKey(sorted[0]?.date),
      lastDate: toDateKey(sorted[sorted.length - 1]?.date),
      deltaScore,
      latestName: normalizeText(sorted[sorted.length - 1]?.name),
      latestJobField: normalizeText(sorted[sorted.length - 1]?.jobField),
      latestNationality: normalizeText(sorted[sorted.length - 1]?.nationality),
    };
  });
}

function normalizeForSimilarity(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, '');
}

function makeBigramSet(text) {
  const clean = normalizeForSimilarity(text);
  if (!clean) return new Set();
  if (clean.length < 2) return new Set([clean]);
  const result = new Set();
  for (let i = 0; i < clean.length - 1; i += 1) {
    result.add(clean.slice(i, i + 2));
  }
  return result;
}

function calcSimilarity(leftText, rightText) {
  const left = makeBigramSet(leftText);
  const right = makeBigramSet(rightText);
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return (2 * intersection) / (left.size + right.size);
}

function findScoreConsistencyFindings(records, options) {
  const candidates = records
    .map((record, index) => ({
      index,
      id: normalizeText(record.id) || `row-${index + 1}`,
      name: normalizeText(record.name),
      jobField: normalizeText(record.jobField) || '미분류',
      date: normalizeText(record.date),
      score: numberOrNull(record.safetyScore),
      text: normalizeText(`${record.jobField || ''} ${getHandwrittenText(record)} ${Array.isArray(record.weakAreas) ? record.weakAreas.join(' ') : ''}`),
    }))
    .filter((item) => item.score !== null && item.text.length >= 20);

  const findings = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const left = candidates[i];
      const right = candidates[j];
      if (left.jobField !== right.jobField) continue;

      const similarity = calcSimilarity(left.text, right.text);
      if (similarity < options.minSimilarity) continue;

      const scoreGap = Math.abs(left.score - right.score);
      if (scoreGap <= options.maxScoreGap) continue;

      findings.push({
        leftId: left.id,
        rightId: right.id,
        leftName: left.name,
        rightName: right.name,
        jobField: left.jobField,
        leftDate: left.date,
        rightDate: right.date,
        leftScore: left.score,
        rightScore: right.score,
        scoreGap,
        similarity: Number(similarity.toFixed(3)),
      });
    }
  }

  return findings.sort((a, b) => b.scoreGap - a.scoreGap || b.similarity - a.similarity).slice(0, 30);
}

function getExecutionMeta() {
  function safeExec(command) {
    try {
      return String(execSync(command, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] })).trim();
    } catch {
      return '';
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    workspace: process.cwd(),
    git: {
      branch: safeExec('git rev-parse --abbrev-ref HEAD') || null,
      commit: safeExec('git rev-parse --short HEAD') || null,
      dirty: Boolean(safeExec('git status --porcelain')),
    },
  };
}

function gradeGate(pass, warning, details) {
  return {
    status: pass ? 'PASS' : warning ? 'WARN' : 'FAIL',
    details,
  };
}

function buildAudit(records, metadata, options, fileSize) {
  const objectRecords = records.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  const total = objectRecords.length;
  const todayKey = toDateKey(options.today) || toDateKey(new Date());

  const missingFieldCounts = {};
  const nationalityCounts = {};
  const jobFieldCounts = {};
  const safetyLevelCounts = {};
  const weakAreaCounts = {};
  const slotCounts = Object.fromEntries(CANONICAL_SLOTS.map((slot) => [slot.id, 0]));
  const lowSlotSamples = [];
  const issueSamples = [];
  const dates = [];
  const scores = [];
  const confidences = [];

  let recordsWithAllRequired = 0;
  let recordsWithImage = 0;
  let recordsWithHandwriting = 0;
  let recordsWithAllSlots = 0;
  let recordsWithKoreanTranslation = 0;
  let recordsWithNativeTranslation = 0;
  let recordsWithAiInsight = 0;
  let recordsWithFailureSignal = 0;
  let futureDateCount = 0;
  let invalidDateCount = 0;
  let lowScoreCount = 0;

  objectRecords.forEach((record, index) => {
    const missing = [];
    REQUIRED_FIELDS.forEach((field) => {
      const value = record[field];
      const isMissing = field === 'safetyScore'
        ? numberOrNull(value) === null
        : !normalizeText(value);
      if (isMissing) {
        missing.push(field);
        addCount(missingFieldCounts, field);
      }
    });
    if (!missing.length) recordsWithAllRequired += 1;
    if (missing.length && issueSamples.length < 12) {
      issueSamples.push({
        row: index + 1,
        id: normalizeText(record.id) || `row-${index + 1}`,
        missing,
      });
    }

    const dateKey = toDateKey(record.date);
    if (dateKey) {
      dates.push(dateKey);
      if (todayKey && dateKey > todayKey) futureDateCount += 1;
    } else {
      invalidDateCount += 1;
    }

    const score = numberOrNull(record.safetyScore);
    if (score !== null) {
      scores.push(score);
      if (score < 60) lowScoreCount += 1;
    }

    const confidence = numberOrNull(record.ocrConfidence);
    if (confidence !== null) confidences.push(confidence);

    addCount(nationalityCounts, record.nationality);
    addCount(jobFieldCounts, record.jobField);
    addCount(safetyLevelCounts, record.safetyLevel);

    const weakAreas = Array.isArray(record.weakAreas) ? record.weakAreas : [];
    weakAreas.forEach((item) => addCount(weakAreaCounts, item));

    if (hasImageEvidence(record)) recordsWithImage += 1;

    const slots = extractAnswerSlots(record);
    if (slots.size > 0) recordsWithHandwriting += 1;
    CANONICAL_SLOTS.forEach((slot) => {
      if (slots.has(slot.id)) slotCounts[slot.id] += 1;
    });
    if (CANONICAL_SLOTS.every((slot) => slots.has(slot.id))) {
      recordsWithAllSlots += 1;
    } else if (lowSlotSamples.length < 12) {
      lowSlotSamples.push({
        row: index + 1,
        id: normalizeText(record.id) || `row-${index + 1}`,
        name: normalizeText(record.name),
        presentSlots: CANONICAL_SLOTS.filter((slot) => slots.has(slot.id)).map((slot) => slot.id),
      });
    }

    if (hasKoreanTranslation(record)) recordsWithKoreanTranslation += 1;
    if (hasNativeTranslation(record)) recordsWithNativeTranslation += 1;
    if (hasAiInsight(record)) recordsWithAiInsight += 1;
    if (hasFailureSignal(record)) recordsWithFailureSignal += 1;
  });

  const uniqueDates = [...new Set(dates)].sort();
  const uniqueMonths = [...new Set(dates.map(toMonthKey))].sort();
  const groups = buildWorkerGroups(objectRecords);
  const repeatedGroups = groups.filter((group) => group.count > 1);
  const multiMonthGroups = groups.filter((group) => group.monthCount > 1);
  const improvingGroups = groups.filter((group) => group.deltaScore !== null && group.deltaScore >= 5);
  const decliningGroups = groups.filter((group) => group.deltaScore !== null && group.deltaScore <= -5);
  const stableGroups = groups.filter((group) => group.deltaScore !== null && Math.abs(group.deltaScore) < 5);
  const scoreConsistencyFindings = findScoreConsistencyFindings(objectRecords, options);
  const slotCoverage = Object.fromEntries(
    Object.entries(slotCounts).map(([slot, count]) => [slot, { count, rate: rate(count, total) }])
  );

  const validRecordRate = rate(recordsWithAllRequired, total);
  const handwrittenCoverageRate = rate(recordsWithHandwriting, total);
  const allSlotCoverageRate = rate(recordsWithAllSlots, total);
  const imageCoverageRate = rate(recordsWithImage, total);
  const koreanTranslationRate = rate(recordsWithKoreanTranslation, total);
  const nativeTranslationRate = rate(recordsWithNativeTranslation, total);
  const aiInsightRate = rate(recordsWithAiInsight, total);
  const failureSignalRate = rate(recordsWithFailureSignal, total);

  const gates = {
    operatingDataUsable: gradeGate(
      total >= 50 && validRecordRate >= 90,
      total >= 20 && validRecordRate >= 80,
      `총 ${total}건, 필수항목 충족 ${validRecordRate}%`
    ),
    handwritingEvidence: gradeGate(
      handwrittenCoverageRate >= 90 && allSlotCoverageRate >= 70,
      handwrittenCoverageRate >= 70,
      `수기답변 ${handwrittenCoverageRate}%, Q1~Q5 전체 슬롯 ${allSlotCoverageRate}%`
    ),
    trackingEvidence: gradeGate(
      repeatedGroups.length >= 10 && multiMonthGroups.length >= 5,
      repeatedGroups.length > 0 || multiMonthGroups.length > 0,
      `반복 근로자 ${repeatedGroups.length}그룹, 다월 추적 ${multiMonthGroups.length}그룹`
    ),
    educationLinkEvidence: gradeGate(
      aiInsightRate >= 90 && nativeTranslationRate >= 80,
      aiInsightRate >= 70,
      `AI 코칭 ${aiInsightRate}%, 모국어 안내 ${nativeTranslationRate}%`
    ),
    scoreConsistency: gradeGate(
      scoreConsistencyFindings.length === 0,
      scoreConsistencyFindings.length <= 5,
      `유사 맥락 점수차 초과 ${scoreConsistencyFindings.length}쌍`
    ),
    newFormComparisonReady: gradeGate(
      imageCoverageRate >= 80,
      imageCoverageRate >= 30,
      `원본 이미지 보존 ${imageCoverageRate}%`
    ),
  };

  const recommendations = [];
  if (total === 0) recommendations.push('운영 기록 JSON 안에서 records 또는 workerRecords 배열을 찾지 못했습니다.');
  if (total > 0 && validRecordRate < 90) recommendations.push('필수항목 누락이 있는 기록을 먼저 정리해야 기존 양식과 새 양식 비교가 안정적입니다.');
  if (handwrittenCoverageRate < 90) recommendations.push('수기답변 원문이 적은 기록은 OCR 재판독 또는 관리자 확인 대상으로 분리하세요.');
  if (allSlotCoverageRate < 70) recommendations.push('Q1~Q5 문항 슬롯 매핑이 약합니다. 새 양식 적용 전 canonicalQuestionId 매핑을 고정해야 합니다.');
  if (imageCoverageRate < 80) recommendations.push('원본 이미지가 부족하면 기존 기록의 재OCR 비교는 제한됩니다. 남아있는 이미지 표본부터 우선 모으세요.');
  if (scoreConsistencyFindings.length > 0) recommendations.push('유사한 답변인데 점수차가 큰 기록은 채점 기준 또는 OCR 누락 가능성을 우선 검토하세요.');
  if (nativeTranslationRate < 80) recommendations.push('외국인 근로자에게 전달되는 모국어 코칭 문구 저장률을 높여야 교육 연계 상품성이 강해집니다.');
  if (failureSignalRate >= 5) recommendations.push('OCR 실패·재시도 신호가 있는 기록은 실패 원인별로 촬영품질, 양식인식, API/파싱을 분리해야 합니다.');
  if (repeatedGroups.length < 10 || multiMonthGroups.length < 5) recommendations.push('추적관리 상품 검증을 위해 같은 근로자의 월별 변화 표본을 별도 묶음으로 확보하세요.');
  if (!recommendations.length) recommendations.push('기존 운영 기록은 1차 상품화 검증 데이터로 사용할 수 있습니다. 다음 단계는 새 양식 30~50장 비교 촬영입니다.');

  const gateStatuses = Object.values(gates).map((gate) => gate.status);
  const overallStatus = gateStatuses.includes('FAIL')
    ? 'NEEDS_REVIEW'
    : gateStatuses.includes('WARN')
      ? 'READY_WITH_WARNINGS'
      : 'READY_FOR_NEW_FORM_COMPARISON';

  return {
    meta: {
      ...getExecutionMeta(),
      input: options.input,
      inputFileSizeBytes: fileSize,
      schemaVersion: metadata.schemaVersion,
      exportedAt: metadata.exportedAt,
      thresholds: {
        minSimilarity: options.minSimilarity,
        maxScoreGap: options.maxScoreGap,
      },
    },
    overallStatus,
    counts: {
      rawRecords: records.length,
      objectRecords: total,
      recordsWithAllRequired,
      workerGroups: groups.length,
      repeatedWorkerGroups: repeatedGroups.length,
      multiMonthWorkerGroups: multiMonthGroups.length,
      improvingWorkerGroups: improvingGroups.length,
      decliningWorkerGroups: decliningGroups.length,
      stableWorkerGroups: stableGroups.length,
      invalidDateCount,
      futureDateCount,
      lowScoreCount,
      failureSignalCount: recordsWithFailureSignal,
    },
    coverage: {
      validRecordRate,
      imageCoverageRate,
      handwrittenCoverageRate,
      allSlotCoverageRate,
      koreanTranslationRate,
      nativeTranslationRate,
      aiInsightRate,
      failureSignalRate,
      slotCoverage,
    },
    dates: {
      minDate: uniqueDates[0] || '',
      maxDate: uniqueDates[uniqueDates.length - 1] || '',
      distinctDateCount: uniqueDates.length,
      distinctMonthCount: uniqueMonths.length,
      months: uniqueMonths,
      todayKey,
    },
    scoreStats: summarizeNumbers(scores),
    ocrConfidenceStats: summarizeNumbers(confidences),
    distributions: {
      nationalities: topCounts(nationalityCounts, 15),
      jobFields: topCounts(jobFieldCounts, 15),
      safetyLevels: topCounts(safetyLevelCounts, 10),
      weakAreas: topCounts(weakAreaCounts, 15),
    },
    gates,
    scoreConsistencyFindings,
    samples: {
      missingFields: issueSamples,
      incompleteQuestionSlots: lowSlotSamples,
      strongestTrackingGroups: [...groups]
        .sort((a, b) => b.monthCount - a.monthCount || b.count - a.count)
        .slice(0, 15),
    },
    recommendations,
  };
}

function gateIcon(status) {
  if (status === 'PASS') return 'PASS';
  if (status === 'WARN') return 'WARN';
  return 'FAIL';
}

function writeMarkdown(filePath, audit) {
  const lines = [];
  lines.push('# 기존 PSI 운영 기록 검증 리포트');
  lines.push('');
  lines.push(`- 생성시각(UTC): ${audit.meta.generatedAt}`);
  lines.push(`- 입력파일: ${audit.meta.input}`);
  lines.push(`- 스키마: ${audit.meta.schemaVersion}`);
  lines.push(`- 전체판정: ${audit.overallStatus}`);
  lines.push('');
  lines.push('## 핵심 요약');
  lines.push('');
  lines.push(`- 기록 수: 원본 ${audit.counts.rawRecords}건 / 객체 ${audit.counts.objectRecords}건`);
  lines.push(`- 기간: ${audit.dates.minDate || '-'} ~ ${audit.dates.maxDate || '-'} (${audit.dates.distinctMonthCount}개월)`);
  lines.push(`- 근로자 그룹: ${audit.counts.workerGroups}개`);
  lines.push(`- 반복 추적 그룹: ${audit.counts.repeatedWorkerGroups}개`);
  lines.push(`- 다월 추적 그룹: ${audit.counts.multiMonthWorkerGroups}개`);
  lines.push(`- 평균 점수: ${audit.scoreStats.avg}점 / 낮은 점수(<60): ${audit.counts.lowScoreCount}건`);
  lines.push('');
  lines.push('## 게이트 판정');
  lines.push('');
  lines.push('| 항목 | 상태 | 근거 |');
  lines.push('| --- | --- | --- |');
  lines.push(`| 운영 데이터 사용성 | ${gateIcon(audit.gates.operatingDataUsable.status)} | ${audit.gates.operatingDataUsable.details} |`);
  lines.push(`| 수기 판독 증거 | ${gateIcon(audit.gates.handwritingEvidence.status)} | ${audit.gates.handwritingEvidence.details} |`);
  lines.push(`| 추적관리 증거 | ${gateIcon(audit.gates.trackingEvidence.status)} | ${audit.gates.trackingEvidence.details} |`);
  lines.push(`| 교육연계 증거 | ${gateIcon(audit.gates.educationLinkEvidence.status)} | ${audit.gates.educationLinkEvidence.details} |`);
  lines.push(`| 점수 일관성 | ${gateIcon(audit.gates.scoreConsistency.status)} | ${audit.gates.scoreConsistency.details} |`);
  lines.push(`| 새 양식 비교 준비 | ${gateIcon(audit.gates.newFormComparisonReady.status)} | ${audit.gates.newFormComparisonReady.details} |`);
  lines.push('');
  lines.push('## 커버리지');
  lines.push('');
  lines.push(`- 필수항목 충족률: ${audit.coverage.validRecordRate}%`);
  lines.push(`- 원본 이미지 보존율: ${audit.coverage.imageCoverageRate}%`);
  lines.push(`- 수기답변 저장률: ${audit.coverage.handwrittenCoverageRate}%`);
  lines.push(`- Q1~Q5 전체 슬롯 완성률: ${audit.coverage.allSlotCoverageRate}%`);
  lines.push(`- 한국어 해석 저장률: ${audit.coverage.koreanTranslationRate}%`);
  lines.push(`- 모국어 안내 저장률: ${audit.coverage.nativeTranslationRate}%`);
  lines.push(`- AI 코칭 저장률: ${audit.coverage.aiInsightRate}%`);
  lines.push(`- OCR 실패 신호율: ${audit.coverage.failureSignalRate}%`);
  lines.push('');
  lines.push('| 문항 슬롯 | 건수 | 비율 |');
  lines.push('| --- | ---: | ---: |');
  for (const slot of CANONICAL_SLOTS) {
    const item = audit.coverage.slotCoverage[slot.id];
    lines.push(`| ${slot.id} | ${item.count} | ${item.rate}% |`);
  }
  lines.push('');
  lines.push('## 분포');
  lines.push('');
  lines.push('### 국적 TOP');
  lines.push('');
  lines.push('| 국적 | 건수 |');
  lines.push('| --- | ---: |');
  audit.distributions.nationalities.forEach((row) => lines.push(`| ${row.name} | ${row.count} |`));
  lines.push('');
  lines.push('### 공종 TOP');
  lines.push('');
  lines.push('| 공종 | 건수 |');
  lines.push('| --- | ---: |');
  audit.distributions.jobFields.forEach((row) => lines.push(`| ${row.name} | ${row.count} |`));
  lines.push('');
  lines.push('### 취약영역 TOP');
  lines.push('');
  lines.push('| 취약영역 | 건수 |');
  lines.push('| --- | ---: |');
  audit.distributions.weakAreas.forEach((row) => lines.push(`| ${row.name} | ${row.count} |`));
  lines.push('');

  if (audit.scoreConsistencyFindings.length > 0) {
    lines.push('## 점수 일관성 검토 대상');
    lines.push('');
    lines.push('| Left | Right | 공종 | 유사도 | 점수차 | 점수 |');
    lines.push('| --- | --- | --- | ---: | ---: | --- |');
    audit.scoreConsistencyFindings.forEach((item) => {
      lines.push(`| ${item.leftId} | ${item.rightId} | ${item.jobField} | ${item.similarity} | ${item.scoreGap} | ${item.leftScore}/${item.rightScore} |`);
    });
    lines.push('');
  }

  if (audit.samples.incompleteQuestionSlots.length > 0) {
    lines.push('## Q1~Q5 슬롯 미완성 표본');
    lines.push('');
    lines.push('| 행 | ID | 이름 | 감지된 슬롯 |');
    lines.push('| ---: | --- | --- | --- |');
    audit.samples.incompleteQuestionSlots.forEach((item) => {
      lines.push(`| ${item.row} | ${item.id} | ${item.name || '-'} | ${item.presentSlots.join(', ') || '-'} |`);
    });
    lines.push('');
  }

  lines.push('## 다음 조치');
  lines.push('');
  audit.recommendations.forEach((item) => lines.push(`- ${item}`));
  lines.push('');
  lines.push('## 새 양식 검증으로 넘어가는 기준');
  lines.push('');
  lines.push('- 기존 기록 원본 이미지가 있으면 기존 양식 30~50장과 새 양식 30~50장을 같은 기준으로 재분석합니다.');
  lines.push('- 원본 이미지가 없으면 기존 저장 결과의 구조·추적성·교육연계 품질까지만 확정하고, 새 양식은 별도 촬영 표본으로 검증합니다.');
  lines.push('- 같은 작업·같은 위험요인 답변에서 점수 차이가 ±8점 이내인지 확인합니다.');
  lines.push('- Q1 작업, Q2 위험요인, Q3 위험수준, Q4 감소대책, Q5 실천확인 매핑 오류가 3% 이하인지 확인합니다.');

  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const inputPath = resolvePath(options.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`입력 파일을 찾지 못했습니다: ${options.input}`);
    console.error('기존 운영 기록을 JSON으로 내보낸 뒤 --input 경로로 지정하세요.');
    process.exit(1);
  }

  const payload = loadJson(inputPath);
  const metadata = resolveRecords(payload);
  const fileSize = fs.statSync(inputPath).size;
  const audit = buildAudit(metadata.records, metadata, options, fileSize);

  const outputJsonPath = resolvePath(options.outputJson);
  const outputMdPath = resolvePath(options.outputMd);
  ensureParentDir(outputJsonPath);
  ensureParentDir(outputMdPath);
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  writeMarkdown(outputMdPath, audit);

  console.log('=== 기존 PSI 운영 기록 검증 ===');
  console.log(`입력: ${options.input}`);
  console.log(`판정: ${audit.overallStatus}`);
  console.log(`기록: ${audit.counts.objectRecords}건`);
  console.log(`기간: ${audit.dates.minDate || '-'} ~ ${audit.dates.maxDate || '-'} (${audit.dates.distinctMonthCount}개월)`);
  console.log(`반복 추적 그룹: ${audit.counts.repeatedWorkerGroups}개`);
  console.log(`다월 추적 그룹: ${audit.counts.multiMonthWorkerGroups}개`);
  console.log(`수기답변 저장률: ${audit.coverage.handwrittenCoverageRate}%`);
  console.log(`Q1~Q5 전체 슬롯 완성률: ${audit.coverage.allSlotCoverageRate}%`);
  console.log(`원본 이미지 보존율: ${audit.coverage.imageCoverageRate}%`);
  console.log(`JSON 리포트: ${options.outputJson}`);
  console.log(`Markdown 리포트: ${options.outputMd}`);
}

main();
