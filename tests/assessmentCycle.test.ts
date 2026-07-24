import { describe, expect, it } from 'vitest';
import {
    activateAssessmentCyclePolicy,
    DEFAULT_ASSESSMENT_CYCLE,
    getAssessmentCycleCopy,
    getCycleAwareRouteLabel,
    getDateOnlyInTimeZone,
    normalizeAssessmentCycle,
    resolveAssessmentPeriod,
} from '../utils/assessmentCycle';

describe('assessment cycle settings', () => {
    it('keeps the existing monthly experience as the safe default', () => {
        expect(normalizeAssessmentCycle()).toEqual(DEFAULT_ASSESSMENT_CYCLE);
        expect(getAssessmentCycleCopy().nextCycleLabel).toBe('다음 달');
    });

    it('creates weekly copy from the configured weekday', () => {
        const copy = getAssessmentCycleCopy({
            cadence: 'weekly',
            weeklyDueDay: 5,
            recordLabel: '주간 위험성평가표',
        });

        expect(copy.frequencyLabel).toBe('매주 금요일');
        expect(copy.nextCycleLabel).toBe('다음 주');
        expect(copy.scheduleDescription).toContain('주간 위험성평가표');
        expect(getCycleAwareRouteLabel('monthly-guidance-report', '월별 계도 리포트', copy)).toBe('주간 계도 리포트');
    });

    it('clamps unsafe custom intervals and removes an empty record name', () => {
        const cycle = normalizeAssessmentCycle({
            cadence: 'custom',
            customIntervalDays: 900,
            recordLabel: '   ',
        });

        expect(cycle.customIntervalDays).toBe(365);
        expect(cycle.recordLabel).toBe('위험성평가 기록지');
    });

    it('keeps multiple weekly periods distinct inside the same calendar month', () => {
        const first = resolveAssessmentPeriod('2026-07-03', { cadence: 'weekly', weeklyDueDay: 5 });
        const second = resolveAssessmentPeriod('2026-07-10', { cadence: 'weekly', weeklyDueDay: 5 });

        expect(first.key).not.toBe(second.key);
        expect(first.endDate).toBe('2026-07-03');
        expect(second.endDate).toBe('2026-07-10');
    });

    it('resolves biweekly periods across a year boundary from the anchor', () => {
        const period = resolveAssessmentPeriod('2027-01-03', {
            cadence: 'biweekly',
            anchorDate: '2026-12-21',
        });

        expect(period.startDate).toBe('2026-12-21');
        expect(period.endDate).toBe('2027-01-03');
    });

    it('preserves records before a policy change as legacy calendar months', () => {
        const historical = resolveAssessmentPeriod('2026-06-20', {
            cadence: 'weekly',
            weeklyDueDay: 5,
            effectiveFrom: '2026-07-01',
        });
        const current = resolveAssessmentPeriod('2026-07-03', {
            cadence: 'weekly',
            weeklyDueDay: 5,
            effectiveFrom: '2026-07-01',
        });

        expect(historical.key).toBe('monthly:2026-06-01:2026-06-30');
        expect(current.key).toBe('weekly:2026-06-27:2026-07-03');
    });

    it('keeps every prior cadence when the site changes policy more than once', () => {
        const monthly = normalizeAssessmentCycle();
        const weekly = activateAssessmentCyclePolicy(
            { ...monthly, cadence: 'weekly', weeklyDueDay: 5 },
            monthly,
            '2026-07-01',
        );
        const daily = activateAssessmentCyclePolicy(
            { ...weekly, cadence: 'daily' },
            weekly,
            '2026-08-01',
        );

        expect(resolveAssessmentPeriod('2026-06-20', daily).cadence).toBe('monthly');
        expect(resolveAssessmentPeriod('2026-07-10', daily).cadence).toBe('weekly');
        expect(resolveAssessmentPeriod('2026-08-03', daily).cadence).toBe('daily');
    });

    it('uses the configured site time zone at the Korean midnight boundary', () => {
        const utcEvening = new Date('2026-07-23T16:30:00.000Z');

        expect(getDateOnlyInTimeZone(utcEvening, 'Asia/Seoul')).toBe('2026-07-24');
    });
});
