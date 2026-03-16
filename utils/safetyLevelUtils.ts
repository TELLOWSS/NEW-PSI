export type SafetyLevel = '초급' | '중급' | '고급';

export const getSafetyLevelFromScore = (score: number): SafetyLevel => {
    const normalizedScore = Number.isFinite(score) ? score : 0;

    if (normalizedScore >= 90) return '고급';
    if (normalizedScore >= 70) return '중급';
    return '초급';
};