import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    buildTradeWorkerRiskReference,
    getManagerWorkerComparisonAction,
    getPreviousMonthKey,
    getTradeDecisionCues,
    previewManagerWorkerRiskGap,
    recommendManagerRiskLevel,
} from '../utils/managerRiskBaselineWizard';

const record = (id: string, level: '상' | '중' | '하', weakAreas: string[] = []): WorkerRecord => ({
    id,
    name: `근로자-${id}`,
    jobField: '형틀',
    date: '2026-06-10',
    nationality: '대한민국',
    language: 'ko',
    safetyScore: 70,
    safetyLevel: '중급',
    strengths: [],
    strengths_native: [],
    weakAreas,
    weakAreas_native: [],
    suggestions: [],
    suggestions_native: [],
    handwrittenAnswers: [{ questionNumber: '3', answerText: level, koreanTranslation: level }],
    aiInsights: '',
    aiInsights_native: '',
    improvement: '',
    improvement_native: '',
    fullText: '',
    koreanTranslation: '',
    selfAssessedRiskLevel: level,
});

describe('manager risk baseline wizard', () => {
    it('recommends high risk for fatal-consequence work regardless of worker perception', () => {
        expect(recommendManagerRiskLevel({
            severity: 'fatal',
            exposure: 'rare',
            control: 'controlled',
        })?.level).toBe('상');
    });

    it('recommends low risk only for minor, rare, and controlled work', () => {
        expect(recommendManagerRiskLevel({
            severity: 'minor',
            exposure: 'rare',
            control: 'controlled',
        })?.level).toBe('하');
        expect(recommendManagerRiskLevel({
            severity: 'minor',
            exposure: 'repeated',
            control: 'controlled',
        })?.level).toBe('중');
    });

    it('keeps the worker response distribution as reference evidence only', () => {
        const reference = buildTradeWorkerRiskReference([
            record('1', '상', ['추락', '끼임']),
            record('2', '중', ['추락']),
            record('3', '하', ['감전']),
        ]);

        expect(reference.responseCount).toBe(3);
        expect(reference.levelCounts).toEqual({ 상: 1, 중: 1, 하: 1 });
        expect(reference.topWeakAreas).toEqual(['추락', '감전']);
    });

    it('resolves the previous calendar month across year boundaries', () => {
        expect(getPreviousMonthKey('2026-06')).toBe('2026-05');
        expect(getPreviousMonthKey('2026-01')).toBe('2025-12');
    });

    it('provides trade-specific decision cues without changing the recommendation', () => {
        expect(getTradeDecisionCues('형틀')).toContain('개구부·단부 추락');
        expect(getTradeDecisionCues('미등록 공종')).toEqual([
            '당일 실제 작업내용',
            '사람·장비 동선 간섭',
            '안전조치 작동상태',
        ]);
    });

    it('previews the manager-worker gap with the production gap calculation', () => {
        const comparison = previewManagerWorkerRiskGap(
            [
                record('1', '하'),
                record('2', '중'),
                record('3', '중'),
            ],
            '2026-06',
            '형틀',
            '상',
        );

        expect(comparison).toMatchObject({
            managerScore: 100,
            workerScore: 33.3,
            signedGap: 66.7,
            direction: 'under-recognition',
            status: 'urgent',
        });
        expect(getManagerWorkerComparisonAction(comparison)).toContain('TBM');
    });

    it('keeps low-sample comparison as reference only', () => {
        const comparison = previewManagerWorkerRiskGap(
            [record('1', '상'), record('2', '중')],
            '2026-06',
            '형틀',
            '중',
        );

        expect(comparison?.status).toBe('low-sample');
        expect(getManagerWorkerComparisonAction(comparison)).toContain('참고만');
    });
});
