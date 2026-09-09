import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import { calculateCoreMetricSnapshot, selectLatestCoreMetricRecords } from '../utils/coreMetrics';
import { transformDashboardData, getTargetGroupKey, ALL_NATIONALITY_LABEL } from '../utils/dashboardDataTransformer';

const row = (id: string, patch: Partial<WorkerRecord> = {}): WorkerRecord => ({
    id, name: '동명 근로자', jobField: '철근', nationality: '대한민국', date: '2026-09-01', safetyScore: 60,
    worker_uuid: 'WP-VERIFIED-A', ...patch,
} as WorkerRecord);

describe('consistent identity and latest-record aggregation', () => {
    it('keeps same names with different IDs separate and follows a verified ID across trades', () => {
        const records = [row('old', { safetyScore: 10 }), row('new', { date: '2026-09-02', jobField: '형틀', safetyScore: 90 }), row('other', { worker_uuid: 'WP-VERIFIED-B' })];
        expect(selectLatestCoreMetricRecords(records).map(r => r.id)).toEqual(['new', 'other']);
        const data = transformDashboardData(records);
        expect(data.groups[getTargetGroupKey('철근', ALL_NATIONALITY_LABEL)].compositeScore).toBe(60);
        const group = data.groups[getTargetGroupKey('형틀', ALL_NATIONALITY_LABEL)];
        expect(group.compositeScore).toBe(90);
        expect(group.workers[0].trend.map(point => point.score)).toEqual([10, 90]);
        expect(calculateCoreMetricSnapshot(records).averageScore).toBe(75);
    });
    it('preserves unverified same-name records without assuming one person', () => {
        const snapshot = calculateCoreMetricSnapshot([row('a', { worker_uuid: undefined }), row('b', { worker_uuid: undefined })]);
        expect(snapshot.totalWorkers).toBe(2);
        expect(snapshot.unconfirmedIdentityCount).toBe(2);
    });
    it('does not turn null or missing latest scores into zero or reuse old scores', () => {
        const records = [row('old'), row('new', { date: '2026-09-02', safetyScore: null as unknown as number })];
        const snapshot = calculateCoreMetricSnapshot(records);
        expect(snapshot.validScoreRecordCount).toBe(0);
        expect(snapshot.excludedInvalidScoreCount).toBe(1);
        expect(snapshot.protectionPriorityCount).toBe(0);
        expect(Object.keys(transformDashboardData(records).groups)).toEqual([]);
    });
    it('makes tied-date selection independent of import order', () => {
        const a = row('a', { safetyScore: 20 }); const z = row('z', { safetyScore: 80 });
        expect(selectLatestCoreMetricRecords([a, z])).toEqual(selectLatestCoreMetricRecords([z, a]));
    });
});
