import type { WorkerRecord } from '../types';
import { getSafetyLevelThresholds } from './safetyLevelUtils';
import { getWorkerIdentityKey } from './workerIdentity';

export const CORE_METRIC_RULE_VERSION = 'psi-core-metrics-2026-09-09-v2';

export const CORE_METRIC_CATALOG = {
    totalWorkers: {
        label: '근로자 수',
        unit: '명',
        rule: '확인된 식별자로 최신 기록을 집계하며 미확인 기록은 개별 단위로 유지',
    },
    averageScore: {
        label: '평균 위험인식 신호',
        unit: '점',
        rule: '근로자별 최신 기록의 유효 점수만 평균하며 최신 점수 누락 시 과거 점수로 대체하지 않음',
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
    unconfirmedIdentityCount: number;
    averageScore: number;
    protectionPriorityCount: number;
    analyzedWorkerCount: number;
    improvementExecutionRate: number;
    workTypeCount: number;
}

export interface MonthlyCoreMetricPoint extends CoreMetricSnapshot {
    month: string;
}

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
    return getWorkerIdentityKey(record);
};

export const hasValidSafetyScore = (record: Partial<WorkerRecord>): boolean =>
    typeof record.safetyScore === 'number' && Number.isFinite(record.safetyScore)
    && record.safetyScore >= 0 && record.safetyScore <= 100;

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
    const validScoreRecords = latestRecords.filter(hasValidSafetyScore);
    const thresholds = getSafetyLevelThresholds();
    const scores = validScoreRecords.map((record) => Number(record.safetyScore));
    const improvementValues = validScoreRecords
        .map((record) => record.scoreBreakdown?.improvementExecution)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 20);

    return {
        ruleVersion: CORE_METRIC_RULE_VERSION,
        sourceRecordCount: records.length,
        validScoreRecordCount: validScoreRecords.length,
        excludedInvalidScoreCount: latestRecords.length - validScoreRecords.length,
        totalWorkers: latestRecords.length,
        unconfirmedIdentityCount: latestRecords.filter(record => getCoreMetricWorkerKey(record).startsWith('record:')).length,
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
