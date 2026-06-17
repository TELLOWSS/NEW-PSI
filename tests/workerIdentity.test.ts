import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    analyzeWorkerEvidenceReadiness,
    buildNameBasedWorkerUuid,
    getWorkerIdentityKey,
    isSameWorkerTimeline,
} from '../utils/workerIdentity';

const baseRecord = (patch: Partial<WorkerRecord>): WorkerRecord => ({
    id: patch.id || 'r-1',
    name: patch.name || '홍길동',
    employeeId: patch.employeeId,
    qrId: patch.qrId,
    worker_uuid: patch.worker_uuid,
    workerUuid: patch.workerUuid,
    jobField: patch.jobField || '형틀',
    teamLeader: patch.teamLeader || '김팀장',
    nationality: patch.nationality || '대한민국',
    date: patch.date || '2026-01-15',
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
});
