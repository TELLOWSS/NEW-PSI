import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import { findSafetyCaseReassessment, type SafetyCaseRecord } from '../utils/safetyCase';

const portableA = `WP-${'A'.repeat(32)}`;
const portableB = `WP-${'B'.repeat(32)}`;

const pendingCase = (workerId?: string) => ({
    workerId,
    status: 'awaiting-reassessment' as const,
    completedStages: { acknowledgement: '2026-09-01T00:00:00Z' },
});
const assessment = (patch: Partial<WorkerRecord> = {}): Partial<WorkerRecord> => ({
    id: 'record-a', name: '홍길동', jobField: '형틀', nationality: '대한민국',
    date: '2026-09-02', ...patch,
});

describe('local-only safety case reassessment', () => {
    it('links the latest record only by an exact portable identity even after job changes', () => {
        const earliest = assessment({ id: 'first', portableWorkerId: portableA, date: '2026-09-02' });
        const latest = assessment({ id: 'latest', portableWorkerId: portableA, jobField: '철근', date: '2026-09-03' });
        const records = [latest, earliest];
        expect(findSafetyCaseReassessment(pendingCase(portableA), records)).toBe(latest);
        expect(records).toEqual([latest, earliest]);
    });

    it('does not connect a same-name or same-job record without an exact worker identity', () => {
        const namedCase = { ...pendingCase(), workerName: '홍길동', jobField: '형틀' };
        expect(findSafetyCaseReassessment(namedCase, [assessment()])).toBeUndefined();
        expect(findSafetyCaseReassessment(pendingCase(portableB), [assessment({ portableWorkerId: portableA })])).toBeUndefined();
    });

    it('rejects legacy name-derived and display-credential identifiers', () => {
        for (const workerId of ['WN-NAMEHASH', 'WU-EMP-2026-AAAA', 'WU-QR-AAAA', 'EMP-2026-AAAA']) {
            expect(findSafetyCaseReassessment(pendingCase(workerId), [assessment({ worker_uuid: workerId })])).toBeUndefined();
        }
        expect(findSafetyCaseReassessment(pendingCase('EMP-2026-AAAA'), [assessment({ employeeId: 'EMP-2026-AAAA' })])).toBeUndefined();
    });

    it('rejects conflicting aliases, missing acknowledgements, and old assessments', () => {
        expect(findSafetyCaseReassessment(pendingCase(portableA), [assessment({ portableWorkerId: portableA, worker_uuid: portableB })])).toBeUndefined();
        expect(findSafetyCaseReassessment({ ...pendingCase(portableA), completedStages: {} }, [assessment({ portableWorkerId: portableA })])).toBeUndefined();
        expect(findSafetyCaseReassessment(pendingCase(portableA), [assessment({ portableWorkerId: portableA, date: '2026-08-31' })])).toBeUndefined();
        expect(findSafetyCaseReassessment({ ...pendingCase(portableA), status: 'closed' } as SafetyCaseRecord, [assessment({ portableWorkerId: portableA })])).toBeUndefined();
    });

    it('does not upload a safety case from the automatic reassessment effect', () => {
        const source = readFileSync(new URL('../pages/InterventionCoaching.tsx', import.meta.url), 'utf8');
        const effectStart = source.indexOf('const reassessmentCandidates =');
        const effectEnd = source.indexOf('}, [safetyCases, workerRecords]);', effectStart);
        expect(effectStart).toBeGreaterThan(0);
        expect(effectEnd).toBeGreaterThan(effectStart);
        const effect = source.slice(effectStart, effectEnd);
        expect(effect).toContain('findSafetyCaseReassessment(caseRecord, workerRecords)');
        expect(effect).toContain('setSafetyCases(upsertSafetyCase(next))');
        expect(effect).not.toContain('saveSafetyCaseToServer');
        expect(effect).not.toContain('workerRecord.name');
        // 명시적으로 사용자가 보호조치를 저장하는 기존 흐름은 유지한다.
        expect(source.slice(effectEnd)).toContain('saveSafetyCaseToServer(nextCase)');
    });
});
