import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    analyzeWorkerEvidenceReadiness,
    applyWorkerUuidPolicy,
    buildNameBasedWorkerUuid,
    buildWorkerTimelineGroups,
    getWorkerIdentityKey,
    getWorkerMatchScore,
    hasAmbiguousStableWorkerMatches,
    hasMonthlyJobFieldMismatch,
    isPotentialSameWorkerManualReviewTarget,
    isSameWorkerTimeline,
    mergeWorkerRegistrationRecords,
} from '../utils/workerIdentity';

const baseRecord = (patch: Partial<WorkerRecord>): WorkerRecord => ({
    id: patch.id ?? 'r-1',
    portableWorkerId: patch.portableWorkerId,
    worker_uuid: patch.worker_uuid,
    workerUuid: patch.workerUuid,
    name: patch.name ?? '홍길동',
    employeeId: patch.employeeId,
    employeeIdGenerated: patch.employeeIdGenerated,
    employeeIdScope: patch.employeeIdScope,
    qrId: patch.qrId,
    qrIdGenerated: patch.qrIdGenerated,
    jobField: patch.jobField ?? '형틀',
    teamLeader: patch.teamLeader ?? '김팀장',
    nationality: patch.nationality ?? '대한민국',
    date: patch.date ?? '2026-01-15',
    safetyScore: patch.safetyScore ?? 70,
    safetyLevel: patch.safetyLevel || '중급',
    strengths: patch.strengths || [],
    strengths_native: patch.strengths_native || [],
    weakAreas: patch.weakAreas || [],
    weakAreas_native: patch.weakAreas_native || [],
    suggestions: patch.suggestions || [],
    suggestions_native: patch.suggestions_native || [],
    handwrittenAnswers: patch.handwrittenAnswers || [],
    aiInsights: patch.aiInsights || '',
    aiInsights_native: patch.aiInsights_native || '',
    improvement: patch.improvement || '',
    improvement_native: patch.improvement_native || '',
    fullText: patch.fullText || '',
    koreanTranslation: patch.koreanTranslation || '',
    language: patch.language || 'ko',
    ocrConfidence: patch.ocrConfidence ?? 1,
    matchMethod: patch.matchMethod ?? 'unmatched',
    integrityScore: patch.integrityScore ?? 100,
    originalImage: patch.originalImage,
    profileImage: patch.profileImage,
    selfAssessedRiskLevel: patch.selfAssessedRiskLevel || '중',
});

describe('worker identity policy', () => {
    it('normalizes one existing portable or worker UUID across every alias', () => {
        const portable = applyWorkerUuidPolicy(baseRecord({
            portableWorkerId: 'WP-PORTABLE-001',
        }));
        const snakeCase = applyWorkerUuidPolicy(baseRecord({
            worker_uuid: 'server-worker-001',
        }));
        const camelCase = applyWorkerUuidPolicy(baseRecord({
            workerUuid: 'server-worker-002',
        }));

        expect(portable.portableWorkerId).toBe('WP-PORTABLE-001');
        expect(portable.worker_uuid).toBe('WP-PORTABLE-001');
        expect(portable.workerUuid).toBe('WP-PORTABLE-001');
        expect(snakeCase.portableWorkerId).toBe('server-worker-001');
        expect(snakeCase.workerUuid).toBe('server-worker-001');
        expect(camelCase.portableWorkerId).toBe('server-worker-002');
        expect(camelCase.worker_uuid).toBe('server-worker-002');
    });

    it('keeps an existing portable ID ahead of inherited and credential identities', () => {
        const resolved = applyWorkerUuidPolicy(baseRecord({
            portableWorkerId: 'WP-CURRENT',
            qrId: 'QR-VERIFIED-001',
            employeeId: 'EMP-2026-AAAA',
            matchMethod: 'qr',
        }), 'WP-INHERITED');

        expect(resolved.portableWorkerId).toBe('WP-CURRENT');
        expect(resolved.worker_uuid).toBe('WP-CURRENT');
        expect(resolved.workerUuid).toBe('WP-CURRENT');
    });

    it('inherits a stable portable ID before issuing one from a verified credential', () => {
        const resolved = applyWorkerUuidPolicy(baseRecord({
            qrId: 'QR-VERIFIED-001',
            matchMethod: 'qr',
        }), 'WP-INHERITED');

        expect(resolved.portableWorkerId).toBe('WP-INHERITED');
        expect(resolved.worker_uuid).toBe('WP-INHERITED');
        expect(resolved.workerUuid).toBe('WP-INHERITED');
    });

    it('uses a verified QR as an exact match without exposing it in a newly issued portable ID', () => {
        const first = baseRecord({
            id: 'qr-a',
            name: '근로자A',
            qrId: 'QR-PORTABLE-0001',
            matchMethod: 'qr',
        });
        const second = baseRecord({
            id: 'qr-b',
            name: '근로자B',
            qrId: 'QR-PORTABLE-0001',
            matchMethod: 'qr',
        });
        const assigned = applyWorkerUuidPolicy(first);

        expect(getWorkerIdentityKey(first)).toBe(getWorkerIdentityKey(second));
        expect(getWorkerMatchScore(first, second)).toBe(140);
        expect(isSameWorkerTimeline(first, second)).toBe(true);
        expect(assigned.portableWorkerId).toMatch(/^WP-[A-F0-9]{32}$/);
        expect(assigned.portableWorkerId).not.toContain('QR-PORTABLE-0001');
    });

    it('uses a confirmed employee ID only after the verified-QR path', () => {
        const employeeA = baseRecord({
            id: 'employee-a',
            name: '근로자A',
            employeeId: 'EMP-2026-AAAA',
            matchMethod: 'employeeId',
            employeeIdScope: 'company-a/site-a',
        });
        const employeeB = baseRecord({
            id: 'employee-b',
            name: '근로자B',
            employeeId: 'EMP-2026-AAAA',
            matchMethod: 'employeeId',
            employeeIdScope: 'company-a/site-a',
        });
        const qrPreferred = baseRecord({
            id: 'qr-preferred',
            employeeId: 'EMP-2026-AAAA',
            qrId: 'QR-PORTABLE-0002',
            matchMethod: 'qr',
        });

        expect(getWorkerIdentityKey(employeeA)).toBe('employee:COMPANY-A/SITE-A:EMP-2026-AAAA');
        expect(getWorkerMatchScore(employeeA, employeeB)).toBe(120);
        expect(isSameWorkerTimeline(employeeA, employeeB)).toBe(true);
        expect(getWorkerIdentityKey(qrPreferred)).toBe('qr:QR-PORTABLE-0002');
    });

    it('never treats unscoped or different-company employee IDs as exact identities', () => {
        const unscoped = baseRecord({ id: 'employee-unscoped', employeeId: 'EMP-2026-AAAA', matchMethod: 'employeeId' });
        const scopedA = baseRecord({ ...unscoped, id: 'employee-a', employeeIdScope: 'company-a/site-a' });
        const scopedB = baseRecord({ ...unscoped, id: 'employee-b', employeeIdScope: 'company-b/site-a' });

        expect(getWorkerIdentityKey(unscoped)).toBe('record:EMPLOYEE-UNSCOPED');
        expect(isSameWorkerTimeline(unscoped, scopedA)).toBe(false);
        expect(isSameWorkerTimeline(scopedA, scopedB)).toBe(false);
    });

    it('ignores legacy generated employee and grade-bearing QR credentials', () => {
        const generated = baseRecord({
            id: 'generated-a', employeeId: 'EMP-2026-FCXWABCD', qrId: 'QR-FCXWABCD-B',
            employeeIdScope: 'company-a/site-a', matchMethod: 'qr',
        });
        const duplicate = baseRecord({ ...generated, id: 'generated-b' });

        expect(isSameWorkerTimeline(generated, duplicate)).toBe(false);
        expect(isSameWorkerTimeline({ ...generated, matchMethod: 'employeeId' }, { ...duplicate, matchMethod: 'employeeId' })).toBe(false);
    });

    it('does not trust legacy WU identifiers that directly embed a management number or QR', () => {
        for (const worker_uuid of ['WU-EMP-2026-FCXWABCD', 'WU-QR-FCXWABCD-B']) {
            const first = baseRecord({ id: 'legacy-a', worker_uuid });
            const second = baseRecord({ id: 'legacy-b', worker_uuid });
            expect(isSameWorkerTimeline(first, second)).toBe(false);
            expect(applyWorkerUuidPolicy(first).portableWorkerId).toMatch(/^WP-[A-F0-9]{32}$/);
        }
    });

    it('never derives an exact worker ID from name, nationality, job, or old WN identifiers', () => {
        const first = baseRecord({
            id: 'legacy-a',
            worker_uuid: 'WN-LEGACY-NAME-HASH',
            workerUuid: 'WN-LEGACY-NAME-HASH',
            name: '응우옌반안',
            nationality: '베트남',
            jobField: '형틀',
        });
        const second = baseRecord({
            id: 'legacy-b',
            name: '응우옌반안',
            nationality: '베트남',
            jobField: '형틀',
        });
        const assignedFirst = applyWorkerUuidPolicy(first);
        const assignedSecond = applyWorkerUuidPolicy(second);

        expect(buildNameBasedWorkerUuid(first)).toBe('');
        expect(assignedFirst.portableWorkerId).toMatch(/^WP-[A-F0-9]{32}$/);
        expect(assignedSecond.portableWorkerId).toMatch(/^WP-[A-F0-9]{32}$/);
        expect(assignedFirst.portableWorkerId).not.toBe(assignedSecond.portableWorkerId);
        expect(assignedFirst.portableWorkerId).not.toContain('WN-');
    });

    it('preserves a portable identity across job, site, company, and display-name moves', () => {
        const original = {
            ...baseRecord({
                id: 'move-a',
                portableWorkerId: 'WP-MOVE-001',
                name: 'NGUYEN VAN AN',
                jobField: '형틀',
                teamLeader: 'A팀장',
                nationality: '베트남',
            }),
            siteId: 'site-a',
            companyId: 'company-a',
        } as WorkerRecord;
        const moved = {
            ...baseRecord({
                id: 'move-b',
                portableWorkerId: 'WP-MOVE-001',
                name: '응우옌 반 안',
                jobField: '철근',
                teamLeader: 'B팀장',
                nationality: '대한민국',
            }),
            siteId: 'site-b',
            companyId: 'company-b',
        } as WorkerRecord;

        expect(getWorkerIdentityKey(original)).toBe(getWorkerIdentityKey(moved));
        expect(getWorkerMatchScore(original, moved)).toBe(160);
        expect(isSameWorkerTimeline(original, moved)).toBe(true);
        expect(buildWorkerTimelineGroups([original, moved])).toHaveLength(1);
    });

    it('keeps real same-name records separate when their stable IDs differ', () => {
        const firstWorker = baseRecord({
            id: 'same-name-a',
            portableWorkerId: 'f8762cd7-8a8b-4cb0-a6e2-000000000001',
            name: '응우옌반안',
            jobField: '형틀',
            nationality: '베트남',
        });
        const secondWorker = baseRecord({
            id: 'same-name-b',
            workerUuid: 'f8762cd7-8a8b-4cb0-a6e2-000000000002',
            name: '응우옌반안',
            jobField: '형틀',
            nationality: '베트남',
        });
        const legacyWorker = baseRecord({
            id: 'same-name-legacy',
            name: '응우옌반안',
            jobField: '형틀',
            nationality: '베트남',
        });

        expect(getWorkerIdentityKey(firstWorker)).not.toBe(getWorkerIdentityKey(secondWorker));
        expect(getWorkerMatchScore(firstWorker, secondWorker)).toBe(-1);
        expect(isSameWorkerTimeline(firstWorker, secondWorker)).toBe(false);
        expect(buildWorkerTimelineGroups([firstWorker, secondWorker])).toHaveLength(2);
        expect(hasAmbiguousStableWorkerMatches(legacyWorker, [firstWorker, secondWorker])).toBe(true);
    });

    it('keeps name/nationality/job matches below the automatic merge threshold', () => {
        const sameJob = baseRecord({
            id: 'candidate-a',
            name: '응우옌반안',
            jobField: '형틀',
            nationality: '베트남',
        });
        const sameJobLater = baseRecord({
            id: 'candidate-b',
            name: '응우옌반안',
            jobField: '형틀',
            nationality: '베트남',
        });
        const movedJob = baseRecord({
            id: 'candidate-c',
            name: '응우옌반안',
            jobField: '철근',
            nationality: '베트남',
        });
        const differentNationality = baseRecord({
            id: 'candidate-d',
            name: '응우옌반안',
            jobField: '형틀',
            nationality: '중국',
        });

        expect(getWorkerMatchScore(sameJob, sameJobLater)).toBe(45);
        expect(getWorkerMatchScore(sameJob, movedJob)).toBe(35);
        expect(getWorkerMatchScore(sameJob, differentNationality)).toBe(-1);
        expect(isSameWorkerTimeline(sameJob, sameJobLater)).toBe(false);
        expect(isSameWorkerTimeline(sameJob, movedJob)).toBe(false);
        expect(buildWorkerTimelineGroups([sameJob, sameJobLater])).toHaveLength(2);
    });

    it('does not merge personal registration data without an exact stable identity', () => {
        const records = [
            {
                ...baseRecord({ id: 'legacy-a', name: '레거시근로자' }),
                phone_number: '01011112222',
            },
            {
                ...baseRecord({ id: 'legacy-b', name: '레거시근로자' }),
                birth_date: '900101',
            },
        ];

        const merged = mergeWorkerRegistrationRecords(records);

        expect(merged).toHaveLength(2);
        expect(merged[0].birth_date).toBeUndefined();
        expect(merged[1].phone_number).toBeUndefined();
    });

    it('merges registration fields when the portable identity is exactly the same', () => {
        const records = [
            {
                ...baseRecord({ id: 'portable-a', portableWorkerId: 'WP-REG-001' }),
                phone_number: '01011112222',
            },
            {
                ...baseRecord({ id: 'portable-b', portableWorkerId: 'WP-REG-001' }),
                birth_date: '900101',
            },
        ];

        const merged = mergeWorkerRegistrationRecords(records);

        expect(merged).toHaveLength(1);
        expect(merged[0].phone_number).toBe('01011112222');
        expect(merged[0].birth_date).toBe('900101');
    });

    it('summarizes evidence using explicit portable identities without personal details', () => {
        const summary = analyzeWorkerEvidenceReadiness([
            baseRecord({
                id: 'a-jan',
                portableWorkerId: 'WP-WORKER-A',
                name: 'A근로자',
                date: '2026-01-05',
                safetyScore: 50,
                originalImage: 'data:image/jpeg;base64,'.padEnd(80, 'A'),
                handwrittenAnswers: [{ questionNumber: '1', answerText: '추락 위험', koreanTranslation: '추락 위험' }],
                aiInsights: '추락 위험 인식 보완 필요',
                aiInsights_native: 'native guide',
            }),
            baseRecord({
                id: 'a-feb',
                portableWorkerId: 'WP-WORKER-A',
                name: 'A근로자',
                date: '2026-02-05',
                safetyScore: 62,
                originalImage: 'data:image/jpeg;base64,'.padEnd(80, 'A'),
                handwrittenAnswers: [{ questionNumber: '1', answerText: '안전대 확인', koreanTranslation: '안전대 확인' }],
                aiInsights: '개선 확인',
                aiInsights_native: 'native guide',
            }),
            baseRecord({
                id: 'b-jan',
                portableWorkerId: 'WP-WORKER-B',
                name: 'B근로자',
                date: '2026-01-05',
                safetyScore: 72,
            }),
        ], new Date('2026-06-17T00:00:00+09:00'));

        expect(summary.totalRecords).toBe(3);
        expect(summary.workerGroups).toBe(2);
        expect(summary.multiMonthWorkerGroups).toBe(1);
        expect(summary.improvingWorkerGroups).toBe(1);
        expect(summary.lowScoreRecords).toBe(1);
        expect(summary.imageCoverageRate).toBe(66.7);
    });

    it('marks same name and nationality as manual-review candidates only', () => {
        const workerA = baseRecord({ name: '김민수', nationality: '대한민국', jobField: '형틀' });
        const workerB = baseRecord({ id: 'worker-b', name: '김민수', nationality: '대한민국', jobField: '철근' });
        const workerSameJob = baseRecord({ id: 'worker-same-job', name: '김민수', nationality: '대한민국', jobField: '형틀' });
        const workerC = baseRecord({ id: 'worker-c', name: '김민수', nationality: '베트남', jobField: '형틀' });
        const workerD = baseRecord({ id: 'worker-d', name: '이민수', nationality: '대한민국', jobField: '형틀' });

        expect(isPotentialSameWorkerManualReviewTarget(workerA, workerB)).toBe(true);
        expect(isPotentialSameWorkerManualReviewTarget(workerA, workerSameJob)).toBe(true);
        expect(isPotentialSameWorkerManualReviewTarget(workerA, workerC)).toBe(false);
        expect(isPotentialSameWorkerManualReviewTarget(workerA, workerD)).toBe(false);
        expect(isSameWorkerTimeline(workerA, workerB)).toBe(false);
        expect(isSameWorkerTimeline(workerA, workerSameJob)).toBe(false);
    });

    it('detects monthly job field mismatch in one confirmed timeline group', () => {
        const recordJan = baseRecord({ portableWorkerId: 'WP-MISMATCH', date: '2026-01-10', jobField: '형틀' });
        const recordFebSameJob = baseRecord({ id: 'feb-same', portableWorkerId: 'WP-MISMATCH', date: '2026-02-10', jobField: '형틀' });
        const recordFebDiffJob = baseRecord({ id: 'feb-diff', portableWorkerId: 'WP-MISMATCH', date: '2026-02-10', jobField: '철근' });

        expect(hasMonthlyJobFieldMismatch([recordJan, recordFebSameJob])).toBe(false);
        expect(hasMonthlyJobFieldMismatch([recordJan, recordFebDiffJob])).toBe(true);
    });
});
