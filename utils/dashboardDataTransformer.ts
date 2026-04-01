import type { WorkerRecord } from '../types';

export interface SixMetricAverages {
    psychological: number;
    jobUnderstanding: number;
    riskAssessmentUnderstanding: number;
    proficiency: number;
    improvementExecution: number;
    repeatViolationPenalty: number;
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
    workers: WorkerTrendData[];
}

export interface DashboardTransformedData {
    trades: string[];
    nationalities: string[];
    barData: Array<{ trade: string; [nationality: string]: string | number }>;
    groups: Record<string, TradeNationalityGroupData>;
    siteAverageMetrics: SixMetricAverages;
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

const EMPTY_METRICS: SixMetricAverages = {
    psychological: 0,
    jobUnderstanding: 0,
    riskAssessmentUnderstanding: 0,
    proficiency: 0,
    improvementExecution: 0,
    repeatViolationPenalty: 0,
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

const normalizeIdentityValue = (value: string | undefined | null) => {
    const normalized = (value ?? '').trim();
    return normalized.length > 0 ? normalized : null;
};

const getStrictWorkerIdentity = (record: WorkerRecord): string | null => {
    const extra = record as unknown as Record<string, unknown>;

    const workerUuid = normalizeIdentityValue(
        typeof extra.worker_uuid === 'string'
            ? extra.worker_uuid
            : typeof extra.workerUuid === 'string'
                ? extra.workerUuid
                : null
    );
    if (workerUuid) return `worker_uuid:${workerUuid}`;

    const employeeId = normalizeIdentityValue(record.employeeId);
    if (employeeId) return `employee:${employeeId}`;

    const qrId = normalizeIdentityValue(record.qrId);
    if (qrId) return `qr:${qrId}`;

    return null;
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
        metricSums: SixMetricAverages;
        metricCount: number;
    }>();

    const workerRecordsMap = new Map<string, WorkerRecord[]>();

    let siteMetricCount = 0;
    let unassignedRecordCount = 0;
    const siteMetricSums: SixMetricAverages = { ...EMPTY_METRICS };

    const ensureGroup = (trade: string, nationality: string) => {
        const key = getTargetGroupKey(trade, nationality);
        if (!groupAccumulator.has(key)) {
            groupAccumulator.set(key, {
                trade,
                nationality,
                sumSafetyScore: 0,
                count: 0,
                workerSet: new Set<string>(),
                metricSums: { ...EMPTY_METRICS },
                metricCount: 0,
            });
        }
        return groupAccumulator.get(key)!;
    };

    for (const record of workerRecords) {
        const trade = normalizeDashboardTrade(record.jobField);
        const nationality = record.nationality?.trim();

        if (!trade || !nationality) continue;

        tradesSet.add(trade);
        nationalitiesSet.add(nationality);

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

        for (const group of [
            ensureGroup(trade, nationality),
            ensureGroup(trade, ALL_NATIONALITY_LABEL),
        ]) {
            group.sumSafetyScore += record.safetyScore || 0;
            group.count += 1;
            if (workerId) {
                group.workerSet.add(workerId);
            }

            const sb = record.scoreBreakdown;
            if (sb) {
                group.metricSums.psychological += sb.psychological ?? 0;
                group.metricSums.jobUnderstanding += sb.jobUnderstanding ?? 0;
                group.metricSums.riskAssessmentUnderstanding += sb.riskAssessmentUnderstanding ?? 0;
                group.metricSums.proficiency += sb.proficiency ?? 0;
                group.metricSums.improvementExecution += sb.improvementExecution ?? 0;
                group.metricSums.repeatViolationPenalty += Math.abs(sb.repeatViolationPenalty ?? 0);
                group.metricCount += 1;
            }
        }

        const sb = record.scoreBreakdown;
        if (sb) {
            siteMetricSums.psychological += sb.psychological ?? 0;
            siteMetricSums.jobUnderstanding += sb.jobUnderstanding ?? 0;
            siteMetricSums.riskAssessmentUnderstanding += sb.riskAssessmentUnderstanding ?? 0;
            siteMetricSums.proficiency += sb.proficiency ?? 0;
            siteMetricSums.improvementExecution += sb.improvementExecution ?? 0;
            siteMetricSums.repeatViolationPenalty += Math.abs(sb.repeatViolationPenalty ?? 0);
            siteMetricCount += 1;
        }
    }

    const trades = Array.from(tradesSet).sort((a, b) => a.localeCompare(b, 'ko'));
    const nationalities = Array.from(nationalitiesSet).sort((a, b) => a.localeCompare(b, 'ko'));

    const allWorkers = new Map<string, WorkerTrendData>();

    for (const [workerId, records] of workerRecordsMap) {
        const sorted = [...records].sort((a, b) => safeDateValue(a.date) - safeDateValue(b.date));
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
        const metrics = acc.metricCount > 0
            ? {
                psychological: round1(acc.metricSums.psychological / acc.metricCount),
                jobUnderstanding: round1(acc.metricSums.jobUnderstanding / acc.metricCount),
                riskAssessmentUnderstanding: round1(acc.metricSums.riskAssessmentUnderstanding / acc.metricCount),
                proficiency: round1(acc.metricSums.proficiency / acc.metricCount),
                improvementExecution: round1(acc.metricSums.improvementExecution / acc.metricCount),
                repeatViolationPenalty: round1(acc.metricSums.repeatViolationPenalty / acc.metricCount),
            }
            : { ...EMPTY_METRICS };

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

    const siteAverageMetrics = siteMetricCount > 0
        ? {
            psychological: round1(siteMetricSums.psychological / siteMetricCount),
            jobUnderstanding: round1(siteMetricSums.jobUnderstanding / siteMetricCount),
            riskAssessmentUnderstanding: round1(siteMetricSums.riskAssessmentUnderstanding / siteMetricCount),
            proficiency: round1(siteMetricSums.proficiency / siteMetricCount),
            improvementExecution: round1(siteMetricSums.improvementExecution / siteMetricCount),
            repeatViolationPenalty: round1(siteMetricSums.repeatViolationPenalty / siteMetricCount),
        }
        : { ...EMPTY_METRICS };

    return {
        trades,
        nationalities,
        barData,
        groups,
        siteAverageMetrics,
        unassignedRecordCount,
    };
}
