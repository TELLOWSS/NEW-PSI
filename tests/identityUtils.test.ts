import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import { applyIdentityPolicy, validateIdentityPolicy } from '../utils/identityUtils';
import { applyWorkerUuidPolicy, getWorkerMatchScore, isSameWorkerTimeline } from '../utils/workerIdentity';

const record = (patch: Partial<WorkerRecord> = {}): WorkerRecord => ({
    id: 'record-a', name: '홍길동', nationality: '대한민국', jobField: '형틀',
    date: '2026-09-02', safetyLevel: '중급', matchMethod: 'unmatched', ...patch,
} as WorkerRecord);

describe('display identity provenance', () => {
    it('marks generated employee and QR credentials and clears their old match assertion', () => {
        for (const matchMethod of ['employeeId', 'qr'] as const) {
            const generated = applyIdentityPolicy(record({ matchMethod }));
            expect(generated.employeeIdGenerated).toBe(true);
            expect(generated.qrIdGenerated).toBe(true);
            expect(generated.matchMethod).toBe('unmatched');
            expect(validateIdentityPolicy(generated)).toEqual({ employeeIdValid: true, qrIdValid: true });
            const duplicate = { ...generated, id: 'record-b', matchMethod, employeeIdScope: 'scope-a' };
            expect(isSameWorkerTimeline({ ...generated, matchMethod, employeeIdScope: 'scope-a' }, duplicate)).toBe(false);
        }
    });

    it('does not leak name, job, team, role, or score through generated credentials', () => {
        const first = applyIdentityPolicy(record());
        const changed = applyIdentityPolicy(record({ name: '다른 이름', jobField: '철근', teamLeader: 'B팀장', role: 'leader', safetyLevel: '고급' }));
        expect(changed.employeeId).toBe(first.employeeId);
        expect(changed.qrId).toBe(first.qrId);
    });

    it('preserves an externally supplied valid QR even when the employee suffix differs', () => {
        const external = applyIdentityPolicy(record({ qrId: 'QR-EXTERNAL-0001', employeeId: 'EMP-2026-AAAA', matchMethod: 'qr' }));
        expect(external.qrId).toBe('QR-EXTERNAL-0001');
        expect(external.qrIdGenerated).toBe(false);
        expect(external.matchMethod).toBe('qr');
    });

    it('does not promote malformed recognized values into verified generated credentials', () => {
        const normalized = applyIdentityPolicy(record({ employeeId: '!', qrId: '?', matchMethod: 'qr' }));
        expect(normalized.employeeIdGenerated).toBe(true);
        expect(normalized.qrIdGenerated).toBe(true);
        expect(normalized.matchMethod).toBe('unmatched');
        expect(getWorkerMatchScore(normalized, { ...normalized, id: 'record-b' })).toBeLessThan(55);
        expect(getWorkerMatchScore(record({ qrId: '?', matchMethod: 'qr' }), record({ id: 'record-b', qrId: '?', matchMethod: 'qr' }))).toBeLessThan(55);
    });

    it('does not rewrite a provided employee credential when another assessment uses it', () => {
        const first = record({ employeeId: 'EMP-2026-AAAA', employeeIdScope: 'company-a/site-a', matchMethod: 'employeeId' });
        const later = applyIdentityPolicy({ ...first, id: 'record-b' }, [first]);
        expect(later.employeeId).toBe(first.employeeId);
        expect(later.employeeIdGenerated).toBe(false);
        expect(isSameWorkerTimeline(first, later)).toBe(true);
    });

    it('keeps generated provenance through repeated normalization and portable identity across moves', () => {
        const first = applyIdentityPolicy(applyWorkerUuidPolicy(record()));
        const moved = applyIdentityPolicy({ ...first, id: 'record-b', date: '2027-01-01', jobField: '철근', teamLeader: '새 현장' });
        expect(moved.portableWorkerId).toBe(first.portableWorkerId);
        expect(moved.worker_uuid).toBe(first.worker_uuid);
        expect(moved.employeeIdGenerated).toBe(true);
        expect(moved.qrIdGenerated).toBe(true);
        expect(isSameWorkerTimeline(first, moved)).toBe(true);
    });

    it('does not upgrade legacy generated values to trusted credentials on normalization', () => {
        const legacy = applyIdentityPolicy(record({ employeeId: 'EMP-2026-FCXWABCD', qrId: 'QR-FCXWABCD-B', matchMethod: 'qr' }));
        expect(legacy.employeeIdGenerated).toBe(true);
        expect(legacy.qrIdGenerated).toBe(true);
        expect(legacy.matchMethod).toBe('unmatched');
    });
});
