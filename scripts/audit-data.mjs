#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const DEFAULT_OUTPUT_DIR = join(REPO_ROOT, 'artifacts', 'audit');
const DEFAULT_DATA_ROOT = 'C:\\Users\\user\\OneDrive\\Desktop\\용인대우현장\\4.본사\\2.위험성평가';
const DEFAULT_PUBLIC_SUMMARY = 'C:\\Users\\user\\Downloads\\NEW-PSI_검증용_비식별_요약_2026-06-17.json';
const DATA_FILE_PATTERN = /(?:PSI_Backup|psi_ocr_records)/i;
const MAX_PREFIX_BYTES = 32 * 1024 * 1024;
const TODAY_KEY = new Date().toISOString().slice(0, 10);

const REQUIRED_STRING_FIELDS = ['id', 'name', 'jobField', 'date', 'nationality', 'safetyLevel'];
const REQUIRED_ARRAY_FIELDS = ['strengths', 'weakAreas', 'suggestions', 'handwrittenAnswers'];
const VALID_LEVELS = new Set(['초급', '중급', '고급']);
const VALID_RISK_LEVELS = new Set(['상', '중', '하']);
const VALID_WORKFLOW_STATES = new Set([
    'uploaded',
    'ocr_validating',
    'manual_review_required',
    'context_ready',
    'first_pass_analyzing',
    'evaluator_review',
    'awaiting_manager_approval',
    'manager_revised',
    'second_pass_analyzing',
    'completed',
]);
const VALID_RISK_DECISIONS = new Set([
    'SAFE_TO_PROCEED',
    'SUPPLEMENTARY_REVIEW',
    'IMMEDIATE_ATTENTION',
    'CRITICAL_STOP',
]);
const VALID_APPROVAL_STATES = new Set(['NOT_REQUIRED', 'REQUIRED', 'PENDING', 'APPROVED', 'REJECTED']);
const SCORE_BREAKDOWN_RANGES = {
    psychological: [0, 10],
    jobUnderstanding: [0, 20],
    riskAssessmentUnderstanding: [0, 20],
    proficiency: [0, 30],
    improvementExecution: [0, 20],
    repeatViolationPenalty: [0, 30],
};

function parseArgs(argv) {
    const result = {
        inputs: [],
        outputDir: DEFAULT_OUTPUT_DIR,
        publicSummary: existsSync(DEFAULT_PUBLIC_SUMMARY) ? DEFAULT_PUBLIC_SUMMARY : '',
        maxFiles: 0,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--input' && argv[index + 1]) result.inputs.push(argv[++index]);
        else if (arg === '--output' && argv[index + 1]) result.outputDir = argv[++index];
        else if (arg === '--public-summary' && argv[index + 1]) result.publicSummary = argv[++index];
        else if (arg === '--max-files' && argv[index + 1]) result.maxFiles = Math.max(0, Number(argv[++index]) || 0);
        else if (arg === '--help') {
            console.log([
                'Usage: node scripts/audit-data.mjs [options]',
                '  --input <file-or-directory>  Repeatable. Defaults to the NEW-PSI field-data folder.',
                '  --output <directory>         Defaults to artifacts/audit.',
                '  --public-summary <json>      Optional public evidence summary for metric comparison.',
                '  --max-files <count>          Limits files for a smoke test.',
            ].join('\n'));
            process.exit(0);
        }
    }
    if (result.inputs.length === 0 && existsSync(DEFAULT_DATA_ROOT)) result.inputs.push(DEFAULT_DATA_ROOT);
    return result;
}

function walkJsonFiles(inputPath, files) {
    if (!existsSync(inputPath)) return;
    const stat = statSync(inputPath);
    if (stat.isFile()) {
        if (extname(inputPath).toLowerCase() === '.json') files.push(resolve(inputPath));
        return;
    }
    for (const entry of readdirSync(inputPath, { withFileTypes: true })) {
        const fullPath = join(inputPath, entry.name);
        if (entry.isDirectory()) walkJsonFiles(fullPath, files);
        else if (entry.isFile() && extname(entry.name).toLowerCase() === '.json' && DATA_FILE_PATTERN.test(entry.name)) {
            files.push(resolve(fullPath));
        }
    }
}

function shortHash(value) {
    return value ? createHash('sha256').update(String(value)).digest('hex').slice(0, 16) : '';
}

function normalizeIdentityText(value) {
    return typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : '';
}

function normalizeJobIdentityText(value) {
    const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (!raw) return '';
    const parts = raw.split(/[,\s/·ㆍ+|]+/).map((part) => part.trim()).filter(Boolean);
    return parts.length > 1
        ? Array.from(new Set(parts)).sort().join('+')
        : raw.replace(/[,\s/·ㆍ+|]+/g, '');
}

function getWorkerIdentityKey(record) {
    const name = normalizeIdentityText(record?.name);
    const job = normalizeJobIdentityText(record?.jobField);
    const nationality = normalizeIdentityText(record?.nationality) || 'UNKNOWN';
    if (name && !['식별대기', '이름없음', '이름미확인', '미상', '분석실패'].includes(name) && job) {
        return `job-name-nationality:${job}|${name}|${nationality}`;
    }
    const employeeId = normalizeIdentityText(record?.employeeId);
    if (employeeId) return `employee:${employeeId}`;
    const qrId = normalizeIdentityText(record?.qrId);
    if (qrId) return `qr:${qrId}`;
    const workerUuid = normalizeIdentityText(record?.worker_uuid || record?.workerUuid);
    if (workerUuid) return `worker:${workerUuid}`;
    return `record:${normalizeIdentityText(record?.id) || 'UNKNOWN'}`;
}

function parseDateKey(value) {
    const raw = String(value || '').trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(raw);
    if (!match) return { valid: false, key: '', canonical: false };
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    return { valid, key: valid ? `${match[1]}-${match[2]}-${match[3]}` : '', canonical: raw === `${match[1]}-${match[2]}-${match[3]}` };
}

function defaultSafetyLevel(score) {
    if (score >= 80) return '고급';
    if (score >= 60) return '중급';
    return '초급';
}

function stableCloneForFingerprint(record) {
    if (!record || typeof record !== 'object') return record;
    if (Array.isArray(record)) return record.map(stableCloneForFingerprint);
    const output = {};
    for (const key of Object.keys(record).sort()) {
        if (key === 'originalImage' || key === 'profileImage') continue;
        output[key] = stableCloneForFingerprint(record[key]);
    }
    return output;
}

function recordFingerprint(record) {
    return createHash('sha256').update(JSON.stringify(stableCloneForFingerprint(record))).digest('hex');
}

function csvEscape(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(path, rows, columns) {
    const lines = [columns.join(',')];
    for (const row of rows) lines.push(columns.map((column) => csvEscape(row[column])).join(','));
    writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function addIssue(target, context, category, code, field, message, severity = 'warning') {
    target.push({
        severity,
        category,
        code,
        file: context.fileLabel,
        recordIndex: context.recordIndex,
        recordIdHash: context.recordIdHash,
        workerKeyHash: context.workerKeyHash,
        field,
        message,
    });
}

function numberInRange(value, min, max) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function auditRecord(record, context, fileState, globalState) {
    const { errors, warnings, metricMismatches } = globalState;
    context.recordIdHash = shortHash(record?.id);
    const workerKey = getWorkerIdentityKey(record);
    context.workerKeyHash = shortHash(workerKey);

    for (const field of REQUIRED_STRING_FIELDS) {
        if (typeof record?.[field] !== 'string' || !record[field].trim()) {
            addIssue(errors, context, 'schema', 'REQUIRED_STRING_MISSING', field, '필수 문자열 값이 없거나 비어 있습니다.', 'error');
        }
    }
    for (const field of REQUIRED_ARRAY_FIELDS) {
        if (!Array.isArray(record?.[field])) {
            addIssue(errors, context, 'schema', 'REQUIRED_ARRAY_INVALID', field, '필수 배열 값이 배열 형식이 아닙니다.', 'error');
        }
    }

    if (!numberInRange(record?.safetyScore, 0, 100)) {
        addIssue(errors, context, 'numeric-range', 'SAFETY_SCORE_RANGE', 'safetyScore', '안전점수가 0~100 범위를 벗어나거나 숫자가 아닙니다.', 'error');
    }
    if (record?.ocrConfidence !== undefined && !numberInRange(record.ocrConfidence, 0, 1)) {
        addIssue(errors, context, 'numeric-range', 'OCR_CONFIDENCE_RANGE', 'ocrConfidence', 'OCR 신뢰도가 0~1 범위를 벗어났습니다.', 'error');
    }
    if (record?.signatureMatchScore !== undefined && !numberInRange(record.signatureMatchScore, 0, 1)) {
        addIssue(errors, context, 'numeric-range', 'SIGNATURE_SCORE_RANGE', 'signatureMatchScore', '서명 매칭 점수가 0~1 범위를 벗어났습니다.', 'error');
    }
    if (record?.integrityScore !== undefined && !numberInRange(record.integrityScore, 0, 100)) {
        addIssue(errors, context, 'numeric-range', 'INTEGRITY_SCORE_RANGE', 'integrityScore', '무결성 점수가 0~100 범위를 벗어났습니다.', 'error');
    }

    const date = parseDateKey(record?.date);
    if (!date.valid) {
        addIssue(errors, context, 'date', 'INVALID_RECORD_DATE', 'date', '기록일이 유효한 YYYY-MM-DD 날짜가 아닙니다.', 'error');
        fileState.invalidDateCount += 1;
    } else {
        fileState.dateCounts.set(date.key, (fileState.dateCounts.get(date.key) || 0) + 1);
        if (!date.canonical) addIssue(warnings, context, 'date', 'NON_CANONICAL_DATE', 'date', '기록일에 시각 또는 비표준 문자열이 포함되어 있습니다.');
        if (date.key > TODAY_KEY) {
            addIssue(errors, context, 'date', 'FUTURE_RECORD_DATE', 'date', '기록일이 검사일보다 미래입니다.', 'error');
            fileState.futureDateCount += 1;
        }
    }

    if (record?.safetyLevel && !VALID_LEVELS.has(record.safetyLevel)) {
        addIssue(errors, context, 'enum', 'INVALID_SAFETY_LEVEL', 'safetyLevel', '지원하지 않는 안전등급입니다.', 'error');
    }
    if (record?.selfAssessedRiskLevel && !VALID_RISK_LEVELS.has(record.selfAssessedRiskLevel)) {
        addIssue(errors, context, 'enum', 'INVALID_SELF_RISK_LEVEL', 'selfAssessedRiskLevel', '자가 위험등급이 상·중·하가 아닙니다.', 'error');
    }
    if (record?.workflowState && !VALID_WORKFLOW_STATES.has(record.workflowState)) {
        addIssue(errors, context, 'reference', 'INVALID_WORKFLOW_STATE', 'workflowState', '지원하지 않는 워크플로우 상태입니다.', 'error');
    }
    if (record?.riskDecision && !VALID_RISK_DECISIONS.has(record.riskDecision)) {
        addIssue(errors, context, 'reference', 'INVALID_RISK_DECISION', 'riskDecision', '지원하지 않는 보호 판단 상태입니다.', 'error');
    }
    if (record?.approvalState && !VALID_APPROVAL_STATES.has(record.approvalState)) {
        addIssue(errors, context, 'reference', 'INVALID_APPROVAL_STATE', 'approvalState', '지원하지 않는 승인 상태입니다.', 'error');
    }

    const workerUuid = normalizeIdentityText(record?.worker_uuid);
    const workerUuidAlias = normalizeIdentityText(record?.workerUuid);
    if (workerUuid && workerUuidAlias && workerUuid !== workerUuidAlias) {
        addIssue(errors, context, 'reference', 'WORKER_UUID_ALIAS_MISMATCH', 'worker_uuid/workerUuid', '두 근로자 UUID 필드가 서로 다릅니다.', 'error');
    }
    if (record?.approvalStatus === 'APPROVED' || record?.approvalStatus === 'OVERRIDDEN') {
        if (!String(record?.approvedBy || '').trim()) addIssue(errors, context, 'reference', 'APPROVAL_ACTOR_MISSING', 'approvedBy', '승인 완료 기록에 승인자가 없습니다.', 'error');
        if (!parseDateKey(record?.approvedAt).valid && Number.isNaN(new Date(String(record?.approvedAt || '')).getTime())) {
            addIssue(errors, context, 'reference', 'APPROVAL_DATE_MISSING', 'approvedAt', '승인 완료 기록에 유효한 승인시각이 없습니다.', 'error');
        }
    }
    if (record?.approvalState === 'APPROVED' && record?.workflowState && record.workflowState !== 'completed') {
        addIssue(warnings, context, 'reference', 'APPROVED_WORKFLOW_NOT_COMPLETED', 'workflowState', '승인 완료지만 워크플로우가 completed 상태가 아닙니다.');
    }
    if (record?.riskDecision === 'CRITICAL_STOP' && record?.approvalState === 'NOT_REQUIRED') {
        addIssue(errors, context, 'reference', 'CRITICAL_STOP_WITHOUT_APPROVAL', 'approvalState', '작업중지 판단인데 승인이 불필요한 상태입니다.', 'error');
    }

    const questionNumbers = Array.isArray(record?.handwrittenAnswers)
        ? record.handwrittenAnswers.map((answer) => String(answer?.questionNumber || '').trim()).filter(Boolean)
        : [];
    const duplicateQuestionCount = questionNumbers.length - new Set(questionNumbers).size;
    if (duplicateQuestionCount > 0) {
        addIssue(warnings, context, 'reference', 'DUPLICATE_QUESTION_NUMBER', 'handwrittenAnswers', `중복 문항 번호가 ${duplicateQuestionCount}건 있습니다.`);
    }

    const breakdown = record?.scoreBreakdown;
    if (breakdown && typeof breakdown === 'object') {
        let breakdownValid = true;
        for (const [field, [min, max]] of Object.entries(SCORE_BREAKDOWN_RANGES)) {
            if (!numberInRange(breakdown[field], min, max)) {
                breakdownValid = false;
                addIssue(errors, context, 'numeric-range', 'SCORE_BREAKDOWN_RANGE', `scoreBreakdown.${field}`, `6대 지표 값이 ${min}~${max} 범위를 벗어났습니다.`, 'error');
            }
        }
        if (breakdownValid && numberInRange(record?.safetyScore, 0, 100)) {
            const expected = Math.max(0, Math.min(100, Math.round(
                breakdown.psychological
                + breakdown.jobUnderstanding
                + breakdown.riskAssessmentUnderstanding
                + breakdown.proficiency
                + breakdown.improvementExecution
                - breakdown.repeatViolationPenalty,
            )));
            const gap = Math.abs(expected - record.safetyScore);
            if (gap > 1) {
                metricMismatches.push({
                    file: context.fileLabel,
                    recordIndex: context.recordIndex,
                    recordIdHash: context.recordIdHash,
                    workerKeyHash: context.workerKeyHash,
                    metric: 'safetyScore',
                    storedValue: record.safetyScore,
                    calculatedValue: expected,
                    gap,
                    rule: '①+②+③+④+⑤-⑥, clamp 0~100',
                });
            }
        }
    }

    if (numberInRange(record?.safetyScore, 0, 100) && VALID_LEVELS.has(record?.safetyLevel)) {
        const expectedLevel = defaultSafetyLevel(record.safetyScore);
        if (record.safetyLevel !== expectedLevel) {
            metricMismatches.push({
                file: context.fileLabel,
                recordIndex: context.recordIndex,
                recordIdHash: context.recordIdHash,
                workerKeyHash: context.workerKeyHash,
                metric: 'safetyLevel',
                storedValue: record.safetyLevel,
                calculatedValue: expectedLevel,
                gap: '',
                rule: '기본 임계값 고급>=80, 중급>=60',
            });
        }
    }

    const adjustmentHistory = Array.isArray(record?.scoreAdjustmentHistory) ? record.scoreAdjustmentHistory : [];
    adjustmentHistory.forEach((entry, adjustmentIndex) => {
        if (!numberInRange(entry?.previousScore, 0, 100) || !numberInRange(entry?.nextScore, 0, 100)) {
            addIssue(errors, context, 'reference', 'INVALID_SCORE_ADJUSTMENT', `scoreAdjustmentHistory[${adjustmentIndex}]`, '점수 조정 이력의 이전/다음 점수가 유효하지 않습니다.', 'error');
        }
    });
    if (adjustmentHistory.length > 0 && numberInRange(record?.safetyScore, 0, 100)) {
        const last = adjustmentHistory.at(-1);
        if (numberInRange(last?.nextScore, 0, 100) && Math.abs(last.nextScore - record.safetyScore) > 1) {
            addIssue(warnings, context, 'reference', 'SCORE_HISTORY_CURRENT_MISMATCH', 'scoreAdjustmentHistory', '마지막 점수 조정값과 현재 안전점수가 다릅니다.');
        }
    }

    for (const historyField of ['correctionHistory', 'actionHistory', 'approvalHistory', 'auditTrail']) {
        if (!Array.isArray(record?.[historyField])) continue;
        record[historyField].forEach((entry, historyIndex) => {
            const timestamp = String(entry?.timestamp || '');
            if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) {
                addIssue(warnings, context, 'date', 'INVALID_HISTORY_TIMESTAMP', `${historyField}[${historyIndex}].timestamp`, '이력 시각이 없거나 유효하지 않습니다.');
            }
        });
    }

    const id = String(record?.id || '').trim();
    const evidenceHash = String(record?.evidenceHash || '').trim();
    const fingerprint = recordFingerprint(record);
    if (id) {
        const previous = fileState.ids.get(id);
        if (previous) {
            fileState.duplicateIdCount += 1;
            addIssue(errors, context, 'duplicate', 'DUPLICATE_ID_IN_FILE', 'id', '같은 파일 안에서 ID가 중복되었습니다.', 'error');
        } else {
            fileState.ids.set(id, { fingerprint, recordIndex: context.recordIndex });
        }
    }
    if (evidenceHash) {
        if (fileState.evidenceHashes.has(evidenceHash)) {
            fileState.duplicateEvidenceCount += 1;
            addIssue(warnings, context, 'duplicate', 'DUPLICATE_EVIDENCE_HASH_IN_FILE', 'evidenceHash', '같은 파일 안에서 증빙 해시가 중복되었습니다.');
        }
        fileState.evidenceHashes.add(evidenceHash);
    }

    const workerGroup = fileState.workerGroups.get(workerKey) || {
        count: 0,
        months: new Set(),
        scores: [],
        uuids: new Set(),
        jobs: new Set(),
        nameNationalityKey: `${normalizeIdentityText(record?.name)}|${normalizeIdentityText(record?.nationality)}`,
    };
    workerGroup.count += 1;
    if (date.valid) workerGroup.months.add(date.key.slice(0, 7));
    if (numberInRange(record?.safetyScore, 0, 100)) workerGroup.scores.push({ date: date.key, value: record.safetyScore });
    if (workerUuid || workerUuidAlias) workerGroup.uuids.add(workerUuid || workerUuidAlias);
    if (record?.jobField) workerGroup.jobs.add(normalizeJobIdentityText(record.jobField));
    fileState.workerGroups.set(workerKey, workerGroup);

    const uuid = workerUuid || workerUuidAlias;
    if (uuid) {
        const keys = fileState.uuidToIdentityKeys.get(uuid) || new Set();
        keys.add(workerKey);
        fileState.uuidToIdentityKeys.set(uuid, keys);
    }
    const identityUuids = fileState.identityKeyToUuids.get(workerKey) || new Set();
    if (uuid) identityUuids.add(uuid);
    fileState.identityKeyToUuids.set(workerKey, identityUuids);

    globalState.globalIdOccurrences.set(id, (globalState.globalIdOccurrences.get(id) || 0) + 1);
    if (evidenceHash) globalState.globalEvidenceOccurrences.set(evidenceHash, (globalState.globalEvidenceOccurrences.get(evidenceHash) || 0) + 1);
}

async function streamRecords(filePath, onRecord) {
    const fileHash = createHash('sha256');
    const stream = createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1024 * 1024 });
    let prefix = '';
    let foundArray = false;
    let rootChecked = false;
    let rootIsArray = false;
    let collecting = false;
    let buffer = '';
    let depth = 0;
    let inString = false;
    let escaped = false;
    let scalarBuffer = '';
    let recordIndex = 0;
    let nonObjectCount = 0;
    let parseErrorCount = 0;
    let metadata = { schemaVersion: 'legacy-array', exportedAt: '', manifest: {} };

    const processArrayText = async (text) => {
        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            if (!collecting) {
                if (/\s|,/.test(char)) continue;
                if (char === ']') return;
                if (char === '{' || char === '[') {
                    collecting = true;
                    buffer = char;
                    depth = 1;
                    inString = false;
                    escaped = false;
                    continue;
                }
                scalarBuffer = char;
                collecting = true;
                buffer = '';
                depth = -1;
                continue;
            }
            if (depth === -1) {
                if (char === ',' || char === ']') {
                    nonObjectCount += 1;
                    collecting = false;
                    scalarBuffer = '';
                    if (char === ']') return;
                } else {
                    scalarBuffer += char;
                }
                continue;
            }

            buffer += char;
            if (inString) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') inString = false;
                continue;
            }
            if (char === '"') {
                inString = true;
                continue;
            }
            if (char === '{' || char === '[') depth += 1;
            else if (char === '}' || char === ']') depth -= 1;
            if (depth === 0) {
                recordIndex += 1;
                try {
                    const parsed = JSON.parse(buffer);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) await onRecord(parsed, recordIndex);
                    else nonObjectCount += 1;
                } catch {
                    parseErrorCount += 1;
                }
                collecting = false;
                buffer = '';
            }
        }
    };

    for await (const chunk of stream) {
        fileHash.update(chunk);
        if (foundArray) {
            await processArrayText(chunk);
            continue;
        }
        prefix += chunk;
        if (!rootChecked) {
            const first = prefix.replace(/^\uFEFF?\s*/, '')[0];
            if (!first) continue;
            rootChecked = true;
            rootIsArray = first === '[';
        }
        if (rootIsArray) {
            const start = prefix.indexOf('[');
            foundArray = true;
            await processArrayText(prefix.slice(start + 1));
            prefix = '';
            continue;
        }
        const match = /"(records|workerRecords|data|items)"\s*:\s*\[/m.exec(prefix);
        if (match) {
            const arrayStart = match.index + match[0].lastIndexOf('[');
            const schemaMatch = /"schemaVersion"\s*:\s*"([^"]+)"/m.exec(prefix.slice(0, arrayStart));
            const exportedAtMatch = /"exportedAt"\s*:\s*"([^"]+)"/m.exec(prefix.slice(0, arrayStart));
            const manifest = {};
            for (const key of [
                'recordCount',
                'workerGroups',
                'repeatedWorkerGroups',
                'multiMonthWorkerGroups',
                'maxMonthsPerWorker',
                'lowScoreRecords',
                'imageCoverageRate',
                'handwrittenCoverageRate',
                'aiInsightCoverageRate',
                'nativeGuidanceCoverageRate',
            ]) {
                const metricMatch = new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, 'm').exec(prefix.slice(0, arrayStart));
                if (metricMatch) manifest[key] = Number(metricMatch[1]);
            }
            metadata = {
                schemaVersion: schemaMatch?.[1] || 'legacy-object',
                exportedAt: exportedAtMatch?.[1] || '',
                manifest,
            };
            foundArray = true;
            await processArrayText(prefix.slice(arrayStart + 1));
            prefix = '';
            continue;
        }
        if (Buffer.byteLength(prefix, 'utf8') > MAX_PREFIX_BYTES) {
            throw new Error('records 배열을 32MB 이내에서 찾지 못했습니다.');
        }
    }
    if (!foundArray) throw new Error('근로자 레코드 배열을 찾지 못했습니다.');
    if (collecting && depth > 0) parseErrorCount += 1;
    return {
        fileHash: fileHash.digest('hex'),
        recordCount: recordIndex,
        nonObjectCount,
        parseErrorCount,
        metadata,
    };
}

function createFileState(filePath) {
    const stat = statSync(filePath);
    return {
        path: filePath,
        fileLabel: relative(REPO_ROOT, filePath),
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        startedAt: Date.now(),
        ids: new Map(),
        evidenceHashes: new Set(),
        workerGroups: new Map(),
        uuidToIdentityKeys: new Map(),
        identityKeyToUuids: new Map(),
        dateCounts: new Map(),
        invalidDateCount: 0,
        futureDateCount: 0,
        duplicateIdCount: 0,
        duplicateEvidenceCount: 0,
        lowScoreRecords: 0,
    };
}

function finalizeFileState(fileState, streamResult, globalState) {
    const { errors, warnings, metricMismatches } = globalState;
    for (const [uuid, identityKeys] of fileState.uuidToIdentityKeys) {
        if (identityKeys.size > 1) {
            warnings.push({
                severity: 'warning',
                category: 'worker-link',
                code: 'UUID_LINKS_MULTIPLE_IDENTITIES',
                file: fileState.fileLabel,
                recordIndex: '',
                recordIdHash: '',
                workerKeyHash: shortHash(uuid),
                field: 'worker_uuid',
                message: `하나의 UUID가 ${identityKeys.size}개 근로자 식별키와 연결됩니다.`,
            });
        }
    }
    for (const [identityKey, uuids] of fileState.identityKeyToUuids) {
        if (uuids.size > 1) {
            warnings.push({
                severity: 'warning',
                category: 'worker-link',
                code: 'IDENTITY_LINKS_MULTIPLE_UUIDS',
                file: fileState.fileLabel,
                recordIndex: '',
                recordIdHash: '',
                workerKeyHash: shortHash(identityKey),
                field: 'worker_uuid',
                message: `하나의 근로자 식별키에 ${uuids.size}개 UUID가 연결됩니다.`,
            });
        }
    }

    let repeatedWorkerGroups = 0;
    let multiMonthWorkerGroups = 0;
    let improvingWorkerGroups = 0;
    let decliningWorkerGroups = 0;
    let stableWorkerGroups = 0;
    let maxMonthsPerWorker = 0;
    for (const group of fileState.workerGroups.values()) {
        if (group.count > 1) repeatedWorkerGroups += 1;
        if (group.months.size > 1) multiMonthWorkerGroups += 1;
        maxMonthsPerWorker = Math.max(maxMonthsPerWorker, group.months.size);
        const scores = group.scores.filter((score) => score.date).sort((a, b) => a.date.localeCompare(b.date));
        if (scores.length > 1) {
            const delta = scores.at(-1).value - scores[0].value;
            if (delta >= 5) improvingWorkerGroups += 1;
            else if (delta <= -5) decliningWorkerGroups += 1;
            else stableWorkerGroups += 1;
        }
    }
    const dates = Array.from(fileState.dateCounts.keys()).sort();
    const dominantDate = Array.from(fileState.dateCounts.entries()).sort((a, b) => b[1] - a[1])[0] || ['', 0];
    const recordCount = streamResult.recordCount;
    const lowScoreRecords = fileState.lowScoreRecords;
    const metrics = {
        recordCount,
        workerGroups: fileState.workerGroups.size,
        repeatedWorkerGroups,
        multiMonthWorkerGroups,
        maxMonthsPerWorker,
        improvingWorkerGroups,
        decliningWorkerGroups,
        stableWorkerGroups,
        lowScoreRecords,
    };
    for (const [metric, storedValue] of Object.entries(streamResult.metadata.manifest || {})) {
        if (!(metric in metrics)) continue;
        const calculatedValue = metrics[metric];
        if (Number(storedValue) !== Number(calculatedValue)) {
            metricMismatches.push({
                file: fileState.fileLabel,
                recordIndex: '',
                recordIdHash: '',
                workerKeyHash: '',
                metric: `manifest.${metric}`,
                storedValue,
                calculatedValue,
                gap: Math.abs(Number(storedValue) - Number(calculatedValue)),
                rule: '백업 manifest와 실제 레코드 전수집계 비교',
            });
        }
    }
    if (dominantDate[1] === recordCount && recordCount >= 20) {
        warnings.push({
            severity: 'warning',
            category: 'date',
            code: 'SINGLE_DATE_CONCENTRATION',
            file: fileState.fileLabel,
            recordIndex: '',
            recordIdHash: '',
            workerKeyHash: '',
            field: 'date',
            message: `유효 기록이 한 날짜에 ${recordCount}건 집중되어 파일 단독으로 다월 추적 근거가 되지 않습니다.`,
        });
    }

    return {
        file: fileState.fileLabel,
        path: fileState.path,
        sizeBytes: fileState.sizeBytes,
        modifiedAt: fileState.modifiedAt,
        sha256: streamResult.fileHash,
        schemaVersion: streamResult.metadata.schemaVersion,
        exportedAt: streamResult.metadata.exportedAt,
        durationMs: Date.now() - fileState.startedAt,
        recordCount,
        nonObjectCount: streamResult.nonObjectCount,
        parseErrorCount: streamResult.parseErrorCount,
        duplicateIdCount: fileState.duplicateIdCount,
        duplicateEvidenceCount: fileState.duplicateEvidenceCount,
        invalidDateCount: fileState.invalidDateCount,
        futureDateCount: fileState.futureDateCount,
        minDate: dates[0] || '',
        maxDate: dates.at(-1) || '',
        distinctDateCount: dates.length,
        distinctMonthCount: new Set(dates.map((date) => date.slice(0, 7))).size,
        dominantDate: dominantDate[0],
        dominantDateCount: dominantDate[1],
        ...metrics,
        idMap: fileState.ids,
    };
}

function buildRestoreDiff(fileSummaries) {
    const exactDuplicateGroups = new Map();
    for (const file of fileSummaries) {
        const group = exactDuplicateGroups.get(file.sha256) || [];
        group.push(file.file);
        exactDuplicateGroups.set(file.sha256, group);
    }
    const exactDuplicates = Array.from(exactDuplicateGroups.entries())
        .filter(([, files]) => files.length > 1)
        .map(([sha256, files]) => ({ sha256, files }));

    const ordered = [...fileSummaries].sort((a, b) => a.modifiedAt.localeCompare(b.modifiedAt));
    const comparisons = [];
    for (let index = 1; index < ordered.length; index += 1) {
        const before = ordered[index - 1];
        const after = ordered[index];
        let added = 0;
        let removed = 0;
        let changed = 0;
        let unchanged = 0;
        for (const [id, current] of after.idMap) {
            const previous = before.idMap.get(id);
            if (!previous) added += 1;
            else if (previous.fingerprint === current.fingerprint) unchanged += 1;
            else changed += 1;
        }
        for (const id of before.idMap.keys()) {
            if (!after.idMap.has(id)) removed += 1;
        }
        comparisons.push({
            before: before.file,
            after: after.file,
            beforeRecords: before.recordCount,
            incomingRecords: after.recordCount,
            idCollisions: changed + unchanged,
            added,
            removed,
            changed,
            unchanged,
            projectedMergeTotal: before.idMap.size + added,
            exactFileDuplicate: before.sha256 === after.sha256,
        });
    }
    return { exactDuplicates, sequentialComparisons: comparisons };
}

function sanitizeSummaryFile(file) {
    const { idMap, ...safe } = file;
    return safe;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const discovered = [];
    options.inputs.forEach((input) => walkJsonFiles(resolve(input), discovered));
    let files = Array.from(new Set(discovered)).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
    if (options.maxFiles > 0) files = files.slice(-options.maxFiles);
    if (files.length === 0) throw new Error('검사할 JSON 파일을 찾지 못했습니다.');

    mkdirSync(resolve(options.outputDir), { recursive: true });
    const globalState = {
        errors: [],
        warnings: [],
        metricMismatches: [],
        globalIdOccurrences: new Map(),
        globalEvidenceOccurrences: new Map(),
    };
    const fileSummaries = [];
    const startedAt = new Date();

    for (const [fileIndex, filePath] of files.entries()) {
        const fileState = createFileState(filePath);
        console.log(`[audit-data] ${fileIndex + 1}/${files.length} ${basename(fileState.path)} (${(fileState.sizeBytes / 1024 / 1024).toFixed(1)} MB)`);
        try {
            const result = await streamRecords(filePath, async (record, recordIndex) => {
                if (typeof record?.safetyScore === 'number' && record.safetyScore < 60) {
                    fileState.lowScoreRecords += 1;
                }
                auditRecord(record, {
                    fileLabel: fileState.fileLabel,
                    recordIndex,
                    recordIdHash: '',
                    workerKeyHash: '',
                }, fileState, globalState);
            });
            fileSummaries.push(finalizeFileState(fileState, result, globalState));
        } catch (error) {
            globalState.errors.push({
                severity: 'error',
                category: 'file',
                code: 'FILE_AUDIT_FAILED',
                file: fileState.fileLabel,
                recordIndex: '',
                recordIdHash: '',
                workerKeyHash: '',
                field: '',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    for (const [id, count] of globalState.globalIdOccurrences) {
        if (id && count > 1) {
            globalState.warnings.push({
                severity: 'warning',
                category: 'cross-file-duplicate',
                code: 'ID_REPEATED_ACROSS_SNAPSHOTS',
                file: 'ALL',
                recordIndex: '',
                recordIdHash: shortHash(id),
                workerKeyHash: '',
                field: 'id',
                message: `동일 ID가 전체 스냅샷에서 ${count}회 발견되었습니다.`,
            });
        }
    }
    for (const [hash, count] of globalState.globalEvidenceOccurrences) {
        if (hash && count > 1) {
            globalState.warnings.push({
                severity: 'warning',
                category: 'cross-file-duplicate',
                code: 'EVIDENCE_REPEATED_ACROSS_SNAPSHOTS',
                file: 'ALL',
                recordIndex: '',
                recordIdHash: shortHash(hash),
                workerKeyHash: '',
                field: 'evidenceHash',
                message: `동일 증빙 해시가 전체 스냅샷에서 ${count}회 발견되었습니다.`,
            });
        }
    }

    let publicSummaryComparison = null;
    if (options.publicSummary && existsSync(options.publicSummary)) {
        try {
            const parsed = JSON.parse(await import('node:fs/promises').then((fs) => fs.readFile(options.publicSummary, 'utf8')));
            publicSummaryComparison = {
                file: options.publicSummary,
                generatedAt: parsed?.generatedAt || '',
                claimed: {
                    totalSavedRecords: parsed?.counts?.totalSavedRecords ?? null,
                    workerGroups: parsed?.counts?.workerGroups ?? null,
                    multiMonthWorkerGroups: parsed?.evidenceReadinessSummary?.multiMonthWorkerGroups ?? null,
                    lowScoreRecords: parsed?.evidenceReadinessSummary?.lowScoreRecords ?? null,
                },
                matchingAuditedSnapshots: fileSummaries
                    .filter((file) => file.recordCount === parsed?.counts?.totalSavedRecords)
                    .map((file) => file.file),
            };
        } catch (error) {
            globalState.warnings.push({
                severity: 'warning',
                category: 'public-summary',
                code: 'PUBLIC_SUMMARY_READ_FAILED',
                file: basename(options.publicSummary),
                recordIndex: '',
                recordIdHash: '',
                workerKeyHash: '',
                field: '',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const restoreDiff = buildRestoreDiff(fileSummaries);
    const totalBytes = fileSummaries.reduce((sum, file) => sum + file.sizeBytes, 0);
    const summary = {
        auditVersion: '1.0.0',
        generatedAt: new Date().toISOString(),
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        inputFiles: files.length,
        totalBytes,
        totalRecordsScanned: fileSummaries.reduce((sum, file) => sum + file.recordCount, 0),
        filesAudited: fileSummaries.length,
        filesFailed: files.length - fileSummaries.length,
        errorCount: globalState.errors.length,
        warningCount: globalState.warnings.length,
        metricMismatchCount: globalState.metricMismatches.length,
        exactDuplicateFileGroups: restoreDiff.exactDuplicates.length,
        publicSummaryComparison,
        files: fileSummaries.map(sanitizeSummaryFile),
        privacy: {
            rawRecordsWritten: false,
            originalImagesWritten: false,
            personalNamesWritten: false,
            identifiersInCsv: 'SHA-256 truncated hashes only',
        },
    };

    const outputDir = resolve(options.outputDir);
    writeFileSync(join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    writeCsv(join(outputDir, 'errors.csv'), globalState.errors, [
        'severity', 'category', 'code', 'file', 'recordIndex', 'recordIdHash', 'workerKeyHash', 'field', 'message',
    ]);
    writeCsv(join(outputDir, 'warnings.csv'), globalState.warnings, [
        'severity', 'category', 'code', 'file', 'recordIndex', 'recordIdHash', 'workerKeyHash', 'field', 'message',
    ]);
    writeFileSync(join(outputDir, 'restore-diff.json'), `${JSON.stringify(restoreDiff, null, 2)}\n`, 'utf8');
    writeCsv(join(outputDir, 'metric-mismatches.csv'), globalState.metricMismatches, [
        'file', 'recordIndex', 'recordIdHash', 'workerKeyHash', 'metric', 'storedValue', 'calculatedValue', 'gap', 'rule',
    ]);

    console.log(`[audit-data] complete files=${summary.filesAudited}/${summary.inputFiles} records=${summary.totalRecordsScanned} errors=${summary.errorCount} warnings=${summary.warningCount} metricMismatches=${summary.metricMismatchCount}`);
    console.log(`[audit-data] output=${relative(REPO_ROOT, outputDir)}`);
    if (summary.filesFailed > 0) process.exitCode = 2;
}

main().catch((error) => {
    console.error(`[audit-data] fatal: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
