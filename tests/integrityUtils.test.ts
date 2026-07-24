import { describe, expect, it } from 'vitest';
import {
    calculateIntegrityScore,
    formatIntegrityResult,
    type ViolationRecord,
} from '../utils/integrityUtils';

describe('integrityUtils', () => {
    it('returns a perfect result for a specific statement without violation history', () => {
        const result = calculateIntegrityScore('저는 안전고리를 착용하겠습니다.', []);

        expect(result).toEqual({
            score: 100,
            warning: null,
            inconsistencies: [],
            confidence: 1,
        });
    });

    it('flags repeated high-severity fall inconsistencies', () => {
        const violations: ViolationRecord[] = [
            { type: 'fall', date: '2024-01-15', description: '안전고리 미착용', severity: 'high' },
            { type: 'fall', date: '2024-02-20', description: '추락 방지 조치 미실시', severity: 'high' },
        ];

        const result = calculateIntegrityScore(
            '저는 항상 안전고리를 착용하고 있습니다. 추락 위험을 잘 알고 있습니다.',
            violations,
        );

        expect(result.score).toBe(50);
        expect(result.confidence).toBe(0.5);
        expect(result.warning).toContain('낮은 무결성 점수');
        expect(result.inconsistencies).toHaveLength(3);
    });

    it('deducts points for a generic template even without violation history', () => {
        const result = calculateIntegrityScore(
            '안전수칙 준수하겠습니다. 안전제일. 조심하겠습니다.',
            [],
        );

        expect(result.score).toBe(95);
        expect(result.inconsistencies).toContain('일반적인 답변 - 구체성 부족');
    });

    it('returns an analyzable error result for empty text', () => {
        const result = calculateIntegrityScore('', []);

        expect(result.score).toBe(0);
        expect(result.confidence).toBe(0);
        expect(formatIntegrityResult(result)).toContain('빈 텍스트 - 분석 불가');
    });

    it('shows an attention warning at the 85-point boundary', () => {
        const result = calculateIntegrityScore('감전 방지를 위해 접지를 확인하겠습니다.', [
            { type: 'electrocution', date: '2024-04-05', description: '절연 장갑 미착용', severity: 'high' },
        ]);

        expect(result.score).toBe(85);
        expect(result.warning).toContain('주의 필요');
        expect(formatIntegrityResult(result)).toContain('신뢰도: 60%');
    });
});
