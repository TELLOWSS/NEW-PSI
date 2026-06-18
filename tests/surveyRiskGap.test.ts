import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    buildSurveyRiskGapRows,
    getManagerRiskBaselineKey,
    getTopComparableGap,
    parseSurveyRiskLevel,
    type ManagerRiskBaselineMap,
} from '../utils/surveyRiskGap';

const record = (id: string, level: '상' | '중' | '하', date = '2026-06-10', trade = '형틀'): WorkerRecord => ({
    id,
    name: `근로자-${id}`,
    jobField: trade,
    date,
    nationality: '대한민국',
    language: 'ko',
    handwrittenAnswers: [{ questionNumber: '3', answerText: level, koreanTranslation: level }],
    fullText: '',
    koreanTranslation: '',
    safetyScore: 70,
    safetyLevel: '중급',
    strengths: [],
    strengths_native: [],
    weakAreas: [],
    weakAreas_native: [],
    improvement: '',
    improvement_native: '',
    suggestions: [],
    suggestions_native: [],
    aiInsights: '',
    aiInsights_native: '',
    selfAssessedRiskLevel: level,
});

const baseline = (level: '상' | '중' | '하'): ManagerRiskBaselineMap => ({
    [getManagerRiskBaselineKey('2026-06', '형틀')]: {
        trade: '형틀',
        monthKey: '2026-06',
        level,
        updatedAt: '2026-06-18T00:00:00.000Z',
    },
});

describe('survey risk gap', () => {
    it('does not invent a manager score when no baseline exists', () => {
        const [row] = buildSurveyRiskGapRows([record('1', '하')], {});
        expect(row.managerScore).toBeNull();
        expect(row.signedGap).toBeNull();
        expect(row.status).toBe('no-baseline');
    });

    it('calculates positive gap when workers perceive less risk than the manager baseline', () => {
        const rows = buildSurveyRiskGapRows(
            [record('1', '하'), record('2', '중'), record('3', '중')],
            baseline('상'),
        );
        expect(rows[0].managerScore).toBe(100);
        expect(rows[0].workerScore).toBe(33.3);
        expect(rows[0].signedGap).toBe(66.7);
        expect(rows[0].direction).toBe('under-recognition');
        expect(rows[0].status).toBe('urgent');
    });

    it('keeps a negative gap when workers perceive more risk than the manager baseline', () => {
        const rows = buildSurveyRiskGapRows(
            [record('1', '상'), record('2', '상'), record('3', '중')],
            baseline('하'),
        );
        expect(rows[0].signedGap).toBe(-83.3);
        expect(rows[0].absoluteGap).toBe(83.3);
        expect(rows[0].direction).toBe('over-recognition');
        expect(rows[0].status).toBe('urgent');
    });

    it('marks fewer than three comparable responses as low sample', () => {
        const [row] = buildSurveyRiskGapRows([record('1', '중'), record('2', '중')], baseline('중'));
        expect(row.signedGap).toBe(0);
        expect(row.status).toBe('low-sample');
        expect(getTopComparableGap([row])).toBeNull();
    });

    it('parses only explicit risk grades instead of Korean words containing the same syllable', () => {
        expect(parseSurveyRiskLevel('상')).toBe('상');
        expect(parseSurveyRiskLevel('위험등급: 중')).toBe('중');
        expect(parseSurveyRiskLevel('작업 상황을 확인한다')).toBeNull();
    });

    it('selects the largest absolute comparable gap', () => {
        const rows = buildSurveyRiskGapRows(
            [
                record('1', '하', '2026-06-10', '형틀'),
                record('2', '중', '2026-06-11', '형틀'),
                record('3', '중', '2026-06-12', '형틀'),
            ],
            baseline('상'),
        );
        expect(getTopComparableGap(rows)?.trade).toBe('형틀');
    });

    it('shows baseline coverage when only part of the selected period is comparable', () => {
        const rows = buildSurveyRiskGapRows(
            [
                record('1', '하', '2026-06-10'),
                record('2', '중', '2026-06-11'),
                record('3', '중', '2026-06-12'),
                record('4', '상', '2026-05-12'),
            ],
            baseline('상'),
        );

        expect(rows[0].workerResponseCount).toBe(4);
        expect(rows[0].comparableCount).toBe(3);
        expect(rows[0].baselineCoverage).toBe(75);
        expect(rows[0].workerScore).toBe(33.3);
    });

    it('uses the normalized trade for both records and baseline keys', () => {
        const normalizeTrade = (trade: string) => trade.replace(/\s+/g, '');
        const baselines: ManagerRiskBaselineMap = {
            [getManagerRiskBaselineKey('2026-06', '바닥미장')]: {
                trade: '바닥미장',
                monthKey: '2026-06',
                level: '상',
                updatedAt: '2026-06-18T00:00:00.000Z',
            },
        };

        const [row] = buildSurveyRiskGapRows(
            [
                record('1', '하', '2026-06-10', '바닥 미장'),
                record('2', '중', '2026-06-11', '바닥미장'),
                record('3', '중', '2026-06-12', '바닥 미장'),
            ],
            baselines,
            normalizeTrade,
        );

        expect(row.trade).toBe('바닥미장');
        expect(row.comparableCount).toBe(3);
        expect(row.signedGap).toBe(66.7);
    });
});
