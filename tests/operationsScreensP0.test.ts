import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    filterPerformanceRecordsByTimeRange,
} from '../pages/PerformanceAnalysis';
import {
    areAllVisibleWorkersSelected,
    buildSafetyBehaviorWorkerOptions,
    updateVisibleWorkerSelection,
} from '../pages/SafetyBehaviorManagement';
import {
    buildSafetyCheckWorkerOptions,
    getLocalTodayDateValue,
} from '../pages/SafetyChecks';

const workerRecord = (patch: Partial<WorkerRecord> = {}): WorkerRecord => ({
    id: patch.id || 'record-1',
    name: patch.name || '홍길동',
    employeeId: patch.employeeId,
    qrId: patch.qrId,
    worker_uuid: patch.worker_uuid,
    workerUuid: patch.workerUuid,
    jobField: patch.jobField || '형틀',
    teamLeader: patch.teamLeader || '김팀장',
    date: patch.date || '2026-06-19',
    nationality: patch.nationality || '대한민국',
    language: patch.language || 'ko',
    handwrittenAnswers: patch.handwrittenAnswers || [],
    fullText: patch.fullText || '',
    koreanTranslation: patch.koreanTranslation || '',
    safetyScore: patch.safetyScore ?? 80,
    safetyLevel: patch.safetyLevel || '중급',
    strengths: patch.strengths || [],
    strengths_native: patch.strengths_native || [],
    weakAreas: patch.weakAreas || [],
    weakAreas_native: patch.weakAreas_native || [],
    improvement: patch.improvement || '',
    improvement_native: patch.improvement_native || '',
    suggestions: patch.suggestions || [],
    suggestions_native: patch.suggestions_native || [],
    aiInsights: patch.aiInsights || '',
    aiInsights_native: patch.aiInsights_native || '',
    selfAssessedRiskLevel: patch.selfAssessedRiskLevel || '중',
});

describe('operations screen P0 boundaries', () => {
    it('filters performance inputs by the selected local calendar-month range', () => {
        const records = [
            workerRecord({ id: 'today', date: '2026-06-19' }),
            workerRecord({ id: 'three-start', date: '2026-04-01' }),
            workerRecord({ id: 'three-before', date: '2026-03-31' }),
            workerRecord({ id: 'six-start', date: '2026-01-01' }),
            workerRecord({ id: 'year-start', date: '2025-07-01' }),
            workerRecord({ id: 'year-before', date: '2025-06-30' }),
            workerRecord({ id: 'future', date: '2026-06-20' }),
        ];
        const now = new Date(2026, 5, 19, 12, 0, 0);

        expect(filterPerformanceRecordsByTimeRange(records, '최근 3개월', now).map((record) => record.id))
            .toEqual(['today', 'three-start']);
        expect(filterPerformanceRecordsByTimeRange(records, '최근 6개월', now).map((record) => record.id))
            .toEqual(['today', 'three-start', 'three-before', 'six-start']);
        expect(filterPerformanceRecordsByTimeRange(records, '최근 1년', now).map((record) => record.id))
            .toEqual(['today', 'three-start', 'three-before', 'six-start', 'year-start']);
    });

    it('selects and clears only workers visible in the current filter result', () => {
        const initiallySelected = new Set(['outside-filter']);
        const selected = updateVisibleWorkerSelection(initiallySelected, ['visible-a', 'visible-b']);

        expect(Array.from(selected).sort()).toEqual(['visible-a', 'visible-b']);
        expect(areAllVisibleWorkersSelected(selected, ['visible-a', 'visible-b'])).toBe(true);

        const cleared = updateVisibleWorkerSelection(selected, ['visible-a', 'visible-b']);
        expect(Array.from(cleared)).toEqual([]);
    });

    it('does not create demo operation targets when there are no real workers', () => {
        expect(buildSafetyBehaviorWorkerOptions([])).toEqual([]);
        expect(buildSafetyCheckWorkerOptions([])).toEqual([]);
    });

    it('uses the local calendar date for a new safety check', () => {
        expect(getLocalTodayDateValue(new Date(2026, 0, 2, 0, 30, 0))).toBe('2026-01-02');
    });

    it('deduplicates safety-check targets by stable worker identity and keeps the latest record id', () => {
        const options = buildSafetyCheckWorkerOptions([
            workerRecord({
                id: 'january-record',
                name: '응우옌반안',
                jobField: '형틀',
                nationality: '베트남',
                employeeId: 'EMP-OLD',
                date: '2026-01-10',
            }),
            workerRecord({
                id: 'february-record',
                name: '응우옌반안',
                jobField: '형틀',
                nationality: '베트남',
                employeeId: 'EMP-NEW',
                date: '2026-02-10',
            }),
            workerRecord({
                id: 'different-worker',
                name: '응우옌반안',
                jobField: '형틀',
                nationality: '중국',
                date: '2026-02-11',
            }),
        ]);

        expect(options).toHaveLength(2);
        expect(options.map((option) => option.id)).toEqual(['different-worker', 'february-record']);
    });
});
