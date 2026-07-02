const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEFAULTS = {
  input: 'reports/PSI_Backup_2026-06-30.json',
  outputJson: 'reports/worker-identity-linkage-2026-06-30.json',
  outputMd: 'reports/worker-identity-linkage-2026-06-30.md',
  today: '',
  maxSamples: 30,
};

const LARGE_JSON_STREAMING_THRESHOLD_BYTES = 100 * 1024 * 1024;
const GENERIC_VALUES = new Set([
  '',
  '-',
  'N/A',
  'NA',
  'NULL',
  'NONE',
  'UNKNOWN',
  'UNSPECIFIED',
  '미상',
  '없음',
  '이름없음',
  '이름미확인',
  '알수없음',
  '분석실패',
]);

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--input') {
      options.input = String(argv[index + 1] || '').trim() || options.input;
      index += 1;
      continue;
    }
    if (arg === '--output-json') {
      options.outputJson = String(argv[index + 1] || '').trim() || options.outputJson;
      index += 1;
      continue;
    }
    if (arg === '--output-md') {
      options.outputMd = String(argv[index + 1] || '').trim() || options.outputMd;
      index += 1;
      continue;
    }
    if (arg === '--today') {
      options.today = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (arg === '--max-samples') {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value >= 0) options.maxSamples = Math.round(value);
      index += 1;
    }
  }

  return options;
}

function printHelp() {
  console.log([
    'NEW-PSI worker identity linkage audit',
    '',
    'Usage:',
    '  npm run audit:worker-linkage -- --input reports/PSI_Backup_2026-06-30.json',
    '',
    'Options:',
    '  --input <path>          Exported NEW-PSI backup JSON',
    '  --output-json <path>    JSON report path',
    '  --output-md <path>      Markdown report path',
    '  --today <YYYY-MM-DD>    Date used for future-date checks',
    '  --max-samples <n>       Max candidate groups in the report',
  ].join('\n'));
}

function resolvePath(inputPath) {
  return path.resolve(process.cwd(), inputPath);
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[|]/g, '/');
}

function normalizeNameKey(value) {
  return normalizeKey(value)
    .replace(/[(){}\[\]<>.,;:'"`~!@#$%^&*_+=?\\/]/g, '')
    .replace(/님$/i, '');
}

function isGeneric(value) {
  const cleanText = normalizeText(value);
  const cleanKey = normalizeKey(value);
  return GENERIC_VALUES.has(cleanText) || GENERIC_VALUES.has(cleanKey);
}

function hasUsableValue(value) {
  return normalizeText(value).length > 0 && !isGeneric(value);
}

function firstValue(record, keys) {
  for (const key of keys) {
    const value = record && record[key];
    if (hasUsableValue(value)) return value;
  }
  return '';
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
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
  return sorted[index];
}

function summarizeNumbers(values) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
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

function topCounts(bucket, limit = 12) {
  return Object.entries(bucket)
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'ko-KR'))
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
  const match = iso || dotted;
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

function maskText(value) {
  const text = normalizeText(value);
  if (!text) return '-';
  if (/^[A-Za-z0-9\s]+$/.test(text)) {
    const compact = text.replace(/\s+/g, '');
    return compact.length <= 2 ? `${compact[0] || '*'}*` : `${compact.slice(0, 2)}***`;
  }
  const chars = Array.from(text.replace(/\s+/g, ''));
  if (chars.length <= 1) return `${chars[0] || '*'}*`;
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${'*'.repeat(Math.min(chars.length - 2, 3))}${chars[chars.length - 1]}`;
}

function getUuidValues(record) {
  return Array.from(new Set([
    normalizeKey(record.worker_uuid),
    normalizeKey(record.workerUuid),
  ].filter(Boolean)));
}

function buildLightRecord(record, index) {
  const dateKey = toDateKey(record.date);
  const name = normalizeText(record.name);
  const nationality = normalizeText(record.nationality);
  const jobField = normalizeText(record.jobField);
  const teamLeader = normalizeText(firstValue(record, ['teamLeader', 'team_name', 'teamName', 'leaderName']));
  const phone = firstValue(record, ['phone_number', 'phoneNumber', 'phone', 'mobile']);
  const birthDate = firstValue(record, ['birth_date', 'birthDate']);
  const passport = firstValue(record, ['passport_number', 'passportNumber']);

  return {
    row: index + 1,
    id: normalizeText(record.id) || `row-${index + 1}`,
    maskedName: maskText(name),
    name,
    nameKey: normalizeNameKey(name),
    nationality,
    nationalityKey: normalizeKey(nationality),
    jobField,
    jobFieldKey: normalizeKey(jobField),
    teamLeader,
    teamLeaderKey: normalizeNameKey(teamLeader),
    workerUuidValues: getUuidValues(record),
    employeeIdKey: normalizeKey(firstValue(record, ['employeeId', 'employee_id'])),
    qrIdKey: normalizeKey(firstValue(record, ['qrId', 'qr_id'])),
    phoneKey: normalizeKey(phone),
    birthDateKey: normalizeKey(birthDate),
    passportKey: normalizeKey(passport),
    date: normalizeText(record.date),
    dateKey,
    monthKey: toMonthKey(dateKey),
    safetyScore: numberOrNull(record.safetyScore),
    safetyLevel: normalizeText(record.safetyLevel),
  };
}

function readPrefixMetadata(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const prefix = buffer.subarray(0, bytesRead).toString('utf8');
    const schemaVersion = (prefix.match(/"schemaVersion"\s*:\s*"([^"]*)"/) || [])[1] || '';
    const exportedAt = (prefix.match(/"exportedAt"\s*:\s*"([^"]*)"/) || [])[1] || '';
    return {
      schemaVersion: schemaVersion || 'large-backup-stream',
      exportedAt,
    };
  } finally {
    fs.closeSync(fd);
  }
}

function resolveRecords(payload) {
  if (Array.isArray(payload)) {
    return { records: payload, schemaVersion: 'legacy-array', exportedAt: '' };
  }
  if (!payload || typeof payload !== 'object') {
    return { records: [], schemaVersion: 'unknown', exportedAt: '' };
  }

  const candidates = [
    payload.records,
    payload.workerRecords,
    payload.items,
    payload.data,
    payload.data && payload.data.records,
    payload.data && payload.data.workerRecords,
    payload.payload && payload.payload.records,
    payload.payload && payload.payload.workerRecords,
  ];
  const records = candidates.find(Array.isArray) || [];
  return {
    records,
    schemaVersion: normalizeText(payload.schemaVersion) || normalizeText(payload.version) || 'legacy-object',
    exportedAt: normalizeText(payload.exportedAt) || normalizeText(payload.createdAt),
  };
}

function streamLightRecordsFromBackup(filePath, options = {}) {
  const records = [];
  const logEvery = Number(options.logEvery || 25);
  let scanBuffer = '';
  let foundRecordsArray = false;
  let done = false;
  let startedObject = false;
  let currentObject = '';
  let objectDepth = 0;
  let inString = false;
  let escaping = false;

  const processRecordObject = (rawJson) => {
    try {
      const parsed = JSON.parse(rawJson);
      records.push(buildLightRecord(parsed, records.length));
      if (logEvery > 0 && records.length % logEvery === 0) {
        console.log(`[worker-linkage:stream] ${records.length} records parsed`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'unknown error');
      throw new Error(`records[${records.length}] JSON parse failed: ${message}`);
    }
  };

  const processText = (text) => {
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (!startedObject) {
        if (char === '{') {
          startedObject = true;
          currentObject = '{';
          objectDepth = 1;
          inString = false;
          escaping = false;
          continue;
        }
        if (char === ']') {
          done = true;
          return;
        }
        continue;
      }

      currentObject += char;

      if (inString) {
        if (escaping) {
          escaping = false;
        } else if (char === '\\') {
          escaping = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        objectDepth += 1;
      } else if (char === '}') {
        objectDepth -= 1;
        if (objectDepth === 0) {
          processRecordObject(currentObject);
          startedObject = false;
          currentObject = '';
        }
      }
    }
  };

  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1024 * 1024 });

    stream.on('data', (chunk) => {
      try {
        if (done) return;

        if (!foundRecordsArray) {
          scanBuffer += chunk;
          const recordsKeyIndex = scanBuffer.indexOf('"records"');
          if (recordsKeyIndex < 0) {
            if (scanBuffer.length > 20 * 1024 * 1024) {
              throw new Error('records array was not found in the first 20MB of the backup file');
            }
            return;
          }

          const arrayStartIndex = scanBuffer.indexOf('[', recordsKeyIndex);
          if (arrayStartIndex < 0) return;

          foundRecordsArray = true;
          const tail = scanBuffer.slice(arrayStartIndex + 1);
          scanBuffer = '';
          processText(tail);
          return;
        }

        processText(chunk);
      } catch (error) {
        stream.destroy(error);
      }
    });

    stream.on('error', reject);
    stream.on('end', () => {
      if (!foundRecordsArray) {
        reject(new Error('records array was not found in the backup file'));
        return;
      }
      if (startedObject) {
        reject(new Error('backup ended while reading a record object'));
        return;
      }
      console.log(`[worker-linkage:stream] done, ${records.length} records parsed`);
      resolve(records);
    });
  });
}

async function loadLightRecords(inputPath, fileSize) {
  if (fileSize >= LARGE_JSON_STREAMING_THRESHOLD_BYTES) {
    console.log(`[worker-linkage] large backup detected: ${(fileSize / (1024 * 1024)).toFixed(1)}MB. Using streaming parser.`);
    const metadata = readPrefixMetadata(inputPath);
    const records = await streamLightRecordsFromBackup(inputPath);
    return { ...metadata, records, loadMode: 'streaming-large-backup' };
  }

  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const metadata = resolveRecords(payload);
  return {
    ...metadata,
    records: metadata.records.map(buildLightRecord),
    loadMode: 'full-json-parse',
  };
}

const IDENTITY_BASES = [
  {
    id: 'worker_uuid',
    label: 'worker_uuid',
    description: '서버/앱에서 발급한 고유 근로자 ID',
    key: (record) => (record.workerUuidValues.length === 1 ? `worker:${record.workerUuidValues[0]}` : ''),
  },
  {
    id: 'employee_id',
    label: 'employeeId',
    description: '현장 근로자 번호',
    key: (record) => (record.employeeIdKey ? `employee:${record.employeeIdKey}` : ''),
  },
  {
    id: 'qr_id',
    label: 'qrId',
    description: 'QR 기반 식별자',
    key: (record) => (record.qrIdKey ? `qr:${record.qrIdKey}` : ''),
  },
  {
    id: 'name_nationality',
    label: 'name + nationality',
    description: '레거시 자료 추적 후보: 이름과 국적',
    key: (record) => (
      record.nameKey && record.nationalityKey && !isGeneric(record.nameKey) && !isGeneric(record.nationalityKey)
        ? `name-nationality:${record.nameKey}|${record.nationalityKey}`
        : ''
    ),
  },
  {
    id: 'name_nationality_team',
    label: 'name + nationality + team',
    description: '동명이인 위험을 줄이기 위해 반장/팀 정보를 더한 후보',
    key: (record) => (
      record.nameKey && record.nationalityKey && record.teamLeaderKey &&
      !isGeneric(record.nameKey) && !isGeneric(record.nationalityKey) && !isGeneric(record.teamLeaderKey)
        ? `name-nationality-team:${record.nameKey}|${record.nationalityKey}|${record.teamLeaderKey}`
        : ''
    ),
  },
  {
    id: 'current_job_name_nationality',
    label: 'current: job + name + nationality',
    description: '현재 보수적 레거시 기준과 같은 맥락',
    key: (record) => (
      record.jobFieldKey && record.nameKey && record.nationalityKey &&
      !isGeneric(record.jobFieldKey) && !isGeneric(record.nameKey) && !isGeneric(record.nationalityKey)
        ? `job-name-nationality:${record.jobFieldKey}|${record.nameKey}|${record.nationalityKey}`
        : ''
    ),
  },
  {
    id: 'name_nationality_job_team',
    label: 'name + nationality + job + team',
    description: '가장 엄격한 수기 기반 후보',
    key: (record) => (
      record.nameKey && record.nationalityKey && record.jobFieldKey && record.teamLeaderKey &&
      !isGeneric(record.nameKey) && !isGeneric(record.nationalityKey) && !isGeneric(record.jobFieldKey) && !isGeneric(record.teamLeaderKey)
        ? `name-nationality-job-team:${record.nameKey}|${record.nationalityKey}|${record.jobFieldKey}|${record.teamLeaderKey}`
        : ''
    ),
  },
  {
    id: 'phone',
    label: 'phone',
    description: '연락처 기반 강한 식별자 보유 여부',
    key: (record) => (record.phoneKey ? `phone:${record.phoneKey}` : ''),
  },
  {
    id: 'birth_date',
    label: 'birthDate',
    description: '생년월일 기반 보조 식별자 보유 여부',
    key: (record) => (record.birthDateKey ? `birth:${record.birthDateKey}` : ''),
  },
  {
    id: 'passport',
    label: 'passport',
    description: '여권/외국인등록번호 계열 식별자 보유 여부',
    key: (record) => (record.passportKey ? `passport:${record.passportKey}` : ''),
  },
];

function buildGroups(records, basis) {
  const map = new Map();
  records.forEach((record) => {
    const key = basis.key(record);
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  });
  return map;
}

function summarizeGroup(key, records) {
  const sorted = [...records].sort((left, right) => String(left.dateKey).localeCompare(String(right.dateKey)));
  const dates = Array.from(new Set(sorted.map((record) => record.dateKey).filter(Boolean))).sort();
  const months = Array.from(new Set(sorted.map((record) => record.monthKey).filter(Boolean))).sort();
  const scores = sorted.map((record) => record.safetyScore).filter((score) => score !== null);
  const firstScore = scores.length ? scores[0] : null;
  const lastScore = scores.length ? scores[scores.length - 1] : null;
  const dateBuckets = {};
  sorted.forEach((record) => {
    if (record.dateKey) dateBuckets[record.dateKey] = (dateBuckets[record.dateKey] || 0) + 1;
  });

  return {
    key,
    count: sorted.length,
    dateCount: dates.length,
    monthCount: months.length,
    firstDate: dates[0] || '',
    lastDate: dates[dates.length - 1] || '',
    months,
    hasSameDateDuplicate: Object.values(dateBuckets).some((count) => count > 1),
    jobFields: Array.from(new Set(sorted.map((record) => record.jobField).filter(Boolean))).sort(),
    teamLeaders: Array.from(new Set(sorted.map((record) => record.teamLeader).filter(Boolean))).sort(),
    nationalities: Array.from(new Set(sorted.map((record) => record.nationality).filter(Boolean))).sort(),
    maskedName: sorted.find((record) => record.maskedName)?.maskedName || '-',
    scoreStats: summarizeNumbers(scores),
    deltaScore: firstScore !== null && lastScore !== null && scores.length > 1 ? lastScore - firstScore : null,
    records: sorted.map((record) => ({
      row: record.row,
      id: record.id,
      date: record.dateKey || record.date,
      month: record.monthKey,
      score: record.safetyScore,
      jobField: record.jobField,
      teamLeader: record.teamLeader ? maskText(record.teamLeader) : '',
      nationality: record.nationality,
    })),
  };
}

function summarizeBasis(records, basis) {
  const groups = buildGroups(records, basis);
  const groupSummaries = Array.from(groups.entries()).map(([key, groupRecords]) => summarizeGroup(key, groupRecords));
  const repeatedGroups = groupSummaries.filter((group) => group.count > 1);
  const multiMonthGroups = groupSummaries.filter((group) => group.monthCount > 1);
  const sameDateDuplicateGroups = groupSummaries.filter((group) => group.hasSameDateDuplicate);
  const jobChangeGroups = groupSummaries.filter((group) => group.jobFields.length > 1);
  const teamChangeGroups = groupSummaries.filter((group) => group.teamLeaders.length > 1);
  const repeatedRecords = repeatedGroups.reduce((sum, group) => sum + group.count, 0);

  return {
    id: basis.id,
    label: basis.label,
    description: basis.description,
    eligibleRecords: Array.from(groups.values()).reduce((sum, groupRecords) => sum + groupRecords.length, 0),
    coverageRate: rate(Array.from(groups.values()).reduce((sum, groupRecords) => sum + groupRecords.length, 0), records.length),
    groups: groupSummaries.length,
    repeatedGroups: repeatedGroups.length,
    repeatedRecords,
    repeatedRecordRate: rate(repeatedRecords, records.length),
    multiMonthGroups: multiMonthGroups.length,
    sameDateDuplicateGroups: sameDateDuplicateGroups.length,
    sameDateDuplicateRate: rate(sameDateDuplicateGroups.length, groupSummaries.length),
    jobChangeGroups: jobChangeGroups.length,
    teamChangeGroups: teamChangeGroups.length,
    maxRecordsPerGroup: groupSummaries.reduce((max, group) => Math.max(max, group.count), 0),
    maxMonthsPerGroup: groupSummaries.reduce((max, group) => Math.max(max, group.monthCount), 0),
    candidateGroups: repeatedGroups
      .sort((left, right) => (
        right.monthCount - left.monthCount ||
        right.count - left.count ||
        String(left.maskedName).localeCompare(String(right.maskedName), 'ko-KR')
      )),
  };
}

function getFieldCoverage(records) {
  const fields = [
    ['name', (record) => record.nameKey],
    ['nationality', (record) => record.nationalityKey],
    ['jobField', (record) => record.jobFieldKey],
    ['teamLeader', (record) => record.teamLeaderKey],
    ['worker_uuid', (record) => (record.workerUuidValues.length === 1 ? record.workerUuidValues[0] : '')],
    ['worker_uuid_conflict', (record) => (record.workerUuidValues.length > 1 ? 'conflict' : '')],
    ['employeeId', (record) => record.employeeIdKey],
    ['qrId', (record) => record.qrIdKey],
    ['phone', (record) => record.phoneKey],
    ['birthDate', (record) => record.birthDateKey],
    ['passport', (record) => record.passportKey],
    ['date', (record) => record.dateKey],
    ['safetyScore', (record) => (record.safetyScore !== null ? String(record.safetyScore) : '')],
  ];

  return Object.fromEntries(fields.map(([field, getter]) => {
    const count = records.filter((record) => hasUsableValue(getter(record))).length;
    return [field, { count, rate: rate(count, records.length) }];
  }));
}

function getDateDistribution(records) {
  const dateCounts = {};
  const monthCounts = {};
  records.forEach((record) => {
    if (record.dateKey) addCount(dateCounts, record.dateKey);
    if (record.monthKey) addCount(monthCounts, record.monthKey);
  });
  const dates = Object.keys(dateCounts).sort();
  const months = Object.keys(monthCounts).sort();
  return {
    minDate: dates[0] || '',
    maxDate: dates[dates.length - 1] || '',
    distinctDateCount: dates.length,
    distinctMonthCount: months.length,
    months,
    topDates: topCounts(dateCounts, 12),
    topMonths: topCounts(monthCounts, 12),
  };
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

function getBasis(summary, id) {
  return summary.basisComparison.find((basis) => basis.id === id) || null;
}

function decideStatus(summary) {
  const current = getBasis(summary, 'current_job_name_nationality');
  const relaxed = getBasis(summary, 'name_nationality');
  const uuid = getBasis(summary, 'worker_uuid');
  const employee = getBasis(summary, 'employee_id');
  const qr = getBasis(summary, 'qr_id');
  const strongRepeated =
    (uuid?.multiMonthGroups || 0) +
    (employee?.multiMonthGroups || 0) +
    (qr?.multiMonthGroups || 0);

  if (strongRepeated >= 5) {
    return 'READY_WITH_STABLE_ID';
  }

  if (
    relaxed &&
    relaxed.multiMonthGroups >= 5 &&
    relaxed.sameDateDuplicateRate <= 5 &&
    (!current || relaxed.multiMonthGroups > current.multiMonthGroups)
  ) {
    return 'READY_TO_ADD_LEGACY_LINKAGE_REVIEW';
  }

  if (relaxed && (relaxed.repeatedGroups > 0 || relaxed.multiMonthGroups > 0)) {
    return 'NEEDS_MANUAL_LINKAGE_REVIEW';
  }

  return 'NEEDS_STABLE_ID_COLLECTION';
}

function buildRecommendations(summary) {
  const recommendations = [];
  const current = getBasis(summary, 'current_job_name_nationality');
  const relaxed = getBasis(summary, 'name_nationality');
  const team = getBasis(summary, 'name_nationality_team');
  const uuid = getBasis(summary, 'worker_uuid');
  const employee = getBasis(summary, 'employee_id');
  const qr = getBasis(summary, 'qr_id');

  const strongIdCoverage = Math.max(
    uuid?.coverageRate || 0,
    employee?.coverageRate || 0,
    qr?.coverageRate || 0,
  );

  if (strongIdCoverage < 70) {
    recommendations.push('모바일 촬영/스캔 첫 단계에서 근로자 QR 또는 현장 근로자 번호를 함께 남기는 흐름을 상품 기본값으로 두십시오.');
  }

  if (relaxed && current && relaxed.multiMonthGroups > current.multiMonthGroups) {
    recommendations.push('기존 자료의 추적관리 분석은 공종을 식별키에서 빼고, 공종은 이력 변화 항목으로 보관하는 별도 레거시 추적 기준을 추가하는 것이 타당합니다.');
  }

  if (relaxed && relaxed.sameDateDuplicateRate > 5) {
    recommendations.push('이름+국적 기준은 동명이인 또는 같은 날 중복 촬영 위험이 있으므로 자동 확정이 아니라 관리자 확인 대기 묶음으로 먼저 보여주십시오.');
  }

  if (team && relaxed && team.multiMonthGroups >= 5 && team.sameDateDuplicateRate <= relaxed.sameDateDuplicateRate) {
    recommendations.push('반장/팀 정보가 안정적으로 들어간 현장은 이름+국적+반장 기준을 보조 기준으로 쓰면 동명이인 위험을 더 낮출 수 있습니다.');
  }

  if (summary.status === 'NEEDS_STABLE_ID_COLLECTION') {
    recommendations.push('현재 백업만으로는 같은 근로자의 장기 변화가 충분히 연결되지 않습니다. 신규 양식 실증부터 QR/근로자번호/등록대장 연계를 반드시 포함해야 합니다.');
  }

  recommendations.push('신규 다국어 양식은 30~50건 파일럿을 먼저 촬영하고, 같은 스크립트로 기존 양식 대비 반복 묶음, Q1~Q5 판독률, 점수 일관성을 재검증하십시오.');
  recommendations.push('상품화 화면에는 “자동 확정 추적”과 “관리자 확인 필요 추적 후보”를 분리해 신뢰도를 명확히 표시하십시오.');

  return recommendations;
}

function buildAudit(records, metadata, options, fileSize) {
  const nationalityCounts = {};
  const jobFieldCounts = {};
  const scoreValues = [];
  let invalidDateCount = 0;
  let futureDateCount = 0;

  const todayKey = toDateKey(options.today) || toDateKey(new Date());
  records.forEach((record) => {
    addCount(nationalityCounts, record.nationality);
    addCount(jobFieldCounts, record.jobField);
    if (record.safetyScore !== null) scoreValues.push(record.safetyScore);
    if (!record.dateKey) invalidDateCount += 1;
    else if (todayKey && record.dateKey > todayKey) futureDateCount += 1;
  });

  const basisComparison = IDENTITY_BASES.map((basis) => summarizeBasis(records, basis));
  const audit = {
    meta: {
      ...getExecutionMeta(),
      input: options.input,
      inputFileSizeBytes: fileSize,
      schemaVersion: metadata.schemaVersion,
      exportedAt: metadata.exportedAt,
      loadMode: metadata.loadMode,
      todayKey,
    },
    status: '',
    counts: {
      records: records.length,
      invalidDateCount,
      futureDateCount,
    },
    fieldCoverage: getFieldCoverage(records),
    dateDistribution: getDateDistribution(records),
    scoreStats: summarizeNumbers(scoreValues),
    distributions: {
      nationalities: topCounts(nationalityCounts, 15),
      jobFields: topCounts(jobFieldCounts, 15),
    },
    basisComparison: basisComparison.map((basis) => ({
      ...basis,
      candidateGroups: basis.candidateGroups.slice(0, options.maxSamples),
    })),
    recommendations: [],
  };

  audit.status = decideStatus(audit);
  audit.recommendations = buildRecommendations(audit);
  return audit;
}

function statusLabel(status) {
  const labels = {
    READY_WITH_STABLE_ID: '강한 식별자 기준으로 추적 가능',
    READY_TO_ADD_LEGACY_LINKAGE_REVIEW: '레거시 추적 후보 기준 추가 가능',
    NEEDS_MANUAL_LINKAGE_REVIEW: '관리자 확인 묶음이 필요',
    NEEDS_STABLE_ID_COLLECTION: '고유 식별자 수집 보강 필요',
  };
  return labels[status] || status;
}

function writeMarkdown(filePath, audit) {
  const lines = [];
  lines.push('# PSI 근로자 추적 식별 기준 검증 보고서');
  lines.push('');
  lines.push(`- 생성시각(UTC): ${audit.meta.generatedAt}`);
  lines.push(`- 입력파일: ${audit.meta.input}`);
  lines.push(`- 판정: ${statusLabel(audit.status)} (${audit.status})`);
  lines.push(`- 기록 수: ${audit.counts.records}건`);
  lines.push(`- 기간: ${audit.dateDistribution.minDate || '-'} ~ ${audit.dateDistribution.maxDate || '-'} (${audit.dateDistribution.distinctMonthCount}개월)`);
  lines.push('');
  lines.push('## 핵심 판단');
  lines.push('');
  audit.recommendations.forEach((item) => lines.push(`- ${item}`));
  lines.push('');
  lines.push('## 식별 정보 보유율');
  lines.push('');
  lines.push('| 항목 | 건수 | 비율 |');
  lines.push('| --- | ---: | ---: |');
  Object.entries(audit.fieldCoverage).forEach(([field, item]) => {
    lines.push(`| ${field} | ${item.count} | ${item.rate}% |`);
  });
  lines.push('');
  lines.push('## 묶음 기준별 결과');
  lines.push('');
  lines.push('| 기준 | 대상 기록 | 그룹 | 반복 그룹 | 월별 추적 그룹 | 같은 날 중복 그룹 | 공종 변화 그룹 | 최대 기록/그룹 | 최대 개월/그룹 |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  audit.basisComparison.forEach((basis) => {
    lines.push(`| ${basis.label} | ${basis.eligibleRecords} (${basis.coverageRate}%) | ${basis.groups} | ${basis.repeatedGroups} | ${basis.multiMonthGroups} | ${basis.sameDateDuplicateGroups} | ${basis.jobChangeGroups} | ${basis.maxRecordsPerGroup} | ${basis.maxMonthsPerGroup} |`);
  });
  lines.push('');
  lines.push('## 날짜 분포');
  lines.push('');
  lines.push(`- 날짜 종류: ${audit.dateDistribution.distinctDateCount}개`);
  lines.push(`- 월 종류: ${audit.dateDistribution.distinctMonthCount}개`);
  lines.push(`- 월 목록: ${audit.dateDistribution.months.join(', ') || '-'}`);
  lines.push('');
  lines.push('### 월별 건수 TOP');
  lines.push('');
  lines.push('| 월 | 건수 |');
  lines.push('| --- | ---: |');
  audit.dateDistribution.topMonths.forEach((row) => lines.push(`| ${row.name} | ${row.count} |`));
  lines.push('');
  lines.push('## 반복 후보 샘플');
  lines.push('');
  audit.basisComparison
    .filter((basis) => ['name_nationality', 'name_nationality_team', 'current_job_name_nationality', 'worker_uuid', 'employee_id', 'qr_id'].includes(basis.id))
    .forEach((basis) => {
      lines.push(`### ${basis.label}`);
      lines.push('');
      if (!basis.candidateGroups.length) {
        lines.push('- 반복 후보 없음');
        lines.push('');
        return;
      }
      lines.push('| 이름(마스킹) | 국적 | 건수 | 기간 | 개월 | 공종 | 점수 평균 | 변화 | 같은 날 중복 |');
      lines.push('| --- | --- | ---: | --- | ---: | --- | ---: | ---: | --- |');
      basis.candidateGroups.forEach((group) => {
        lines.push(`| ${group.maskedName} | ${group.nationalities.join('/') || '-'} | ${group.count} | ${group.firstDate || '-'} ~ ${group.lastDate || '-'} | ${group.monthCount} | ${group.jobFields.join('/') || '-'} | ${group.scoreStats.avg} | ${group.deltaScore === null ? '-' : group.deltaScore} | ${group.hasSameDateDuplicate ? 'Y' : 'N'} |`);
      });
      lines.push('');
    });

  lines.push('## 운영 적용안');
  lines.push('');
  lines.push('1. QR/근로자번호/worker_uuid가 있으면 그것을 최우선 기준으로 사용합니다.');
  lines.push('2. 기존 백업처럼 강한 식별자가 부족한 자료는 이름+국적 기준으로 후보를 만들되, 자동 확정하지 않고 관리자 확인 대상으로 분리합니다.');
  lines.push('3. 공종과 반장은 근로자 식별키가 아니라 월별 이력 변화 항목으로 저장합니다.');
  lines.push('4. 같은 날 같은 이름+국적이 여러 건이면 동명이인 위험으로 표시하고 자동 병합을 막습니다.');
  lines.push('5. 신규 양식 실증 때는 촬영 직후 QR/근로자번호를 함께 저장해 이후 교육 이력과 자동 연결합니다.');
  lines.push('');

  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const inputPath = resolvePath(options.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file was not found: ${options.input}`);
    process.exit(1);
  }

  const fileSize = fs.statSync(inputPath).size;
  const metadata = await loadLightRecords(inputPath, fileSize);
  const audit = buildAudit(metadata.records, metadata, options, fileSize);

  const outputJsonPath = resolvePath(options.outputJson);
  const outputMdPath = resolvePath(options.outputMd);
  ensureParentDir(outputJsonPath);
  ensureParentDir(outputMdPath);
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  writeMarkdown(outputMdPath, audit);

  console.log('=== NEW-PSI worker identity linkage audit ===');
  console.log(`Input: ${options.input}`);
  console.log(`Status: ${audit.status}`);
  console.log(`Records: ${audit.counts.records}`);
  console.log(`Period: ${audit.dateDistribution.minDate || '-'} ~ ${audit.dateDistribution.maxDate || '-'} (${audit.dateDistribution.distinctMonthCount} months)`);
  const relaxed = getBasis(audit, 'name_nationality');
  const current = getBasis(audit, 'current_job_name_nationality');
  console.log(`Current strict multi-month groups: ${current?.multiMonthGroups ?? 0}`);
  console.log(`Name+nationality multi-month groups: ${relaxed?.multiMonthGroups ?? 0}`);
  console.log(`JSON report: ${options.outputJson}`);
  console.log(`Markdown report: ${options.outputMd}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
