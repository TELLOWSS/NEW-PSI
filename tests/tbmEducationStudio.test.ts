import { describe, expect, it } from 'vitest';
import {
    buildMonthlyEducationPackageText,
    buildTbmEducationDraft,
    estimateEducationTokens,
    getFiveMinuteVideoDuration,
    getTbmEducationScopeKey,
} from '../utils/tbmEducationStudio';

describe('TBM education studio', () => {
    it('ranks risks from evidence without an AI call', () => {
        const draft = buildTbmEducationDraft({
            workerRecords: [],
            sources: [{
                id: 'source-1',
                kind: 'manual',
                title: '다음 달 작업계획',
                text: '고소작업 중 추락 위험이 있다. 개구부 추락 방지와 안전대 체결을 교육한다.',
                createdAt: '2026-06-10T00:00:00.000Z',
            }],
            month: '2026-07',
            workType: '철근',
        });

        expect(draft.month).toBe('2026-07');
        expect(draft.title).toContain('2026년 7월');
        expect(draft.risks[0].risk).toBe('추락');
        expect(draft.risks[0].evidenceLabels).toContain('다음 달 작업계획');
        expect(draft.risks).toHaveLength(3);
        expect(draft.coreMessage).toContain('작업 시작 전');
        expect(getFiveMinuteVideoDuration(draft)).toBe(300);
        expect(draft.risks.every((risk) => risk.managerConfirmed === false)).toBe(true);
        expect(draft.accidentCases[0].title).toContain('입력 필요');
    });

    it('builds a consistent five-stage source for multilingual training', () => {
        const draft = buildTbmEducationDraft({
            workerRecords: [],
            sources: [],
            month: '2026-07',
            workType: '전체 공종',
        });
        const sourceText = buildMonthlyEducationPackageText(draft);

        expect(sourceText).toContain('1. 교육 전 5분 핵심 동영상');
        expect(sourceText).toContain('2. 최근 재해사례와 현장 연관성');
        expect(sourceText).toContain('3. 위험성평가 상등급 공유');
        expect(sourceText).toContain('4. 현장 중점관리 포인트');
        expect(sourceText).toContain('5. 공지사항');
        expect(sourceText).toContain('상등급 최종 확인 필요');
        expect(sourceText).toContain('이해 확인 및 행동 약속');
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
