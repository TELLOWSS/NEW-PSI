import type { WorkerRecord } from '../types';

const GENERIC_WORKER_NAMES = new Set(['식별대기', '이름없음', '이름미확인', '미상', '분석실패']);
const GENERIC_NATIONALITIES = new Set(['미상', '알수없음', 'UNKNOWN', 'UNSPECIFIED']);

export const NATIONALITY_MAP: Record<string, string> = {
    '대한민국': '대한민국', '한국': '대한민국', 'korea': '대한민국', 'south korea': '대한민국', 'rok': '대한민국', '남한': '대한민국', 'ko': '대한민국',
    '베트남': '베트남', 'vietnam': '베트남', 'viet nam': '베트남', 'việt nam': '베트남', 'việt': '베트남', 'vi': '베트남', 'vn': '베트남', '越南': '베트남',
    '중국': '중국', 'china': '중국', '중화': '중국', 'zh': '중국', 'cn': '중국', '中国': '중국',
    '태국': '태국', 'thailand': '태국', 'thai': '태국', 'th': '태국', 'ประเทศไทย': '태국',
    '우즈베키스탄': '우즈베키스탄', '우즈벡': '우즈베키스탄', 'uzbekistan': '우즈베키스탄', 'uzbek': '우즈베키스탄', 'uz': '우즈베키스탄', 'Ўзбекистон': '우즈베키스탄',
    '인도네시아': '인도네시아', 'indonesia': '인도네시아', 'indonesian': '인도네시아', 'id': '인도네시아',
    '캄보디아': '캄보디아', 'cambodia': '캄보디아', 'cambodian': '캄보디아', 'khmer': '캄보디아', 'kh': '캄보디아', 'កម្ពុជា': '캄보디아',
    '몽골': '몽골', 'mongolia': '몽골', 'mongolian': '몽골', 'mn': '몽골', 'монгол': '몽골',
    '필리핀': '필리핀', 'philippines': '필리핀', 'filipino': '필리핀', 'ph': '필리핀',
    '카자흐스탄': '카자흐스탄', '카자흐': '카자흐스탄', 'kazakhstan': '카자흐스탄', 'kazakh': '카자흐스탄', 'kz': '카자흐스탄',
    '러시아': '러시아', 'russia': '러시아', 'russian': '러시아', 'ru': '러시아', 'россия': '러시아',
    '네팔': '네팔', 'nepal': '네팔', 'nepalese': '네팔', 'np': '네팔',
    '미얀마': '미얀마', 'myanmar': '미얀마', 'burma': '미얀마', 'mm': '미얀마', 'မြန်မာ': '미얀마',
};

export const JOB_FIELD_MAP: Record<string, string> = {
    '형틀': '형틀', '형틀목수': '형틀', '형틀공': '형틀', '목수': '형틀', '목공': '형틀',
    '철근': '철근', '철근공': '철근', '철근조립': '철근',
    '비계': '비계', '비계공': '비계', '시스템비계': '비계', '강관비계': '비계', '시스템동바리': '비계',
    '골조': '골조', '골조공': '골조',
    '배관': '배관', '배관공': '배관',
    '전기': '전기', '전공': '전기', '전기공': '전기',
    '미장': '미장', '미장공': '미장',
    '도장': '도장', '도장공': '도장', '페인트': '도장',
    '용역': '용역', '보통인부': '용역', '보통 인부': '용역', '잡부': '용역', '일반인부': '용역', '조접': '용역',
    '조적': '조적', '조적공': '조적', '벽돌': '조적',
    '타일': '타일', '타일공': '타일',
    '석공': '석공', '석공사': '석공',
    '방수': '방수', '방수공': '방수',
    '해체': '해체', '철거': '해체', '해체공': '해체',
    '신호수': '신호수', '유도원': '신호수', '신호수/유도원': '신호수', '화재감시': '신호수', '안전감시': '신호수', '감시원': '신호수',
    '굴착': '굴착', '토공': '굴착', '토공사': '굴착',
    '배체정리': '배체정리', '배체': '배체정리',
    '타설': '타설', '콘크리트': '타설', '콘크리트비계': '타설',
    '철골': '철골', '철골공': '철골',
    '안전시설': '안전시설', '안전시설(해체·정리)': '안전시설', '안전시설해체정리': '안전시설', '안전시설해체': '안전시설',
    '지붕': '지붕',
};

export const normalizeNationality = (rawNationality: string): string => {
    if (!rawNationality) return '미상';
    const clean = rawNationality.trim().toLowerCase();
    
    if (NATIONALITY_MAP[clean]) {
        return NATIONALITY_MAP[clean];
    }
    
    for (const [key, val] of Object.entries(NATIONALITY_MAP)) {
        if (clean.includes(key)) {
            return val;
        }
    }
    
    return rawNationality.trim() || '미상';
};

export const normalizeJobField = (rawJobField: string): string => {
    if (!rawJobField) return '미분류';
    const clean = rawJobField.trim().toLowerCase().replace(/\s+/g, '');
    
    if (JOB_FIELD_MAP[clean]) {
        return JOB_FIELD_MAP[clean];
    }
    
    for (const [key, val] of Object.entries(JOB_FIELD_MAP)) {
        if (clean.startsWith(key)) {
            return val;
        }
    }

    for (const [key, val] of Object.entries(JOB_FIELD_MAP)) {
        if (clean.includes(key)) {
            return val;
        }
    }
    
    return rawJobField.trim() || '미분류';
};

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
        .map((part) => normalizeJobField(part.trim()))
        .filter(Boolean);

    return parts.length > 1
        ? Array.from(new Set(parts)).sort().join('+')
        : normalizeJobField(raw);
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

export const getWorkerLegacyTrackingIdentitySeed = (record: Partial<WorkerRecord>): string => {
    const normalizedName = normalizeWorkerIdentityText(record.name);
    if (!normalizedName || GENERIC_WORKER_NAMES.has(normalizedName)) return '';

    const normalizedNationality = normalizeWorkerIdentityText(record.nationality);
    if (!normalizedNationality || GENERIC_NATIONALITIES.has(normalizedNationality)) return '';

    return `${normalizedName}|${normalizedNationality}`;
};

export const getWorkerTrackingCandidateIdentityKey = (record: Partial<WorkerRecord>): string => {
    if (hasWorkerUuidConflict(record)) return getWorkerIdentityKey(record);

    const trackingSeed = getWorkerLegacyTrackingIdentitySeed(record);
    return trackingSeed
        ? `tracking-candidate:name-nationality:${trackingSeed}`
        : getWorkerIdentityKey(record);
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


export const buildWorkerTimelineGroups = (
    records: WorkerRecord[],
    resolveIdentityKey: (record: WorkerRecord) => string = getWorkerIdentityKey,
): WorkerTimelineGroup[] => {
    const groupMap = new Map<string, WorkerRecord[]>();

    records.forEach((record) => {
        const key = resolveIdentityKey(record);
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
    resolveIdentityKey: (record: WorkerRecord) => string = getWorkerIdentityKey,
): WorkerEvidenceReadinessSummary => {
    const groups = buildWorkerTimelineGroups(records, resolveIdentityKey);
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

/**
 * 이름과 국적은 동일하지만 공종이 달라 자동 병합되지 않는 수동 매칭 제안 대상인지 여부
 */
export const isPotentialSameWorkerManualReviewTarget = (
    base: Partial<WorkerRecord>,
    candidate: Partial<WorkerRecord>
): boolean => {
    const baseName = normalizeWorkerIdentityText(base.name);
    const candidateName = normalizeWorkerIdentityText(candidate.name);
    if (!baseName || GENERIC_WORKER_NAMES.has(baseName) || baseName !== candidateName) return false;

    const baseNation = normalizeWorkerIdentityText(base.nationality);
    const candidateNation = normalizeWorkerIdentityText(candidate.nationality);
    if (!baseNation || GENERIC_NATIONALITIES.has(baseNation) || baseNation !== candidateNation) return false;

    const baseJob = normalizeWorkerJobIdentityText(base.jobField);
    const candidateJob = normalizeWorkerJobIdentityText(candidate.jobField);
    
    // 이름, 국적은 같으나 공종이 다른 경우 수동 검토 제안
    return baseJob !== candidateJob;
};

/**
 * 특정 타임라인 그룹 내에서 월별 공종 불일치가 발생하는지 감지하는 지표
 */
export const hasMonthlyJobFieldMismatch = (records: WorkerRecord[]): boolean => {
    if (records.length <= 1) return false;
    
    const monthlyJobMap = new Map<string, string>();
    for (const record of records) {
        const monthKey = getRecordMonthKey(record);
        const jobField = normalizeWorkerJobIdentityText(record.jobField);
        if (!monthKey || !jobField) continue;
        
        if (monthlyJobMap.has(monthKey) && monthlyJobMap.get(monthKey) !== jobField) {
            return true; // 한 달 내에 공종이 달라짐
        }
        monthlyJobMap.set(monthKey, jobField);
    }
    
    // 전체 타임라인 내에서 서로 다른 월 사이에 공종이 달라졌는지 확인
    const jobFields = Array.from(monthlyJobMap.values());
    const uniqueJobs = new Set(jobFields);
    return uniqueJobs.size > 1;
};
