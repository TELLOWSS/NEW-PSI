import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    isProtectionPriorityRecord,
    resolveOperationsQueueItem,
    selectOperationsPriorityQueue,
} from '../utils/operationsBoard';

const record = (patch: Partial<WorkerRecord> = {}): WorkerRecord => ({
    id: patch.id || 'record-1',
    name: patch.name || '김근로',
    jobField: patch.jobField || '형틀',
    date: patch.date || '2026-08-21',
    nationality: patch.nationality || '대한민국',
    language: patch.language || 'ko',
    handwrittenAnswers: patch.handwrittenAnswers || [],
    fullText: patch.fullText || '',
    koreanTranslation: patch.koreanTranslation || '',
    safetyScore: patch.safetyScore ?? 75,
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
    ...patch,
});

describe('operations board protection queue', () => {
    it('uses the configured protection threshold instead of a separate hard-coded score', () => {
        expect(isProtectionPriorityRecord(record({ safetyScore: 65 }), 60)).toBe(false);
        expect(isProtectionPriorityRecord(record({ safetyScore: 55 }), 60)).toBe(true);
        expect(isProtectionPriorityRecord(record({ safetyScore: 65 }), 70)).toBe(true);
    });

    it('treats a worker-declared high risk as a protection signal and ignores invalid scores', () => {
        expect(isProtectionPriorityRecord(record({ selfAssessedRiskLevel: '상', safetyScore: 90 }), 60)).toBe(true);
        expect(isProtectionPriorityRecord(record({ safetyScore: -1 }), 60)).toBe(false);
        expect(isProtectionPriorityRecord(record({ safetyScore: Number.NaN }), 60)).toBe(false);
    });

    it('keeps completed safe records out of the priority queue', () => {
        const queue = selectOperationsPriorityQueue([
            record({ id: 'complete', reviewStatus: 'APPROVED', safetyScore: 85 }),
            record({ id: 'pending', reviewStatus: 'PENDING', safetyScore: 85 }),
            record({ id: 'priority', safetyScore: 45 }),
        ], 60);

        expect(queue.map((item) => item.record.id)).toEqual(['priority', 'pending']);
    });

    it('routes a work-stop signal directly to the field action surface', () => {
        const item = resolveOperationsQueueItem(record({ riskDecision: 'CRITICAL_STOP' }), 60);

        expect(item.statusLabel).toBe('작업중지 확인');
        expect(item.actionLabel).toBe('조치 확인');
        expect(item.actionPage).toBe('safety-compliance-hub');
    });
});
