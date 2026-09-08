import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import { buildOperationsTrend } from '../utils/operationsTrend';
const record = (date: string, risk = true) => ({ date, safetyScore: 80, weakAreas: risk ? ['위험 요소'] : [] } as WorkerRecord);
describe('risk trend calendar aggregation', () => {
    it('aggregates by month and includes zero months through the latest record, not latest risk', () => {
        const result = buildOperationsTrend([record('2026-01-02'), record('2026-01-20'), record('2026-03-01', false)], 'monthly', 60);
        expect(result.points).toHaveLength(12);
        expect(result.points.slice(-3).map(point => point.value)).toEqual([2, 0, 0]);
        expect(result.latestDate).toBe('2026-03-01');
        expect(result.total).toBe(3);
    });
    it('uses Monday week boundaries across a year change', () => {
        const result = buildOperationsTrend([record('2025-12-28'), record('2025-12-29'), record('2026-01-04')], 'weekly', 60);
        expect(result.points.at(-1)).toMatchObject({ key: '2025-12-29', end: '2026-01-04', value: 2 });
        expect(result.points.at(-2)?.value).toBe(1);
    });
    it('handles leap dates, year groups, and invalid dates without inventing records', () => {
        const result = buildOperationsTrend([record('2024-02-29'), record('2025-02-29'), record('bad'), record('2026-01-01')], 'yearly', 60);
        expect(result.invalidDateCount).toBe(2);
        expect(result.points.at(-3)?.value).toBe(1);
        expect(result.risks).toBe(2);
    });
    it('uses the Korean date for timestamps and marks empty history', () => {
        expect(buildOperationsTrend([record('2026-01-01T16:00:00Z')], 'daily', 60).latestDate).toBe('2026-01-02');
        const empty = buildOperationsTrend([], 'monthly', 60, new Date('2026-09-08'));
        expect(empty.latestDate).toBeNull();
        expect(empty.points.every(point => point.value === 0)).toBe(true);
    });
});
