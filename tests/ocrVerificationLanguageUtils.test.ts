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

    it('accepts handwritten Form 1 (1안) for Korean worker with 3 table entries and Korean aiInsights', () => {
        const result = evaluateOcrVerificationCompleteness({
            nationality: '대한민국',
            language: 'ko',
            jobField: '형틀',
            weakAreas: ['추락 위험'],
            aiInsights: '개구부 주변 안전대 체결 후 작업하세요.',
            aiInsights_native: '',
            fullText: '위험성평가 기록지 1. 거푸집 해체 작업 안전 조치 필요',
            koreanTranslation: '위험성평가 기록지 1. 거푸집 해체 작업',
            handwrittenAnswers: [
                { questionNumber: '1', answerText: '거푸집 해체', koreanTranslation: '거푸집 해체', nativeTranslation: '' },
                { questionNumber: '2', answerText: '추락 위험', koreanTranslation: '추락 위험', nativeTranslation: '' },
                { questionNumber: '4', answerText: '안전대 체결', koreanTranslation: '안전대 체결', nativeTranslation: '' },
            ],
        } as any);

        expect(result.hasQuestionnairePattern).toBe(false);
        expect(result.isComplete).toBe(true);
    });

    it('does not flag numbered list items on a confirmed Form 1 legacy sheet as missing Q1-Q5 answers', () => {
        const result = evaluateOcrVerificationCompleteness({
            nationality: '대한민국',
            language: 'ko',
            jobField: '형틀',
            weakAreas: ['추락 위험'],
            aiInsights: '거푸집 해체 전 하부 통제 후 작업하세요.',
            aiInsights_native: '',
            fullText: '위험성평가 기록지 1. 작업내용 거푸집 해체 2. 위험요인 낙하 3. 위험등급 중 4. 감소대책 하부통제 5. 서명 확인',
            koreanTranslation: '위험성평가 기록지 1. 작업내용 2. 위험요인 3. 위험등급 4. 감소대책 5. 서명',
            ocrDocumentValidation: {
                documentType: 'psi-risk-assessment',
                formVariant: 'form-1-legacy',
                isPsiForm: true,
                reason: '1안 수기 양식',
                detectedMarkers: ['위험성평가(1안)'],
            },
            handwrittenAnswers: [
                { questionNumber: '1', answerText: '거푸집 해체', koreanTranslation: '거푸집 해체', nativeTranslation: '' },
                { questionNumber: '2', answerText: '낙하 위험', koreanTranslation: '낙하 위험', nativeTranslation: '' },
                { questionNumber: '4', answerText: '하부 통제 후 작업', koreanTranslation: '하부 통제 후 작업', nativeTranslation: '' },
            ],
        });

        expect(result.hasQuestionnairePattern).toBe(false);
        expect(result.isComplete).toBe(true);
    });
});
