import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    buildMonthlyCoreMetricSeries,
    calculateCoreMetricSnapshot,
    CORE_METRIC_RULE_VERSION,
    getCoreMetricWorkerKey,
    selectLatestCoreMetricRecords,
} from '../utils/coreMetrics';

const record = (patch: Partial<WorkerRecord>): WorkerRecord => ({
    id: 'record-1',
    name: '김근로',
    jobField: '형틀',
    date: '2026-06-01',
    nationality: '대한민국',
    language: 'ko',
    handwrittenAnswers: [],
    fullText: '',
    koreanTranslation: '',
    safetyScore: 70,
    safetyLevel: '중급',
    strengths: [],
    strengths_native: [],
    weakAreas: [],
    weakAreas_native: [],
    improvement: '',
    improvement_native: '',
    suggestions: [],
    suggestions_native: [],
    aiInsights: '',
    aiInsights_native: '',
    selfAssessedRiskLevel: '중',
    ...patch,
});

describe('core metrics single source', () => {
    it('groups the same worker even when monthly worker UUID values differ', () => {
        const april = record({ id: 'apr', worker_uuid: 'monthly-04', date: '2026-04-10', safetyScore: 50 });
        const may = record({ id: 'may', worker_uuid: 'monthly-05', date: '2026-05-10', safetyScore: 80 });

        expect(getCoreMetricWorkerKey(april)).toBe(getCoreMetricWorkerKey(may));
        expect(selectLatestCoreMetricRecords([april, may])).toEqual([may]);
    });

    it('uses only each worker latest valid record for the current snapshot', () => {
        const snapshot = calculateCoreMetricSnapshot([
            record({ id: 'a-old', date: '2026-04-01', safetyScore: 20 }),
            record({
                id: 'a-latest',
                date: '2026-06-01',
                safetyScore: 80,
                scoreBreakdown: {
                    psychological: 8,
                    jobUnderstanding: 16,
                    riskAssessmentUnderstanding: 16,
                    proficiency: 24,
                    improvementExecution: 10,
                    repeatViolationPenalty: 0,
                },
            }),
            record({
                id: 'b-latest',
                name: '박근로',
                date: '2026-06-02',
                safetyScore: 50,
                safetyLevel: '고급',
                scoreBreakdown: {
                    psychological: 5,
                    jobUnderstanding: 10,
                    riskAssessmentUnderstanding: 10,
                    proficiency: 15,
                    improvementExecution: 20,
                    repeatViolationPenalty: 10,
                },
            }),
        ]);

        expect(snapshot.ruleVersion).toBe(CORE_METRIC_RULE_VERSION);
        expect(snapshot.totalWorkers).toBe(2);
        expect(snapshot.averageScore).toBe(65);
        expect(snapshot.protectionPriorityCount).toBe(1);
        expect(snapshot.analyzedWorkerCount).toBe(2);
        expect(snapshot.improvementExecutionRate).toBe(75);
    });

    it('does not trust a stale stored safety level when deciding protection priority', () => {
        const snapshot = calculateCoreMetricSnapshot([
            record({ safetyScore: 85, safetyLevel: '초급' }),
            record({ id: 'worker-2', name: '이근로', safetyScore: 55, safetyLevel: '고급' }),
        ]);

        expect(snapshot.protectionPriorityCount).toBe(1);
    });

    it('excludes invalid scores from score metrics but keeps the worker count', () => {
        const snapshot = calculateCoreMetricSnapshot([
            record({ safetyScore: Number.NaN }),
            record({ id: 'worker-2', name: '이근로', safetyScore: 80 }),
        ]);

        expect(snapshot.totalWorkers).toBe(2);
        expect(snapshot.validScoreRecordCount).toBe(1);
        expect(snapshot.excludedInvalidScoreCount).toBe(1);
        expect(snapshot.averageScore).toBe(80);
    });

    it('uses one latest record per worker inside each monthly trend point', () => {
        const series = buildMonthlyCoreMetricSeries([
            record({ id: 'apr-early', date: '2026-04-01', safetyScore: 40 }),
            record({ id: 'apr-late', date: '2026-04-20', safetyScore: 60 }),
            record({ id: 'may', date: '2026-05-20', safetyScore: 80 }),
        ]);

        expect(series.map((point) => [point.month, point.averageScore, point.totalWorkers])).toEqual([
            ['2026-04', 60, 1],
            ['2026-05', 80, 1],
        ]);
    });
});
