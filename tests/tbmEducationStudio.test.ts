import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    buildMonthlyEducationPackageText,
    buildTbmEducationDraft,
    estimateEducationTokens,
    getFiveMinuteVideoDuration,
    getHighGradeRiskShareItems,
    getTbmEducationScopeKey,
} from '../utils/tbmEducationStudio';

const highGradeWorker = (overrides: Partial<WorkerRecord> = {}): WorkerRecord => ({
    id: 'record-1',
    name: '테스트 근로자',
    jobField: '철골',
    date: '2026-06-30',
    nationality: 'KR',
    language: 'ko-KR',
    handwrittenAnswers: [
        { questionNumber: '1', answerText: '철골 설치', koreanTranslation: '', nativeTranslation: '' },
        { questionNumber: '2', answerText: '개구부 추락', koreanTranslation: '', nativeTranslation: '' },
        { questionNumber: '3', answerText: '상', koreanTranslation: '', nativeTranslation: '' },
        { questionNumber: '4', answerText: '안전난간 확인', koreanTranslation: '', nativeTranslation: '' },
        { questionNumber: '5', answerText: '안전대 체결', koreanTranslation: '', nativeTranslation: '' },
    ],
    fullText: '',
    koreanTranslation: '',
    safetyScore: 70,
    safetyLevel: '중급',
    strengths: [],
    strengths_native: [],
    weakAreas: ['추락'],
    weakAreas_native: [],
    improvement: '',
    improvement_native: '',
    suggestions: [],
    suggestions_native: [],
    aiInsights: '',
    aiInsights_native: '',
    selfAssessedRiskLevel: '상',
    ...overrides,
});

describe('TBM education studio', () => {
    it('does not auto-fill next-month high-grade risks without high-grade evidence', () => {
        const draft = buildTbmEducationDraft({
            workerRecords: [],
            sources: [{
                id: 'source-1',
                kind: 'manual',
                title: '일반 안전교육 참고자료',
                text: '고소작업에서는 추락 방지를 확인한다. 장비 이동 시 충돌 위험을 확인한다.',
                createdAt: '2026-06-10T00:00:00.000Z',
            }],
            month: '2026-07',
            workType: '철골',
        });

        expect(draft.risks).toHaveLength(0);
        expect(getHighGradeRiskShareItems(draft.risks)).toHaveLength(0);
        expect(buildMonthlyEducationPackageText(draft)).toContain('일반 추천 위험은 이 영역에 넣지 않습니다.');
    });

    it('shares only Q3 high-grade risk records in the monthly education package', () => {
        const draft = buildTbmEducationDraft({
            workerRecords: [
                highGradeWorker(),
                highGradeWorker({
                    id: 'record-2',
                    selfAssessedRiskLevel: '중',
                    handwrittenAnswers: [
                        { questionNumber: '3', answerText: '중', koreanTranslation: '', nativeTranslation: '' },
                    ],
                    weakAreas: ['충돌'],
                }),
            ],
            sources: [],
            month: '2026-07',
            workType: '철골',
        });

        expect(draft.risks).toHaveLength(1);
        expect(draft.risks[0]).toMatchObject({
            risk: '추락',
            managerConfirmed: true,
        });
        expect(draft.risks[0].evidenceLabels.join(' ')).toContain('상등급 기록');
        expect(buildMonthlyEducationPackageText(draft)).toContain('추락');
        expect(buildMonthlyEducationPackageText(draft)).not.toContain('충돌');
    });

    it('accepts explicit high-grade risk evidence from uploaded sources only when marked as high-grade', () => {
        const draft = buildTbmEducationDraft({
            workerRecords: [],
            sources: [{
                id: 'source-1',
                kind: 'manual',
                title: '관리자 상등급 공유 자료',
                text: '상등급 기록 2026-06-30 / 철골 | 위험요인: 장비 충돌 | Q3 위험수준 근거: 상',
                createdAt: '2026-06-10T00:00:00.000Z',
            }],
            month: '2026-07',
            workType: '철골',
        });

        expect(draft.risks.map((risk) => risk.risk)).toContain('충돌');
        expect(draft.risks[0].evidenceLabels.join(' ')).toContain('상등급 근거');
    });

    it('builds a consistent five-stage source for multilingual training', () => {
        const draft = buildTbmEducationDraft({
            workerRecords: [highGradeWorker()],
            sources: [],
            month: '2026-07',
            workType: '철골',
        });
        const sourceText = buildMonthlyEducationPackageText(draft);

        expect(sourceText).toContain('1. 교육 전 5분 핵심 동영상');
        expect(sourceText).toContain('2. 최근 재해사례와 현장 연관성');
        expect(sourceText).toContain('3. 위험성평가 상등급 공유');
        expect(sourceText).toContain('4. 현장 중점관리 포인트');
        expect(sourceText).toContain('5. 공지사항');
        expect(sourceText).toContain('추락');
        expect(sourceText).toContain('이해 확인 및 행동 약속');
        expect(getFiveMinuteVideoDuration(draft)).toBe(300);
    });

    it('estimates source tokens conservatively', () => {
        expect(estimateEducationTokens([{
            id: 'source-1',
            kind: 'manual',
            title: '직접 입력',
            text: '가'.repeat(320),
            createdAt: '2026-06-10T00:00:00.000Z',
        }])).toBe(100);
    });

    it('separates saved education drafts by month and work type', () => {
        expect(getTbmEducationScopeKey('2026-06', 'steel')).toBe('2026-06::steel');
        expect(getTbmEducationScopeKey('2026-07', 'steel')).not.toBe(getTbmEducationScopeKey('2026-06', 'steel'));
        expect(getTbmEducationScopeKey('2026-07', 'formwork')).not.toBe(getTbmEducationScopeKey('2026-07', 'steel'));
    });
});
