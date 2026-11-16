import type { WorkerRecord } from '../types';
import { getWorkerIdentityKey } from './workerIdentity';
import { hasValidSafetyScore, selectLatestCoreMetricRecords } from './coreMetrics';
import { summarizeScoreMetricEvidence, type ScoreMetricEvidence } from './scoreMetricEvidence';

export interface SixMetricAverages {
    psychological: number | null;
    jobUnderstanding: number | null;
    riskAssessmentUnderstanding: number | null;
    proficiency: number | null;
    improvementExecution: number | null;
    repeatViolationPenalty: number | null;
}

export interface WorkerTrendPoint {
    date: string;
    label: string;
    score: number;
}

export interface WorkerTrendData {
    workerId: string;
    name: string;
    trade: string;
    nationality: string;
    trend: WorkerTrendPoint[];
    latestScore: number;
    averageScore: number;
    deltaScore: number;
}

export interface TradeNationalityGroupData {
    trade: string;
    nationality: string;
    compositeScore: number;
    workerCount: number;
    metrics: SixMetricAverages;
    metricEvidence?: ScoreMetricEvidence[];
    workers: WorkerTrendData[];
}

export interface DashboardTransformedData {
    trades: string[];
    nationalities: string[];
    barData: Array<{ trade: string; [nationality: string]: string | number }>;
    groups: Record<string, TradeNationalityGroupData>;
    siteAverageMetrics: SixMetricAverages;
    siteMetricEvidence: ScoreMetricEvidence[];
    unassignedRecordCount: number;
}

export const ALL_NATIONALITY_LABEL = '전체 국적';

const DASHBOARD_JOB_FIELD_ALIASES: Record<string, string> = {
    '형틀': '형틀',
    '형틀목공': '형틀',
    '목공': '형틀',
    '거푸집': '형틀',
    '폼': '형틀',
    '폼조립': '형틀',
    '바라시': '형틀',
    '철근': '철근',
    '배근': '철근',
    '철근가공': '철근',
    '가공철근': '철근',
    '시스템': '시스템',
    '시스템비계': '시스템',
    '시스템동바리': '시스템',
    '동바리': '시스템',
    '갱폼': '갱폼',
    '알폼': '알폼',
    '할석미장견출': '할석미장견출',
    '바닥미장': '바닥미장',
    '해체정리': '해체정리',
    '직영': '직영',
    '용역': '용역',
    '콘크리트비계': '콘크리트비계',
    '콘크리트 비계': '콘크리트비계',
};

const round1 = (value: number) => Number(value.toFixed(1));

const formatMonthLabel = (dateString: string) => {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const safeDateValue = (dateString: string) => {
    const t = new Date(dateString).getTime();
    return Number.isNaN(t) ? 0 : t;
};

export const getTargetGroupKey = (trade: string, nationality: string) => `${trade}::${nationality}`;

export const normalizeDashboardTrade = (raw: string | undefined | null) => {
    const base = String(raw || '').trim();
    if (!base) return '';

    const compact = base.replace(/\s+/g, '');
    const aliased = DASHBOARD_JOB_FIELD_ALIASES[compact] || DASHBOARD_JOB_FIELD_ALIASES[base];
    if (aliased) return aliased;

    if (/(시스템비계|시스템동바리|동바리|시스템)/.test(compact)) return '시스템';
    if (/(철근|배근|가공)/.test(compact)) return '철근';
    if (/(형틀|목공|거푸집|폼조립|바라시|알폼|갱폼)/.test(compact)) {
        if (/(알폼)/.test(compact)) return '알폼';
        if (/(갱폼)/.test(compact)) return '갱폼';
        return '형틀';
    }
    if (/(콘크리트비계|콘크리트|타설|펌프카|비계)/.test(compact)) return '콘크리트비계';

    return base;
};

const getStrictWorkerIdentity = (record: WorkerRecord): string | null => {
    const key = getWorkerIdentityKey(record);
    return key.startsWith('record:') ? null : key;
};

export function transformDashboardData(workerRecords: WorkerRecord[]): DashboardTransformedData {
    const tradesSet = new Set<string>();
    const nationalitiesSet = new Set<string>();

    const groupAccumulator = new Map<string, {
        trade: string;
        nationality: string;
        sumSafetyScore: number;
        count: number;
        workerSet: Set<string>;
        metricRecords: WorkerRecord[];
    }>();

    const workerRecordsMap = new Map<string, WorkerRecord[]>();

    let unassignedRecordCount = 0;
    const siteMetricRecords: WorkerRecord[] = [];
    const latestRecords = new Set(selectLatestCoreMetricRecords(workerRecords));

    const ensureGroup = (trade: string, nationality: string) => {
        const key = getTargetGroupKey(trade, nationality);
        if (!groupAccumulator.has(key)) {
            groupAccumulator.set(key, {
                trade,
                nationality,
                sumSafetyScore: 0,
                count: 0,
                workerSet: new Set<string>(),
                metricRecords: [],
            });
        }
        return groupAccumulator.get(key)!;
    };

    for (const record of workerRecords) {
        const trade = normalizeDashboardTrade(record.jobField);
        const nationality = record.nationality?.trim();

        if (!trade || !nationality) continue;

        const workerId = getStrictWorkerIdentity(record);
        const groupKey = getTargetGroupKey(trade, nationality);

        if (!workerId) {
            unassignedRecordCount += 1;
        }

        if (workerId) {
            if (!workerRecordsMap.has(workerId)) {
                workerRecordsMap.set(workerId, []);
            }
            workerRecordsMap.get(workerId)!.push({
                ...record,
                jobField: trade,
            });
        }

        // Retain full history above, but current groups count one latest record per identity.
        if (!latestRecords.has(record) || !hasValidSafetyScore(record)) continue;
        tradesSet.add(trade);
        nationalitiesSet.add(nationality);
        for (const group of [
            ensureGroup(trade, nationality),
            ensureGroup(trade, ALL_NATIONALITY_LABEL),
        ]) {
            if (hasValidSafetyScore(record)) {
                group.sumSafetyScore += record.safetyScore;
                group.count += 1;
            }
            if (workerId) {
                group.workerSet.add(workerId);
            }

            group.metricRecords.push(record);
        }
        siteMetricRecords.push(record);
    }

    const trades = Array.from(tradesSet).sort((a, b) => a.localeCompare(b, 'ko'));
    const nationalities = Array.from(nationalitiesSet).sort((a, b) => a.localeCompare(b, 'ko'));

    const allWorkers = new Map<string, WorkerTrendData>();

    for (const [workerId, records] of workerRecordsMap) {
        const sorted = records.filter(hasValidSafetyScore).sort((a, b) => safeDateValue(a.date) - safeDateValue(b.date) || a.id.localeCompare(b.id));
        if (!sorted.length) continue;

        const firstScore = sorted[0]?.safetyScore ?? 0;
        const latestScore = sorted[sorted.length - 1]?.safetyScore ?? 0;
        const averageScore = sorted.reduce((sum, r) => sum + (r.safetyScore || 0), 0) / sorted.length;
        const latestRecord = sorted[sorted.length - 1];

        allWorkers.set(workerId, {
            workerId,
            name: latestRecord.name,
            trade: latestRecord.jobField,
            nationality: latestRecord.nationality,
            trend: sorted.map((r) => ({
                date: r.date,
                label: formatMonthLabel(r.date),
                score: round1(r.safetyScore || 0),
            })),
            latestScore: round1(latestScore),
            averageScore: round1(averageScore),
            deltaScore: round1(latestScore - firstScore),
        });
    }

    const groups: Record<string, TradeNationalityGroupData> = {};

    for (const [key, acc] of groupAccumulator) {
        const metricEvidence = summarizeScoreMetricEvidence(acc.metricRecords);
        const metrics = Object.fromEntries(metricEvidence.map(row => [row.key, row.average])) as unknown as SixMetricAverages;

        const workers = Array.from(acc.workerSet)
            .map((workerId) => allWorkers.get(workerId))
            .filter((w): w is WorkerTrendData => Boolean(w))
            .sort((a, b) => b.latestScore - a.latestScore);

        groups[key] = {
            trade: acc.trade,
            nationality: acc.nationality,
            compositeScore: acc.count > 0 ? round1(acc.sumSafetyScore / acc.count) : 0,
            workerCount: acc.workerSet.size,
            metrics,
            metricEvidence,
            workers,
        };
    }

    const barData = trades.map((trade) => {
        const row: { trade: string; [nationality: string]: string | number } = { trade };
        for (const nationality of nationalities) {
            const key = getTargetGroupKey(trade, nationality);
            row[nationality] = groups[key]?.compositeScore ?? 0;
        }
        return row;
    });

    const siteMetricEvidence = summarizeScoreMetricEvidence(siteMetricRecords);
    const siteAverageMetrics = Object.fromEntries(siteMetricEvidence.map(row => [row.key, row.average])) as unknown as SixMetricAverages;

    return {
        trades,
        nationalities,
        barData,
        groups,
        siteAverageMetrics,
        siteMetricEvidence,
        unassignedRecordCount,
    };
}
