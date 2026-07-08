import { describe, expect, it } from 'vitest';
import { isGenericSlogan, calibrateScoreBreakdown, enforceBreakdownDrivenScore } from '../services/geminiService';

describe('OCR Score Calibration - isGenericSlogan', () => {
    it('should correctly identify generic slogans', () => {
        expect(isGenericSlogan('안전제일')).toBe(true);
        expect(isGenericSlogan('조심하겠습니다')).toBe(true);
        expect(isGenericSlogan('주의하겠습니다')).toBe(true);
        expect(isGenericSlogan('열심히 하겠습니다')).toBe(true);
        expect(isGenericSlogan('안전 수칙 준수')).toBe(true);
        expect(isGenericSlogan('조심')).toBe(true);
        expect(isGenericSlogan('')).toBe(true);
    });

    it('should not mark specific safety actions as slogans', () => {
        expect(isGenericSlogan('비계 해체 시 안전 벨트 생명줄에 확실하게 체결 후 작업')).toBe(false);
        expect(isGenericSlogan('1.5미터 고소 작업 중 안전비계 수평 확인')).toBe(false);
    });
});

describe('OCR Score Calibration - calibrateScoreBreakdown', () => {
    const baselineBreakdown = {
        psychological: 10,
        jobUnderstanding: 20,
        riskAssessmentUnderstanding: 20,
        proficiency: 30,
        improvementExecution: 20,
        repeatViolationPenalty: 0,
    };

    it('should cap and penalize empty or sloppy/slogan-only responses to "초급"', () => {
        const handwrittenAnswers = [
            { questionNumber: '1', answerText: '안전제일', koreanTranslation: '안전제일' },
            { questionNumber: '2', answerText: '조심하겠습니다', koreanTranslation: '조심하겠습니다' },
            { questionNumber: '3', answerText: '조심하겠습니다', koreanTranslation: '조심하겠습니다' },
            { questionNumber: '4', answerText: '안전제일', koreanTranslation: '안전제일' },
            { questionNumber: '5', answerText: '확인하겠습니다', koreanTranslation: '확인하겠습니다' },
        ];

        const { breakdown, reasoning } = calibrateScoreBreakdown(baselineBreakdown, handwrittenAnswers);

        // All should be capped to <= 5, and repetition penalty applied
        expect(breakdown.psychological).toBeLessThanOrEqual(5);
        expect(breakdown.jobUnderstanding).toBeLessThanOrEqual(5);
        expect(breakdown.riskAssessmentUnderstanding).toBeLessThanOrEqual(8);
        expect(breakdown.proficiency).toBeLessThanOrEqual(5);
        expect(breakdown.improvementExecution).toBeLessThanOrEqual(5);
        expect(breakdown.repeatViolationPenalty).toBeGreaterThan(0);
        
        // Confirm reasoning documents the penalties
        expect(reasoning.some(r => r.includes('감점') || r.includes('패널티'))).toBe(true);
    });

    it('should evaluate detailed answers with specific numbers as "고급"', () => {
        const handwrittenAnswers = [
            { questionNumber: '1', answerText: '거푸집 해체 및 유로폼 인양 작업', koreanTranslation: '거푸집 해체 및 유로폼 인양 작업' },
            { questionNumber: '2', answerText: '유로폼 인출 시 낙하 및 맞음 위험', koreanTranslation: '유로폼 인출 시 낙하 및 맞음 위험' },
            { questionNumber: '3', answerText: '위험수준 상: 낙하 시 충격량으로 인한 사망 위험', koreanTranslation: '위험수준 상: 낙하 시 충격량으로 인한 사망 위험' },
            { questionNumber: '4', answerText: '작업 구역 10m 통제선 설정하고 신호수 배치 후 2줄걸이 체결 확인', koreanTranslation: '작업 구역 10m 통제선 설정하고 신호수 배치 후 2줄걸이 체결 확인' },
            { questionNumber: '5', answerText: '작업 개시 전 상부 고리 체결을 완료하고 신호수 지시에 움직이겠음', koreanTranslation: '작업 개시 전 상부 고리 체결을 완료하고 신호수 지시에 움직이겠음' },
        ];

        const { breakdown, reasoning } = calibrateScoreBreakdown(baselineBreakdown, handwrittenAnswers);

        expect(breakdown.psychological).toBe(10);
        expect(breakdown.jobUnderstanding).toBe(20);
        expect(breakdown.riskAssessmentUnderstanding).toBe(20);
        expect(breakdown.proficiency).toBeGreaterThanOrEqual(24); // Measurable "10m", "2줄걸이"
        expect(breakdown.improvementExecution).toBeGreaterThanOrEqual(14); // Time "전" and who/what included
        expect(breakdown.repeatViolationPenalty).toBe(0);
        expect(reasoning.length).toBe(0); // No penalties
    });

    it('should recognize Q-prefixed question numbers from OCR answers', () => {
        const handwrittenAnswers = [
            { questionNumber: 'Q1', answerText: '不整下述过程中', koreanTranslation: '정리, 미장, 보수 작업 중 불규칙한 과정' },
            { questionNumber: 'Q2', answerText: '踩踏不坚, 容易滑倒', koreanTranslation: '불안정한 곳을 밟아 미끄러져 넘어지기 쉬움' },
            { questionNumber: 'Q3', answerText: '凳子离地面不足一米高, 危险程度比较低', koreanTranslation: '의자가 지면에서 1미터 미만으로 높지 않아 위험 정도가 비교적 낮음' },
            { questionNumber: 'Q4', answerText: '作业前确认凳子是否放置牢固', koreanTranslation: '작업 전 의자가 단단히 놓여 있는지 확인' },
            { questionNumber: 'Q5', answerText: '要确认脚踏板站稳, 结实', koreanTranslation: '발판이 안정적이고 튼튼한지 확인해야 함' },
        ];

        const { breakdown, reasoning } = calibrateScoreBreakdown(baselineBreakdown, handwrittenAnswers);

        expect(breakdown.psychological).toBeGreaterThan(0);
        expect(breakdown.jobUnderstanding).toBeGreaterThan(0);
        expect(breakdown.riskAssessmentUnderstanding).toBeGreaterThan(0);
        expect(breakdown.proficiency).toBeGreaterThan(0);
        expect(breakdown.improvementExecution).toBeGreaterThan(0);
        expect(reasoning.some((item) => item.includes('미작성'))).toBe(false);
    });
});

describe('OCR Score Calibration - enforceBreakdownDrivenScore integration', () => {
    it('should enforce grade consistency and compile final safety score/level correctly', () => {
        const rawScore = 80;
        const rawLevel = '고급';
        const rawReasoning = ['AI 기본 판정'];
        const rawBreakdown = {
            psychological: 10,
            jobUnderstanding: 20,
            riskAssessmentUnderstanding: 20,
            proficiency: 30,
            improvementExecution: 20,
            repeatViolationPenalty: 0,
        };
        const handwrittenAnswers = [
            { questionNumber: '1', answerText: '안전', koreanTranslation: '안전' },
            { questionNumber: '2', answerText: '조심', koreanTranslation: '조심' },
            { questionNumber: '3', answerText: '주의', koreanTranslation: '주의' },
            { questionNumber: '4', answerText: '안전제일', koreanTranslation: '안전제일' },
            { questionNumber: '5', answerText: '수칙준수', koreanTranslation: '수칙준수' },
        ];

        const result = enforceBreakdownDrivenScore(
            rawScore,
            rawLevel,
            rawReasoning,
            rawBreakdown,
            handwrittenAnswers,
            0
        );

        // Since answers are all slogans, score should be pulled down to "초급" (< 60)
        expect(result.safetyScore).toBeLessThan(60);
        expect(result.safetyLevel).toBe('초급');
        expect(result.scoreReasoning.some(r => r.includes('감점') || r.includes('보정'))).toBe(true);
    });
});
