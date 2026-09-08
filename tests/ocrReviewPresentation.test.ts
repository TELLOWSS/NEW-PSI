import { describe, expect, it } from 'vitest';
import { isOcrReviewOnlyRecord, getOcrReviewGuide } from '../utils/ocrReviewPresentation';
import { evaluateOcrVerificationQuality } from '../utils/ocrVerificationLanguageUtils';
import type { WorkerRecord } from '../types';

describe('extracted records awaiting review', () => {
    const record = { ocrErrorType: 'QUALITY', ocrFailureCode: 'UNKNOWN', workflowState: 'manual_review_required', fullText: '위험성평가 Q1 철거작업', ocrErrorMessage: '중국어 모국어 안내 오류 1건' } as WorkerRecord;
    it('identifies a completed extraction with language checks without prescribing a reshoot', () => {
        expect(isOcrReviewOnlyRecord(record)).toBe(true);
        expect(getOcrReviewGuide(record)).toContain('중국어 모국어 안내 오류 1건');
        expect(getOcrReviewGuide(record)).toContain('재촬영할 필요는 없습니다');
    });
    it('keeps true network and empty extraction failures out of review-only status', () => {
        expect(isOcrReviewOnlyRecord({ ...record, ocrFailureCode: 'NETWORK' })).toBe(false);
        expect(isOcrReviewOnlyRecord({ ...record, fullText: '' })).toBe(false);
    });
    it('names the exact field and rule behind a Chinese language warning', () => {
        const audit = evaluateOcrVerificationQuality({ nationality: '중국', language: 'zh', aiInsights_native: '检查安全带', actionable_coaching_native: '安全带를 확인하세요', handwrittenAnswers: [] } as unknown as WorkerRecord);
        expect(audit.nativeReadabilityDetails).toContainEqual(expect.objectContaining({ field: '행동 안내', code: 'hangul-mixed', excerpt: '安全带를 확인하세요' }));
    });
});
