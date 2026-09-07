import { describe, expect, it } from 'vitest';
import {
    evaluateOcrVerificationCompleteness,
    evaluateOcrVerificationQuality,
} from '../utils/ocrVerificationLanguageUtils';

const buildAnswers = (missingNativeAt?: number) => Array.from({ length: 5 }, (_, index) => ({
    questionNumber: String(index + 1),
    answerText: `원문 ${index + 1}`,
    koreanTranslation: `한국어 해석 ${index + 1}`,
    nativeTranslation: missingNativeAt === index + 1 ? '' : `Bản dịch ${index + 1}`,
}));

describe('OCR native-language verification', () => {
    it('requires a one-to-one native translation for every foreign worker Q1-Q5 answer', () => {
        const result = evaluateOcrVerificationCompleteness({
            nationality: '베트남',
            language: 'vi',
            jobField: '철근',
            weakAreas: ['추락 위험'],
            aiInsights: '철근 작업 전 안전대를 확인하세요.',
            aiInsights_native: 'Kiểm tra dây an toàn trước khi làm việc.',
            fullText: 'NEW-PSI Q1 Q2 Q3 Q4 Q5',
            koreanTranslation: '위험성평가 답변',
            handwrittenAnswers: buildAnswers(4),
        } as any);

        expect(result.isComplete).toBe(false);
        expect(result.nativeTranslatedAnswerCount).toBe(4);
        expect(result.issues).toContain('베트남어 문항 해석 누락 1건');
    });

    it('accepts complete one-to-one native translations for Q1-Q5', () => {
        const result = evaluateOcrVerificationCompleteness({
            nationality: '베트남',
            language: 'vi',
            jobField: '철근',
            weakAreas: ['추락 위험'],
            aiInsights: '철근 작업 전 안전대를 확인하세요.',
            aiInsights_native: 'Kiểm tra dây an toàn trước khi làm việc.',
            fullText: 'NEW-PSI Q1 Q2 Q3 Q4 Q5',
            koreanTranslation: '위험성평가 답변',
            handwrittenAnswers: buildAnswers(),
        } as any);

        expect(result.isComplete).toBe(true);
        expect(result.answerCount).toBe(5);
        expect(result.nativeTranslatedAnswerCount).toBe(5);
    });

    it('does not mistake normal Vietnamese Latin script for English contamination', () => {
        const result = evaluateOcrVerificationQuality({
            nationality: '베트남',
            language: 'vi',
            jobField: '철근',
            aiInsights: '철근 작업 전 안전대를 확인하세요.',
            aiInsights_native: 'Trước khi làm việc, hãy kiểm tra dây an toàn.',
            handwrittenAnswers: buildAnswers(),
            safetyScore: 70,
            strengths_native: [],
            weakAreas_native: [],
            improvement_native: '',
            suggestions_native: [],
            score_reason_native: '',
            actionable_coaching_native: '',
        } as any);

        expect(result.hasEnglishInNative).toBe(false);
    });
});
