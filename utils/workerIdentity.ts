import type { WorkerRecord } from '../types';

const GENERIC_WORKER_NAMES = new Set(['식별대기', '이름없음', '이름미확인', '미상', '분석실패']);

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

export const getWorkerUuidValue = (record: Partial<WorkerRecord>): string => {
    return normalizeWorkerIdentityText(record.worker_uuid || record.workerUuid);
};

export const getWorkerNameIdentitySeed = (record: Partial<WorkerRecord>): string => {
    const normalizedName = normalizeWorkerIdentityText(record.name);
    if (!normalizedName || GENERIC_WORKER_NAMES.has(normalizedName)) return '';

    const normalizedJobField = normalizeWorkerJobIdentityText(record.jobField);
    if (!normalizedJobField) return '';

    const normalizedNationality = normalizeWorkerIdentityText(record.nationality) || 'UNKNOWN';
    return `${normalizedJobField}|${normalizedName}|${normalizedNationality}`;
};

export const buildNameBasedWorkerUuid = (record: Partial<WorkerRecord>): string => {
    const seed = getWorkerNameIdentitySeed(record);
    return seed ? `WN-${stableWorkerHash(seed).slice(0, 12)}` : '';
};

export const getWorkerIdentityKey = (record: Partial<WorkerRecord>): string => {
    const nameSeed = getWorkerNameIdentitySeed(record);
    if (nameSeed) return `job-name-nationality:${nameSeed}`;

    const employeeId = normalizeWorkerIdentityText(record.employeeId);
    if (employeeId) return `employee:${employeeId}`;

    const qrId = normalizeWorkerIdentityText(record.qrId);
    if (qrId) return `qr:${qrId}`;

    const workerUuid = getWorkerUuidValue(record);
    if (workerUuid) return `worker:${workerUuid}`;

    return `record:${normalizeWorkerIdentityText(record.id) || 'UNKNOWN'}`;
};

export const getWorkerMatchScore = (target: Partial<WorkerRecord>, candidate: Partial<WorkerRecord>): number => {
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

    const targetUuid = getWorkerUuidValue(target);
    const candidateUuid = getWorkerUuidValue(candidate);
    if (targetUuid && candidateUuid && targetUuid === candidateUuid) return 90;

    const targetName = normalizeWorkerIdentityText(target.name);
    const candidateName = normalizeWorkerIdentityText(candidate.name);
    const targetJob = normalizeWorkerJobIdentityText(target.jobField);
    const candidateJob = normalizeWorkerJobIdentityText(candidate.jobField);
    const targetNationality = normalizeWorkerIdentityText(target.nationality);
    const candidateNationality = normalizeWorkerIdentityText(candidate.nationality);

    if (!targetName || !candidateName || targetName !== candidateName) return -1;
    if (!targetJob || !candidateJob || targetJob !== candidateJob) return -1;
    if (targetNationality && candidateNationality && targetNationality !== candidateNationality) return -1;

    let score = 55;
    if (targetNationality && candidateNationality && targetNationality === candidateNationality) score += 15;

    const targetTeam = normalizeWorkerIdentityText(target.teamLeader);
    const candidateTeam = normalizeWorkerIdentityText(candidate.teamLeader);
    if (targetTeam && candidateTeam && targetTeam === candidateTeam) score += 10;

    const targetRole = normalizeWorkerIdentityText(target.role);
    const candidateRole = normalizeWorkerIdentityText(candidate.role);
    if (targetRole && candidateRole && targetRole === candidateRole) score += 5;

    return score >= 55 ? score : -1;
};

export const isSameWorkerTimeline = (base: Partial<WorkerRecord>, candidate: Partial<WorkerRecord>): boolean => {
    const baseNameSeed = getWorkerNameIdentitySeed(base);
    const candidateNameSeed = getWorkerNameIdentitySeed(candidate);
    if (baseNameSeed && candidateNameSeed) return baseNameSeed === candidateNameSeed;

    return getWorkerMatchScore(base, candidate) >= 55;
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
