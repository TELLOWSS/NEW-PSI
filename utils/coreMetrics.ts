import type { WorkerRecord } from '../types';
import { getSafetyLevelThresholds } from './safetyLevelUtils';

export const CORE_METRIC_RULE_VERSION = 'psi-core-metrics-2026-06-22-v1';

export const CORE_METRIC_CATALOG = {
    totalWorkers: {
        label: '근로자 수',
        unit: '명',
        rule: '현재 범위에서 동일 근로자를 한 명으로 집계',
    },
    averageScore: {
        label: '평균 위험인식 신호',
        unit: '점',
        rule: '근로자별 최신 유효 점수 1건의 산술평균',
    },
    protectionPriorityCount: {
        label: '보호 우선',
        unit: '명',
        rule: '근로자별 최신 위험인식 신호가 현재 확인 단계 임계값 미만인 인원',
    },
    analyzedWorkerCount: {
        label: '세부 분석 완료',
        unit: '명',
        rule: '근로자별 최신 기록에 6개 지표 상세점수가 있는 인원',
    },
    improvementExecutionRate: {
        label: '개선 이행률',
        unit: '%',
        rule: '근로자별 최신 개선이행 점수(0~20)를 100점 비율로 환산한 평균',
    },
    workTypeCount: {
        label: '대상 공종',
        unit: '개',
        rule: '근로자별 최신 기록에 포함된 고유 공종 수',
    },
} as const;

export interface CoreMetricSnapshot {
    ruleVersion: string;
    sourceRecordCount: number;
    validScoreRecordCount: number;
    excludedInvalidScoreCount: number;
    totalWorkers: number;
    averageScore: number;
    protectionPriorityCount: number;
    analyzedWorkerCount: number;
    improvementExecutionRate: number;
    workTypeCount: number;
}

export interface MonthlyCoreMetricPoint extends CoreMetricSnapshot {
    month: string;
}

const normalizeIdentityText = (value: unknown): string => (
    String(value || '').trim().toUpperCase().replace(/\s+/g, '')
);

const normalizeJobIdentityText = (value: unknown): string => {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return '';
    const parts = raw.split(/[,\s/·ㆍ+|]+/).map((part) => part.trim()).filter(Boolean);
    return parts.length > 1
        ? Array.from(new Set(parts)).sort().join('+')
        : raw.replace(/[,\s/·ㆍ+|]+/g, '');
};

const getRecordTime = (record: Partial<WorkerRecord>): number => {
    const timestamp = new Date(String(record.date || '')).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
};

const round = (value: number, digits = 1): number => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
};

const average = (values: number[]): number => (
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
);

export const getCoreMetricWorkerKey = (record: Partial<WorkerRecord>): string => {
    const name = normalizeIdentityText(record.name);
    const job = normalizeJobIdentityText(record.jobField);
    const nationality = normalizeIdentityText(record.nationality) || 'UNKNOWN';
    if (name && job && !['식별대기', '이름없음', '이름미확인', '미상', '분석실패'].includes(name)) {
        return `job-name-nationality:${job}|${name}|${nationality}`;
    }

    const employeeId = normalizeIdentityText(record.employeeId);
    if (employeeId) return `employee:${employeeId}`;

    const qrId = normalizeIdentityText(record.qrId);
    if (qrId) return `qr:${qrId}`;

    const workerUuid = normalizeIdentityText(record.worker_uuid || record.workerUuid);
    if (workerUuid) return `worker:${workerUuid}`;

    return `record:${normalizeIdentityText(record.id) || 'UNKNOWN'}`;
};

export const isOperationalWorkerRecord = (record: Partial<WorkerRecord>): boolean => (
    !/관리|팀장|부장|과장|기사|공무|소장/.test(String(record.jobField || ''))
);

export const selectLatestCoreMetricRecords = (records: WorkerRecord[]): WorkerRecord[] => {
    const latestByWorker = new Map<string, WorkerRecord>();

    records.forEach((record) => {
        const key = getCoreMetricWorkerKey(record);
        const current = latestByWorker.get(key);
        const recordTime = getRecordTime(record);
        const currentTime = current ? getRecordTime(current) : -1;
        if (
            !current
            || recordTime > currentTime
            || (recordTime === currentTime && String(record.id || '').localeCompare(String(current.id || '')) > 0)
        ) {
            latestByWorker.set(key, record);
        }
    });

    return Array.from(latestByWorker.values());
};

export const calculateCoreMetricSnapshot = (records: WorkerRecord[]): CoreMetricSnapshot => {
    const latestRecords = selectLatestCoreMetricRecords(records);
    const validScoreRecords = latestRecords.filter((record) => (
        Number.isFinite(Number(record.safetyScore))
        && Number(record.safetyScore) >= 0
        && Number(record.safetyScore) <= 100
    ));
    const thresholds = getSafetyLevelThresholds();
    const scores = validScoreRecords.map((record) => Number(record.safetyScore));
    const improvementValues = validScoreRecords
        .map((record) => record.scoreBreakdown?.improvementExecution)
        .filter((value): value is number => Number.isFinite(value));

    return {
        ruleVersion: CORE_METRIC_RULE_VERSION,
        sourceRecordCount: records.length,
        validScoreRecordCount: validScoreRecords.length,
        excludedInvalidScoreCount: latestRecords.length - validScoreRecords.length,
        totalWorkers: latestRecords.length,
        averageScore: round(average(scores)),
        protectionPriorityCount: validScoreRecords.filter((record) => (
            Number(record.safetyScore) < thresholds.intermediateMin
        )).length,
        analyzedWorkerCount: validScoreRecords.filter((record) => Boolean(record.scoreBreakdown)).length,
        improvementExecutionRate: improvementValues.length > 0
            ? Math.round((average(improvementValues) / 20) * 100)
            : 0,
        workTypeCount: new Set(
            latestRecords.map((record) => String(record.jobField || '').trim()).filter(Boolean),
        ).size,
    };
};

export const getCoreMetricMonthKey = (value: string): string => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})/);
    if (!match) return '';
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isInteger(year) || month < 1 || month > 12) return '';
    return `${match[1]}-${match[2]}`;
};

export const buildMonthlyCoreMetricSeries = (records: WorkerRecord[]): MonthlyCoreMetricPoint[] => {
    const byMonth = records.reduce((map, record) => {
        const month = getCoreMetricMonthKey(record.date);
        if (!month) return map;
        const bucket = map.get(month) || [];
        bucket.push(record);
        map.set(month, bucket);
        return map;
    }, new Map<string, WorkerRecord[]>());

    return Array.from(byMonth.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([month, monthRecords]) => ({
            month,
            ...calculateCoreMetricSnapshot(monthRecords),
        }));
};
