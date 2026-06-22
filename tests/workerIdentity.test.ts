import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    analyzeWorkerEvidenceReadiness,
    applyWorkerUuidPolicy,
    buildNameBasedWorkerUuid,
    buildWorkerTimelineGroups,
    getWorkerMatchScore,
    getWorkerIdentityKey,
    hasAmbiguousStableWorkerMatches,
    isSameWorkerTimeline,
    mergeWorkerRegistrationRecords,
    isPotentialSameWorkerManualReviewTarget,
    hasMonthlyJobFieldMismatch,
} from '../utils/workerIdentity';

const baseRecord = (patch: Partial<WorkerRecord>): WorkerRecord => ({
    id: patch.id ?? 'r-1',
    name: patch.name ?? '홍길동',
    employeeId: patch.employeeId,
    qrId: patch.qrId,
    worker_uuid: patch.worker_uuid,
    workerUuid: patch.workerUuid,
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
    matchMethod: patch.matchMethod || 'unmatched',
    integrityScore: patch.integrityScore ?? 100,
    originalImage: patch.originalImage,
    profileImage: patch.profileImage,
    selfAssessedRiskLevel: patch.selfAssessedRiskLevel || '중',
});

describe('worker identity policy', () => {
    it('preserves either input UUID alias instead of replacing it with a name-based UUID', () => {
        const snakeCase = applyWorkerUuidPolicy(baseRecord({
            worker_uuid: 'server-worker-001',
        }));
        const camelCase = applyWorkerUuidPolicy(baseRecord({
            workerUuid: 'server-worker-002',
        }));

        expect(snakeCase.worker_uuid).toBe('server-worker-001');
        expect(snakeCase.workerUuid).toBe('server-worker-001');
        expect(camelCase.worker_uuid).toBe('server-worker-002');
        expect(camelCase.workerUuid).toBe('server-worker-002');
        expect(snakeCase.worker_uuid).not.toBe(buildNameBasedWorkerUuid(snakeCase));
        expect(camelCase.workerUuid).not.toBe(buildNameBasedWorkerUuid(camelCase));
    });

    it('uses job field, Korean-managed name, and nationality before volatile codes', () => {
        const january = baseRecord({
            id: 'jan',
            name: '응우옌반안',
            jobField: '형틀',
            nationality: '베트남',
            employeeId: 'EMP-2026-AAAA',
            date: '2026-01-10',
        });
        const february = baseRecord({
            id: 'feb',
            name: '응우옌반안',
            jobField: '형틀',
            nationality: '베트남',
            employeeId: 'EMP-2026-BBBB',
            date: '2026-02-10',
        });

        expect(getWorkerIdentityKey(january)).toBe(getWorkerIdentityKey(february));
        expect(buildNameBasedWorkerUuid(january)).toBe(buildNameBasedWorkerUuid(february));
        expect(isSameWorkerTimeline(january, february)).toBe(true);
    });

    it('keeps real same-name records separate when their stable UUIDs differ', () => {
        const firstWorker = baseRecord({
            id: 'same-name-a',
            worker_uuid: 'f8762cd7-8a8b-4cb0-a6e2-000000000001',
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

    it('does not merge same-name workers when job field or nationality differs', () => {
        const vietnamFormWorker = baseRecord({
            id: 'v-form',
            name: '응우옌반안',
            jobField: '형틀',
            nationality: '베트남',
        });
        const vietnamRebarWorker = baseRecord({
            id: 'v-rebar',
            name: '응우옌반안',
            jobField: '철근',
            nationality: '베트남',
        });
        const chineseFormWorker = baseRecord({
            id: 'c-form',
            name: '응우옌반안',
            jobField: '형틀',
            nationality: '중국',
        });

        expect(isSameWorkerTimeline(vietnamFormWorker, vietnamRebarWorker)).toBe(false);
        expect(isSameWorkerTimeline(vietnamFormWorker, chineseFormWorker)).toBe(false);
    });

    it('uses the name fallback only for legacy records with complete conservative identity fields', () => {
        const january = baseRecord({
            id: 'legacy-jan',
            name: '응우옌반안',
            jobField: '형틀',
            nationality: '베트남',
            date: '2026-01-10',
        });
        const february = baseRecord({
            id: 'legacy-feb',
            name: '응우옌반안',
            jobField: '형틀',
            nationality: '베트남',
            date: '2026-02-10',
        });
        const unknownNationality = baseRecord({
            id: 'legacy-unknown',
            name: '응우옌반안',
            jobField: '형틀',
            nationality: '미상',
        });

        expect(isSameWorkerTimeline(january, february)).toBe(true);
        expect(isSameWorkerTimeline(january, unknownNationality)).toBe(false);
        expect(applyWorkerUuidPolicy(january).worker_uuid).toBe(buildNameBasedWorkerUuid(january));
    });

    it('does not merge personal data before server registration when stable UUIDs conflict', () => {
        const records = [
            {
                ...baseRecord({
                    id: 'server-a',
                    worker_uuid: 'worker-a',
                    name: '응우옌반안',
                    jobField: '형틀',
                    nationality: '베트남',
                }),
                phone_number: '01011112222',
            },
            {
                ...baseRecord({
                    id: 'server-b',
                    workerUuid: 'worker-b',
                    name: '응우옌반안',
                    jobField: '형틀',
                    nationality: '베트남',
                }),
                birth_date: '900101',
            },
        ];

        const merged = mergeWorkerRegistrationRecords(records);

        expect(merged).toHaveLength(2);
        expect(merged[0].birth_date).toBeUndefined();
        expect(merged[1].phone_number).toBeUndefined();
    });

    it('still merges complete UUID-less legacy registration rows conservatively', () => {
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

        expect(merged).toHaveLength(1);
        expect(merged[0].phone_number).toBe('01011112222');
        expect(merged[0].birth_date).toBe('900101');
    });

    it('summarizes public-safe evidence readiness without personal details', () => {
        const summary = analyzeWorkerEvidenceReadiness([
            baseRecord({
                id: 'a-jan',
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

    it('detects potential same worker manual matching targets (same name & nation, different job)', () => {
        const workerA = baseRecord({ name: '김민수', nationality: '대한민국', jobField: '형틀' });
        const workerB = baseRecord({ name: '김민수', nationality: '대한민국', jobField: '철근' });
        const workerC = baseRecord({ name: '김민수', nationality: '베트남', jobField: '형틀' });
        const workerD = baseRecord({ name: '이민수', nationality: '대한민국', jobField: '형틀' });

        expect(isPotentialSameWorkerManualReviewTarget(workerA, workerB)).toBe(true);
        expect(isPotentialSameWorkerManualReviewTarget(workerA, workerC)).toBe(false); // 국적 다름
        expect(isPotentialSameWorkerManualReviewTarget(workerA, workerD)).toBe(false); // 이름 다름
    });

    it('detects monthly job field mismatch in a timeline group', () => {
        const recordJan = baseRecord({ name: '김민수', date: '2026-01-10', jobField: '형틀' });
        const recordFebSameJob = baseRecord({ name: '김민수', date: '2026-02-10', jobField: '형틀' });
        const recordFebDiffJob = baseRecord({ name: '김민수', date: '2026-02-10', jobField: '철근' });

        expect(hasMonthlyJobFieldMismatch([recordJan, recordFebSameJob])).toBe(false);
        expect(hasMonthlyJobFieldMismatch([recordJan, recordFebDiffJob])).toBe(true);
    });
});
