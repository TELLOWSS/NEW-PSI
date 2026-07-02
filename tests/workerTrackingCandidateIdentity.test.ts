import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    analyzeWorkerEvidenceReadiness,
    getWorkerIdentityKey,
    getWorkerTrackingCandidateIdentityKey,
} from '../utils/workerIdentity';

const record = (patch: Partial<WorkerRecord>): WorkerRecord => ({
    id: patch.id || 'record-1',
    name: patch.name || 'Legacy Worker',
    employeeId: patch.employeeId,
    qrId: patch.qrId,
    worker_uuid: patch.worker_uuid,
    workerUuid: patch.workerUuid,
    jobField: patch.jobField || 'Form',
    teamLeader: patch.teamLeader || 'Team A',
    nationality: patch.nationality || 'Vietnam',
    date: patch.date || '2026-01-10',
    safetyScore: patch.safetyScore ?? 70,
    safetyLevel: patch.safetyLevel || '중급',
    strengths: [],
    strengths_native: [],
    weakAreas: [],
    weakAreas_native: [],
    suggestions: [],
    suggestions_native: [],
    handwrittenAnswers: [],
    aiInsights: '',
    aiInsights_native: '',
    improvement: '',
    improvement_native: '',
    fullText: '',
    koreanTranslation: '',
    language: 'ko',
    ocrConfidence: 1,
    matchMethod: 'unmatched',
    integrityScore: 100,
    originalImage: patch.originalImage,
    profileImage: patch.profileImage,
    selfAssessedRiskLevel: '중',
});

describe('worker tracking candidate identity', () => {
    it('keeps exact identity strict while allowing legacy tracking candidates', () => {
        const january = record({
            id: 'legacy-link-jan',
            worker_uuid: 'generated-jan',
            employeeId: 'EMP-2026-JAN1',
            qrId: 'QR-JAN1-B',
            jobField: 'Form',
            date: '2026-01-10',
            safetyScore: 55,
        });
        const february = record({
            id: 'legacy-link-feb',
            worker_uuid: 'generated-feb',
            employeeId: 'EMP-2026-FEB1',
            qrId: 'QR-FEB1-B',
            jobField: 'Rebar',
            date: '2026-02-10',
            safetyScore: 70,
        });

        expect(getWorkerIdentityKey(january)).not.toBe(getWorkerIdentityKey(february));
        expect(getWorkerTrackingCandidateIdentityKey(january)).toBe(getWorkerTrackingCandidateIdentityKey(february));

        const strictSummary = analyzeWorkerEvidenceReadiness([january, february], new Date('2026-06-17T00:00:00+09:00'));
        const candidateSummary = analyzeWorkerEvidenceReadiness(
            [january, february],
            new Date('2026-06-17T00:00:00+09:00'),
            getWorkerTrackingCandidateIdentityKey,
        );

        expect(strictSummary.multiMonthWorkerGroups).toBe(0);
        expect(candidateSummary.workerGroups).toBe(1);
        expect(candidateSummary.multiMonthWorkerGroups).toBe(1);
        expect(candidateSummary.improvingWorkerGroups).toBe(1);
    });
});
