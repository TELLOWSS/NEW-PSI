import type { WorkerRecord } from '../types';

const GENERIC_WORKER_NAMES = new Set(['식별대기', '이름없음', '이름미확인', '미상', '분석실패']);
const GENERIC_NATIONALITIES = new Set(['미상', '알수없음', 'UNKNOWN', 'UNSPECIFIED']);

export type WorkerRegistrationIdentityRecord = Partial<WorkerRecord> & {
    job_field?: unknown;
    team_name?: unknown;
    phone_number?: unknown;
    phoneNumber?: unknown;
    birth_date?: unknown;
    birthDate?: unknown;
    passport_number?: unknown;
    passportNumber?: unknown;
};

export const normalizeWorkerIdentityText = (value: unknown): string => {
    return typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : '';
};

export const normalizeWorkerJobIdentityText = (value: unknown): string => {
    const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (!raw) return '';

    const parts = raw
        .split(/[,\s/·ㆍ+|]+/)
        .map((part) => part.trim())
        .filter(Boolean);

    return parts.length > 1
        ? Array.from(new Set(parts)).sort().join('+')
        : raw.replace(/[,\s/·ㆍ+|]+/g, '');
};

export const stableWorkerHash = (seed: string): string => {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index++) {
        hash ^= seed.charCodeAt(index);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return Math.abs(hash >>> 0).toString(36).toUpperCase();
};

const getRawWorkerUuidValue = (value: unknown): string => {
    return typeof value === 'string' ? value.trim() : '';
};

export const getWorkerUuidValues = (record: Partial<WorkerRecord>): string[] => {
    return Array.from(new Set([
        normalizeWorkerIdentityText(record.worker_uuid),
        normalizeWorkerIdentityText(record.workerUuid),
    ].filter(Boolean)));
};

export const getWorkerUuidValue = (record: Partial<WorkerRecord>): string => {
    return getWorkerUuidValues(record)[0] || '';
};

export const hasWorkerUuidConflict = (record: Partial<WorkerRecord>): boolean => {
    return getWorkerUuidValues(record).length > 1;
};

export const getWorkerNameIdentitySeed = (record: Partial<WorkerRecord>): string => {
    const normalizedName = normalizeWorkerIdentityText(record.name);
    if (!normalizedName || GENERIC_WORKER_NAMES.has(normalizedName)) return '';

    const normalizedJobField = normalizeWorkerJobIdentityText(record.jobField);
    if (!normalizedJobField) return '';

    const normalizedNationality = normalizeWorkerIdentityText(record.nationality);
    if (!normalizedNationality || GENERIC_NATIONALITIES.has(normalizedNationality)) return '';

    return `${normalizedJobField}|${normalizedName}|${normalizedNationality}`;
};

export const buildNameBasedWorkerUuid = (record: Partial<WorkerRecord>): string => {
    const seed = getWorkerNameIdentitySeed(record);
    return seed ? `WN-${stableWorkerHash(seed).slice(0, 12)}` : '';
};

export const applyWorkerUuidPolicy = (
    record: WorkerRecord,
    inheritedUuid: unknown = '',
): WorkerRecord => {
    const snakeUuid = getRawWorkerUuidValue(record.worker_uuid);
    const camelUuid = getRawWorkerUuidValue(record.workerUuid);

    if (snakeUuid || camelUuid) {
        return {
            ...record,
            worker_uuid: snakeUuid || camelUuid,
            workerUuid: camelUuid || snakeUuid,
        };
    }

    const employeeId = normalizeWorkerIdentityText(record.employeeId);
    const qrId = normalizeWorkerIdentityText(record.qrId);
    const inherited = getRawWorkerUuidValue(inheritedUuid);
    const assignedUuid =
        inherited ||
        buildNameBasedWorkerUuid(record) ||
        (employeeId ? `WU-${employeeId}` : '') ||
        (qrId ? `WU-${qrId}` : '') ||
        `WU-${stableWorkerHash([
            normalizeWorkerIdentityText(record.id),
            normalizeWorkerIdentityText(record.name),
            normalizeWorkerIdentityText(record.nationality),
            normalizeWorkerIdentityText(record.teamLeader),
            normalizeWorkerIdentityText(record.jobField),
            normalizeWorkerIdentityText(record.role),
        ].join('|')).slice(0, 12)}`;

    return {
        ...record,
        worker_uuid: assignedUuid,
        workerUuid: assignedUuid,
    };
};

export const getWorkerIdentityKey = (record: Partial<WorkerRecord>): string => {
    if (hasWorkerUuidConflict(record)) {
        return `record:${normalizeWorkerIdentityText(record.id) || 'UUID-CONFLICT'}`;
    }

    const workerUuid = getWorkerUuidValue(record);
    if (workerUuid) return `worker:${workerUuid}`;

    const nameSeed = getWorkerNameIdentitySeed(record);
    if (nameSeed) return `job-name-nationality:${nameSeed}`;

    const employeeId = normalizeWorkerIdentityText(record.employeeId);
    if (employeeId) return `employee:${employeeId}`;

    const qrId = normalizeWorkerIdentityText(record.qrId);
    if (qrId) return `qr:${qrId}`;

    return `record:${normalizeWorkerIdentityText(record.id) || 'UNKNOWN'}`;
};

export const getWorkerMatchScore = (target: Partial<WorkerRecord>, candidate: Partial<WorkerRecord>): number => {
    const targetUuids = getWorkerUuidValues(target);
    const candidateUuids = getWorkerUuidValues(candidate);

    if (targetUuids.length > 1 || candidateUuids.length > 1) return -1;
    if (targetUuids.length === 1 && candidateUuids.length === 1) {
        return targetUuids[0] === candidateUuids[0] ? 160 : -1;
    }

    const targetNameSeed = getWorkerNameIdentitySeed(target);
    const candidateNameSeed = getWorkerNameIdentitySeed(candidate);
    if (targetNameSeed && candidateNameSeed) {
        return targetNameSeed === candidateNameSeed ? 130 : -1;
    }

    const targetEmployeeId = normalizeWorkerIdentityText(target.employeeId);
    const candidateEmployeeId = normalizeWorkerIdentityText(candidate.employeeId);
    if (targetEmployeeId && candidateEmployeeId && targetEmployeeId === candidateEmployeeId) return 110;

    const targetQrId = normalizeWorkerIdentityText(target.qrId);
    const candidateQrId = normalizeWorkerIdentityText(candidate.qrId);
    if (targetQrId && candidateQrId && targetQrId === candidateQrId) return 100;

    return -1;
};

export const hasAmbiguousStableWorkerMatches = (
    target: Partial<WorkerRecord>,
    candidates: Partial<WorkerRecord>[],
): boolean => {
    if (getWorkerUuidValues(target).length > 0) return false;

    const matchedStableUuids = new Set(
        candidates
            .filter((candidate) => getWorkerMatchScore(target, candidate) >= 55)
            .map(getWorkerUuidValue)
            .filter(Boolean),
    );

    return matchedStableUuids.size > 1;
};

export const isSameWorkerTimeline = (base: Partial<WorkerRecord>, candidate: Partial<WorkerRecord>): boolean => {
    return getWorkerMatchScore(base, candidate) >= 55;
};

const getRegistrationIdentityKey = (
    record: WorkerRegistrationIdentityRecord,
    index: number,
): string => {
    const uuidValues = getWorkerUuidValues(record);
    if (uuidValues.length === 1) return `worker:${uuidValues[0]}`;
    if (uuidValues.length > 1) {
        return `record:${normalizeWorkerIdentityText(record.id) || index}:uuid-conflict`;
    }

    const nameSeed = getWorkerNameIdentitySeed({
        ...record,
        jobField: String(record.jobField || record.job_field || ''),
    });
    const team = normalizeWorkerIdentityText(record.teamLeader || record.team_name);
    if (nameSeed) return `legacy:${nameSeed}|${team || 'UNKNOWN-TEAM'}`;

    return `record:${normalizeWorkerIdentityText(record.id) || index}`;
};

const firstNonEmptyRegistrationValue = (...values: unknown[]): unknown => {
    return values.find((value) => String(value || '').trim().length > 0);
};

export const mergeWorkerRegistrationRecords = (
    records: WorkerRegistrationIdentityRecord[],
): WorkerRegistrationIdentityRecord[] => {
    const merged = new Map<string, WorkerRegistrationIdentityRecord>();

    records.forEach((record, index) => {
        const key = getRegistrationIdentityKey(record, index);
        const existing = merged.get(key);
        if (!existing) {
            merged.set(key, { ...record });
            return;
        }

        existing.phone_number = firstNonEmptyRegistrationValue(
            existing.phone_number,
            existing.phoneNumber,
            record.phone_number,
            record.phoneNumber,
        );
        existing.birth_date = firstNonEmptyRegistrationValue(
            existing.birth_date,
            existing.birthDate,
            record.birth_date,
            record.birthDate,
        );
        existing.passport_number = firstNonEmptyRegistrationValue(
            existing.passport_number,
            existing.passportNumber,
            record.passport_number,
            record.passportNumber,
        );
        existing.nationality = firstNonEmptyRegistrationValue(
            existing.nationality,
            record.nationality,
        ) as string | undefined;
    });

    return Array.from(merged.values());
};

const getRecordDateValue = (record: Partial<WorkerRecord>): number => {
    const value = new Date(String(record.date || '')).getTime();
    return Number.isFinite(value) ? value : 0;
};

const getRecordMonthKey = (record: Partial<WorkerRecord>): string => {
    const date = new Date(String(record.date || ''));
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export interface WorkerTimelineGroup {
    key: string;
    records: WorkerRecord[];
    latestRecord: WorkerRecord;
    monthCount: number;
    firstDate: string;
    lastDate: string;
    deltaScore: number | null;
}

export const buildWorkerTimelineGroups = (records: WorkerRecord[]): WorkerTimelineGroup[] => {
    const groupMap = new Map<string, WorkerRecord[]>();

    records.forEach((record) => {
        const key = getWorkerIdentityKey(record);
        const current = groupMap.get(key) || [];
        current.push(record);
        groupMap.set(key, current);
    });

    return Array.from(groupMap.entries()).map(([key, groupRecords]) => {
        const sortedAsc = [...groupRecords].sort((a, b) => getRecordDateValue(a) - getRecordDateValue(b));
        const sortedDesc = [...sortedAsc].reverse();
        const latestRecord = sortedDesc[0];
        const latestScore = Number(latestRecord?.safetyScore);
        const firstScore = Number(sortedAsc[0]?.safetyScore);
        const deltaScore = Number.isFinite(latestScore) && Number.isFinite(firstScore) && sortedAsc.length > 1
            ? latestScore - firstScore
            : null;

        return {
            key,
            records: sortedDesc,
            latestRecord,
            monthCount: new Set(groupRecords.map(getRecordMonthKey).filter(Boolean)).size,
            firstDate: String(sortedAsc[0]?.date || ''),
            lastDate: String(latestRecord?.date || ''),
            deltaScore,
        };
    }).filter((group): group is WorkerTimelineGroup => Boolean(group.latestRecord));
};

export interface WorkerEvidenceReadinessSummary {
    totalRecords: number;
    workerGroups: number;
    repeatedWorkerGroups: number;
    multiMonthWorkerGroups: number;
    maxRecordsPerWorker: number;
    maxMonthsPerWorker: number;
    improvingWorkerGroups: number;
    decliningWorkerGroups: number;
    stableWorkerGroups: number;
    imageCoverageRate: number;
    handwrittenCoverageRate: number;
    aiInsightCoverageRate: number;
    nativeGuidanceCoverageRate: number;
    lowScoreRecords: number;
    futureDateRecords: number;
    invalidDateRecords: number;
}

const rate = (count: number, total: number): number => {
    return total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;
};

export const analyzeWorkerEvidenceReadiness = (
    records: WorkerRecord[],
    today: Date = new Date(),
): WorkerEvidenceReadinessSummary => {
    const groups = buildWorkerTimelineGroups(records);
    const validToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    let improvingWorkerGroups = 0;
    let decliningWorkerGroups = 0;
    let stableWorkerGroups = 0;

    groups.forEach((group) => {
        if (group.deltaScore === null) return;
        if (group.deltaScore >= 5) improvingWorkerGroups += 1;
        else if (group.deltaScore <= -5) decliningWorkerGroups += 1;
        else stableWorkerGroups += 1;
    });

    const futureDateRecords = records.filter((record) => {
        const time = getRecordDateValue(record);
        return time > validToday;
    }).length;
    const invalidDateRecords = records.filter((record) => getRecordDateValue(record) === 0).length;

    return {
        totalRecords: records.length,
        workerGroups: groups.length,
        repeatedWorkerGroups: groups.filter((group) => group.records.length > 1).length,
        multiMonthWorkerGroups: groups.filter((group) => group.monthCount > 1).length,
        maxRecordsPerWorker: groups.reduce((max, group) => Math.max(max, group.records.length), 0),
        maxMonthsPerWorker: groups.reduce((max, group) => Math.max(max, group.monthCount), 0),
        improvingWorkerGroups,
        decliningWorkerGroups,
        stableWorkerGroups,
        imageCoverageRate: rate(records.filter((record) => typeof record.originalImage === 'string' && record.originalImage.length > 50).length, records.length),
        handwrittenCoverageRate: rate(records.filter((record) => Array.isArray(record.handwrittenAnswers) && record.handwrittenAnswers.length > 0).length, records.length),
        aiInsightCoverageRate: rate(records.filter((record) => String(record.aiInsights || '').trim().length > 0).length, records.length),
        nativeGuidanceCoverageRate: rate(records.filter((record) => String(record.aiInsights_native || record.improvement_native || '').trim().length > 0).length, records.length),
        lowScoreRecords: records.filter((record) => Number(record.safetyScore) < 60).length,
        futureDateRecords,
        invalidDateRecords,
    };
};
