import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import { buildLatestScoreMetricEvidence, summarizeScoreMetricEvidence } from '../utils/scoreMetricEvidence';
import { transformDashboardData } from '../utils/dashboardDataTransformer';

const record = (id: string, scores: Record<string, unknown>, patch: Partial<WorkerRecord> = {}) => ({
    id, worker_uuid: id, name: '합성', date: '2026-11-01', jobField: '형틀', nationality: '대한민국',
    safetyScore: 70, scoreBreakdown: scores, ...patch,
} as WorkerRecord);

describe('score metric evidence', () => {
    it('separates valid zero, missing and invalid values with individual denominators', () => {
        const rows = summarizeScoreMetricEvidence([
            record('a', { psychological: 0, jobUnderstanding: 20 }),
            record('b', { psychological: 10 }),
            record('c', { psychological: 11, jobUnderstanding: NaN }),
            record('d', {}),
        ]);
        expect(rows[0]).toMatchObject({ average: 5, valid: 2, total: 4, missing: 1, excluded: 1 });
        expect(rows[1]).toMatchObject({ average: 20, valid: 1, total: 4, missing: 2, excluded: 1 });
        expect(rows[2].average).toBeNull();
        expect(rows.every(row => row.valid + row.missing + row.excluded === row.total)).toBe(true);
    });
    it('uses latest record without backfilling missing scores and excludes invalid total', () => {
        const rows = buildLatestScoreMetricEvidence([
            record('old', { psychological: 10 }, { worker_uuid: 'same', date: '2026-10-01' }),
            record('new', {}, { worker_uuid: 'same' }),
            record('invalid', { psychological: 10 }, { safetyScore: NaN }),
        ]);
        expect(rows[0]).toMatchObject({ average: null, total: 2, missing: 1, excluded: 1 });
    });
    it('keeps penalty sign normalization separate from positive metrics', () => {
        expect(summarizeScoreMetricEvidence([record('a', { repeatViolationPenalty: -12 })])[5].average).toBe(12);
    });
    it('dashboard group and site average use valid item denominator rather than replacing missing with zero', () => {
        const result = transformDashboardData([record('a', { psychological: 10 }), record('b', { jobUnderstanding: 20 })]);
        expect(result.siteAverageMetrics.psychological).toBe(10);
        expect(result.siteAverageMetrics.proficiency).toBeNull();
        expect(result.groups['형틀::전체 국적'].metrics.psychological).toBe(10);
        expect(result.groups['형틀::전체 국적'].metricEvidence?.[0]).toMatchObject({ valid: 1, total: 2, missing: 1 });
    });
    it('empty populations retain null for every metric', () => {
        expect(Object.values(transformDashboardData([]).siteAverageMetrics).every(value => value === null)).toBe(true);
    });
});
