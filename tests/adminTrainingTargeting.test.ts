import { describe, expect, it } from 'vitest';
import {
    calculateTrainingAwarenessStats,
    normalizeTrainingTargets,
    parseStoredTrainingTargets,
} from '../api/admin/training';
import { buildTrainingTargetSelectionPayload } from '../pages/AdminTraining';

describe('admin training targeting', () => {
    it('builds the create payload from the UI selection using stable IDs', () => {
        const workers = [
            { id: 'worker-1', name: '김안전', jobField: '형틀', teamName: 'A팀' },
            { id: 'worker-2', name: '이현장', jobField: '철근', teamName: 'B팀' },
        ];

        expect(buildTrainingTargetSelectionPayload(
            'attendance_only',
            ['worker-2', 'worker-1'],
            workers,
        )).toEqual({
            targetWorkerIds: ['worker-2', 'worker-1'],
            targetWorkerNames: ['이현장', '김안전'],
        });

        expect(buildTrainingTargetSelectionPayload(
            'submitted_only',
            ['worker-1'],
            workers,
        )).toEqual({
            targetWorkerIds: [],
            targetWorkerNames: [],
        });
    });

    it('pairs and deduplicates stable worker IDs with display names', () => {
        expect(normalizeTrainingTargets(
            ['worker-1', 'worker-1', 'worker-2'],
            ['김안전', '중복 이름', '이현장'],
        )).toEqual([
            { id: 'worker-1', name: '김안전' },
            { id: 'worker-2', name: '이현장' },
        ]);
    });

    it('reads both stable-ID target objects and legacy name arrays', () => {
        expect(parseStoredTrainingTargets([
            { id: 'worker-1', name: '김안전' },
            '이현장',
        ])).toEqual([
            { id: 'worker-1', name: '김안전' },
            { id: '', name: '이현장' },
        ]);
    });

    it('uses every designated target as the completion-rate denominator', () => {
        const stats = calculateTrainingAwarenessStats({
            targetMode: 'attendance_only',
            storedTargets: [
                { id: 'worker-1', name: '김안전' },
                { id: 'worker-2', name: '이현장' },
                { id: 'worker-3', name: '박미참여' },
            ],
            logs: [
                { worker_id: 'worker-1', worker_name: '김안전', nationality: '대한민국' },
                { worker_id: 'worker-2', worker_name: '이현장', nationality: '대한민국' },
                { worker_id: 'outside-worker', worker_name: '외부제출', nationality: '베트남' },
            ],
            acknowledgements: [
                { worker_name: '김안전', comprehension_complete: true },
                { worker_name: '이현장', comprehension_complete: false },
                { worker_name: '외부제출', comprehension_complete: true },
            ],
            acknowledgementAvailable: true,
        });

        expect(stats).toMatchObject({
            submittedWorkers: 3,
            confirmedWorkers: 1,
            targetWorkers: 3,
            targetScopeDefined: true,
            unconfirmedWorkers: 2,
            confirmationRate: 33,
            nationalityCount: 2,
            unconfirmedTargetWorkerIds: ['worker-2', 'worker-3'],
        });
    });

    it('keeps sessions without designated targets in an undefined-scope state', () => {
        const stats = calculateTrainingAwarenessStats({
            targetMode: 'submitted_only',
            storedTargets: [],
            logs: [
                { worker_id: 'worker-1', worker_name: '김안전' },
                { worker_id: 'worker-2', worker_name: '이현장' },
            ],
            acknowledgements: [
                { worker_name: '김안전', comprehension_complete: true },
                { worker_name: '이현장', comprehension_complete: true },
            ],
            acknowledgementAvailable: true,
        });

        expect(stats.confirmedWorkers).toBe(2);
        expect(stats.targetScopeDefined).toBe(false);
        expect(stats.targetWorkers).toBeNull();
        expect(stats.unconfirmedWorkers).toBeNull();
        expect(stats.confirmationRate).toBeNull();
        expect(stats.unconfirmedTargetWorkerIds).toEqual([]);
    });

    it('falls back to submitted target IDs when the acknowledgement table is unavailable', () => {
        const stats = calculateTrainingAwarenessStats({
            targetMode: 'attendance_only',
            storedTargets: [
                { id: 'worker-1', name: '김안전' },
                { id: 'worker-2', name: '이현장' },
            ],
            logs: [
                { worker_id: 'worker-1', worker_name: '김안전' },
            ],
            acknowledgements: null,
            acknowledgementAvailable: false,
        });

        expect(stats.confirmedWorkers).toBe(1);
        expect(stats.unconfirmedWorkers).toBe(1);
        expect(stats.confirmationRate).toBe(50);
        expect(stats.ackDataSource).toBe('submission_gate');
    });
});
