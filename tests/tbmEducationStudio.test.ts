import { describe, expect, it } from 'vitest';
import { buildTbmEducationDraft, estimateEducationTokens } from '../utils/tbmEducationStudio';

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

        expect(draft.title).toContain('2026-07');
        expect(draft.risks[0].risk).toBe('추락');
        expect(draft.risks[0].evidenceLabels).toContain('다음 달 작업계획');
        expect(draft.risks).toHaveLength(3);
        expect(draft.coreMessage).toContain('작업 시작 전');
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
});
