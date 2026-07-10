import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabaseClient', () => ({
    supabase: {},
}));

import { enforceBreakdownDrivenScore } from '../services/geminiService';

describe('5문항·6대 지표 보정 로직', () => {
    it('AI가 scoreBreakdown을 비워 보내도 Q1~Q5 근거로 6대 지표를 복원한다', () => {
        const result = enforceBreakdownDrivenScore(
            70,
            '중급',
            [],
            {},
            [
                { questionNumber: 'Q1', koreanTranslation: '거푸집 설치 및 보, 기둥 구조물 위치' },
                { questionNumber: 'Q2', koreanTranslation: '고소 작업 시 안전벨트 미착용 및 낙하물 위험' },
                { questionNumber: 'Q3', koreanTranslation: '고소 작업 시 위험도가 매우 높음' },
                { questionNumber: 'Q4', koreanTranslation: '작업 전과 작업 중에 안전을 점검할 것입니다.' },
                { questionNumber: 'Q5', koreanTranslation: '작업 전에 안전고리 및 안전벨트를 점검하고 난간을 확인할 것입니다.' },
            ],
            70,
        );

        expect(result.safetyScore).toBe(70);
        expect(result.safetyLevel).toBe('중급');
        expect(result.scoreBreakdown).toBeDefined();
        expect(result.scoreBreakdown?.jobUnderstanding).toBeGreaterThan(0);
        expect(result.scoreBreakdown?.riskAssessmentUnderstanding).toBeGreaterThan(0);
        expect(result.scoreReasoning.join(' ')).toMatch(/6대 지표.*누락|복원/);
    });

    it('Q4 감소대책과 Q5 실천행동이 거의 같으면 현재 기록의 개선이행도에서 감점한다', () => {
        const result = enforceBreakdownDrivenScore(
            82,
            '고급',
            [],
            {
                psychological: 8,
                jobUnderstanding: 18,
                riskAssessmentUnderstanding: 18,
                proficiency: 24,
                improvementExecution: 16,
                repeatViolationPenalty: 0,
            },
            [
                { questionNumber: 'Q1', koreanTranslation: '철골 작업 중 고소부 자재 설치' },
                { questionNumber: 'Q2', koreanTranslation: '고소 작업 중 추락 위험' },
                { questionNumber: 'Q3', koreanTranslation: '위험 수준은 높음' },
                { questionNumber: 'Q4', koreanTranslation: '작업 전 안전벨트 체결 상태를 확인하고 난간을 점검한다' },
                { questionNumber: 'Q5', koreanTranslation: '작업 전 안전벨트 체결 상태를 확인하고 난간을 점검한다' },
            ],
            82,
        );

        expect(result.scoreBreakdown?.repeatViolationPenalty).toBe(0);
        expect(result.scoreBreakdown?.improvementExecution).toBeLessThan(16);
        expect(result.safetyScore).toBeLessThan(84);
        expect(result.scoreReasoning.join(' ')).toMatch(/Q4.*Q5.*개선이행도/);
    });
});
