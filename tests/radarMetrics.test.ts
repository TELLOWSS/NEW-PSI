import { describe, expect, it } from 'vitest';
import { buildRadarMetrics, metricValue } from '../utils/radarMetrics';
import type { SixMetricAverages } from '../utils/dashboardDataTransformer';

const half: SixMetricAverages = { psychological: 5, jobUnderstanding: 10, riskAssessmentUnderstanding: 10, proficiency: 15, improvementExecution: 10, repeatViolationPenalty: 0 };
describe('comparable radar metrics', () => {
    it('normalizes unequal score maxima onto the same 0–100 scale', () => {
        const rows = buildRadarMetrics(half, half);
        expect(rows).toHaveLength(5);
        expect(rows.every(row => row.타겟 === 50 && row.현장평균 === 50)).toBe(true);
    });
    it('keeps penalty out of the radar regardless of sign', () => {
        expect(buildRadarMetrics({ ...half, repeatViolationPenalty: -30 }, half).map(row => row.key)).not.toContain('repeatViolationPenalty');
        expect(metricValue('repeatViolationPenalty', -12)).toBe(12);
        expect(metricValue('repeatViolationPenalty', 0)).toBe(0);
    });
    it('does not turn missing, non-finite, negative or out-of-range scores into zero', () => {
        for (const value of [undefined, null, NaN, Infinity, -2, 11, '5']) expect(metricValue('psychological', value)).toBeNull();
        expect(metricValue('psychological', 0)).toBe(0);
        const rows = buildRadarMetrics({ ...half, psychological: NaN }, half);
        expect(rows[0].타겟).toBeNull();
        expect(rows[0].현장평균).toBe(50);
    });
});
