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

const workerRecord = (overrides: Partial<WorkerRecord> = {}): WorkerRecord => ({
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
    improvement: '개구부 덮개 확인을 반복 교육',
    improvement_native: '',
    suggestions: ['작업 전 안전대 체결 확인'],
    suggestions_native: [],
    aiInsights: '',
    aiInsights_native: '',
    selfAssessedRiskLevel: '상',
    ...overrides,
});

describe('TBM education studio', () => {
    it('does not treat worker Q3 high-risk answers as next-month high-grade sharing items', () => {
        const draft = buildTbmEducationDraft({
            workerRecords: [workerRecord()],
            sources: [],
            month: '2026-07',
            workType: '철골',
        });

        expect(draft.risks).toHaveLength(0);
        expect(getHighGradeRiskShareItems(draft.risks)).toHaveLength(0);
        expect(draft.focusPoints.join(' ')).toContain('추락');
        expect(buildMonthlyEducationPackageText(draft)).toContain('회의자료');
        expect(buildMonthlyEducationPackageText(draft)).toContain('일반 추천 위험은 이 영역에 넣지 않습니다.');
    });

    it('shares only high-grade items explicitly marked in next-month risk assessment meeting documents', () => {
        const draft = buildTbmEducationDraft({
            workerRecords: [workerRecord({ weakAreas: ['감전'] })],
            sources: [{
                id: 'meeting-pdf-1',
                kind: 'document',
                title: '7월 위험성평가 회의자료.pdf',
                text: '다음달 위험성평가 회의 결과 | 위험요인: 장비 충돌 | 위험등급: 상 | 관리대책: 장비 동선 분리',
                createdAt: '2026-06-10T00:00:00.000Z',
            }],
            month: '2026-07',
            workType: '철골',
        });

        expect(draft.risks).toHaveLength(1);
        expect(draft.risks[0]).toMatchObject({
            risk: '충돌',
            managerConfirmed: true,
        });
        expect(draft.risks[0].evidenceLabels.join(' ')).toContain('회의자료 상등급');
        expect(buildMonthlyEducationPackageText(draft)).toContain('충돌');
        expect(draft.risks.some((risk) => risk.risk === '감전')).toBe(false);
        expect(draft.focusPoints.join(' ')).toContain('감전');
    });

    it('keeps ordinary uploaded or pasted recommendations in focus points instead of high-grade sharing', () => {
        const draft = buildTbmEducationDraft({
            workerRecords: [],
            sources: [{
                id: 'source-1',
                kind: 'document',
                title: '일반 작업계획.pdf',
                text: '고소작업에서는 추락 방지를 확인한다. 장비 이동 시 충돌 위험을 확인한다.',
                createdAt: '2026-06-10T00:00:00.000Z',
            }],
            month: '2026-07',
            workType: '철골',
        });

        expect(draft.risks).toHaveLength(0);
        expect(draft.focusPoints.join(' ')).toContain('추락');
        expect(draft.focusPoints.join(' ')).toContain('충돌');
    });

    it('keeps a high-grade section active across pages until the field-focus boundary', () => {
        const draft = buildTbmEducationDraft({
            workerRecords: [],
            sources: [{
                id: 'meeting-ppt-1',
                kind: 'document',
                title: '7월 위험성평가 회의자료.pptx',
                text: [
                    '1. 회의 개요',
                    '3. 위험성평가 상등급 공유',
                    '--- slide 2 ---',
                    'TOP1 복합기 온열질환',
                    '관리대책: 폭염 시간대 휴식과 음수 공급',
                    '2. 위험요인: 장비 충돌 / 담당: 관리자',
                    '4. 현장 중점관리 포인트',
                    '- 감전 위험은 일반 중점관리로 안내',
                ].join('\n'),
                createdAt: '2026-06-10T00:00:00.000Z',
            }],
            month: '2026-07',
            workType: '전체 공종',
        });

        const riskNames = draft.risks.map((risk) => risk.risk);
        expect(riskNames).toContain('복합기 온열질환');
        expect(riskNames).toContain('충돌');
        expect(riskNames).not.toContain('감전');
        expect(getHighGradeRiskShareItems(draft.risks)).toHaveLength(2);
    });

    it('does not turn field-focus risks into high-grade risks after an empty high-grade section', () => {
        const draft = buildTbmEducationDraft({
            workerRecords: [],
            sources: [{
                id: 'meeting-pdf-empty',
                kind: 'document',
                title: '7월 위험성평가 회의자료.pdf',
                text: [
                    '3. 위험성평가 상등급 공유',
                    '상등급 항목 없음',
                    '4. 현장 중점관리 포인트',
                    '- 추락 방지 난간과 개구부 덮개 확인',
                ].join('\n'),
                createdAt: '2026-06-10T00:00:00.000Z',
            }],
            month: '2026-07',
            workType: '전체 공종',
        });

        expect(draft.risks).toHaveLength(0);
        expect(getHighGradeRiskShareItems(draft.risks)).toHaveLength(0);
        expect(draft.focusPoints.join(' ')).toContain('추락');
    });

    it('builds a consistent five-stage source for multilingual training', () => {
        const draft = buildTbmEducationDraft({
            workerRecords: [workerRecord()],
            sources: [{
                id: 'meeting-pdf-1',
                kind: 'document',
                title: '7월 위험성평가 회의자료.pdf',
                text: '위험요인: 개구부 추락 | 위험수준 상 | 작업발판과 안전난간을 확인한다.',
                createdAt: '2026-06-10T00:00:00.000Z',
            }],
            month: '2026-07',
            workType: '철골',
        });
        const sourceText = buildMonthlyEducationPackageText(draft);

        expect(sourceText).toContain('1. 교육 전 5분 핵심 동영상');
        expect(sourceText).toContain('2. 최근 재해사례와 현장 연관성');
        expect(sourceText).toContain('3. 다음 달 위험성평가 상등급 공유');
        expect(sourceText).toContain('4. 현장 중점관리 포인트');
        expect(sourceText).toContain('5. 공지사항');
        expect(sourceText).toContain('추락');
        expect(sourceText).toContain('이해 확인 및 행동 약속');
        expect(getFiveMinuteVideoDuration(draft)).toBe(300);
    });

    it('uses the configured operating-cycle label in education copy', () => {
        const draft = buildTbmEducationDraft({
            workerRecords: [workerRecord()],
            sources: [],
            month: '2026-07',
            workType: '철골',
            targetCycleLabel: '다음 주',
            targetPeriodLabel: '7. 6.~7. 12.',
        });
        const sourceText = buildMonthlyEducationPackageText(draft);

        expect(draft.title).toContain('7. 6.~7. 12.');
        expect(draft.opening).toContain('다음 주 예정 작업');
        expect(sourceText).toContain('3. 다음 주 위험성평가 상등급 공유');
        expect(sourceText).not.toContain('다음달 위험성평가 회의자료');
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
