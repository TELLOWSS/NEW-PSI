import type { AdminWorkerInsightReport, MonthlyTrendDashboard, WorkerRecord } from '../types';
import { buildMonthlyCoreMetricSeries } from './coreMetrics';

const monthKey = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? ''
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const buildAdminWorkerInsightReport = (
    record: WorkerRecord,
    history: WorkerRecord[] = [],
): AdminWorkerInsightReport => {
    const ordered = [...history, record]
        .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
        .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
    const latest = ordered[ordered.length - 1] || record;

    return {
        id: `worker-insight-${latest.id}`,
        workerId: String(latest.worker_uuid || latest.workerUuid || latest.employeeId || latest.id),
        workerName: latest.name,
        assessmentMonth: monthKey(latest.date),
        workType: latest.jobField || '미분류 공종',
        scoreBreakdown: latest.scoreBreakdown || {
            psychological: 0,
            jobUnderstanding: 0,
            riskAssessmentUnderstanding: 0,
            proficiency: 0,
            improvementExecution: 0,
            repeatViolationPenalty: 0,
        },
        repeatedIssues: Array.from(new Set(ordered.flatMap((item) => item.weakAreas || []))).slice(0, 8),
        improvementActions: Array.from(new Set(
            [...(latest.suggestions || []), latest.actionable_coaching]
                .filter((item): item is string => Boolean(item)),
        )).slice(0, 6),
        createdAt: new Date().toISOString(),
    };
};

export const buildMonthlyTrendDashboards = (records: WorkerRecord[]): MonthlyTrendDashboard[] => {
    const byMonth = records.reduce((map, record) => {
        const month = monthKey(record.date);
        if (!month) return map;
        const bucket = map.get(month) || [];
        bucket.push(record);
        map.set(month, bucket);
        return map;
    }, new Map<string, WorkerRecord[]>());
    const metricByMonth = new Map(
        buildMonthlyCoreMetricSeries(records).map((point) => [point.month, point]),
    );

    return [...byMonth.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([month, monthRecords]) => {
            const metric = metricByMonth.get(month);
            const workTypeChanges = monthRecords.reduce<Record<string, number>>((acc, item) => {
                const key = item.jobField || '미분류 공종';
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});
            const languageWritingTrends = monthRecords.reduce<Record<string, number>>((acc, item) => {
                const key = item.language || item.nationality || '미분류 언어';
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});
            const penalties = monthRecords
                .map((item) => item.scoreBreakdown?.repeatViolationPenalty)
                .filter((value): value is number => typeof value === 'number');
            const risks = new Map<string, number>();
            monthRecords.forEach((item) => (
                (item.weakAreas || []).forEach((risk) => risks.set(risk, (risks.get(risk) || 0) + 1))
            ));

            return {
                month,
                averageScore: metric?.averageScore || 0,
                workTypeChanges,
                languageWritingTrends,
                improvementExecutionRate: metric?.improvementExecutionRate || 0,
                repeatedIssueCount: penalties.filter((value) => Math.abs(value) > 0).length,
                nextEducationFocus: [...risks.entries()]
                    .sort((left, right) => right[1] - left[1])
                    .slice(0, 3)
                    .map(([risk]) => risk),
            };
        });
};
