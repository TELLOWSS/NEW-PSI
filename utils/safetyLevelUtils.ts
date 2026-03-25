export type SafetyLevel = '초급' | '중급' | '고급';

type SafetyLevelThresholds = {
    advancedMin: number;
    intermediateMin: number;
};

const DEFAULT_THRESHOLDS: SafetyLevelThresholds = {
    advancedMin: 80,
    intermediateMin: 60,
};

const clampToRange = (value: number, min: number, max: number): number => {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.round(value)));
};

const normalizeThresholds = (input?: Partial<SafetyLevelThresholds>): SafetyLevelThresholds => {
    const advancedMin = clampToRange(Number(input?.advancedMin ?? DEFAULT_THRESHOLDS.advancedMin), 0, 100);
    const intermediateMinRaw = clampToRange(Number(input?.intermediateMin ?? DEFAULT_THRESHOLDS.intermediateMin), 0, 100);
    const intermediateMin = Math.min(intermediateMinRaw, advancedMin);

    // Legacy fallback: 과거 기본값(90/70)을 최신 표준(80/60)으로 자동 전환
    if (advancedMin === 90 && intermediateMin === 70) {
        return {
            advancedMin: DEFAULT_THRESHOLDS.advancedMin,
            intermediateMin: DEFAULT_THRESHOLDS.intermediateMin,
        };
    }

    return {
        advancedMin,
        intermediateMin,
    };
};

export const getSafetyLevelThresholds = (): SafetyLevelThresholds => {
    try {
        if (typeof localStorage === 'undefined') return DEFAULT_THRESHOLDS;
        const raw = localStorage.getItem('psi_app_settings');
        if (!raw) return DEFAULT_THRESHOLDS;
        const parsed = JSON.parse(raw) as { safetyLevelThresholds?: Partial<SafetyLevelThresholds> };
        return normalizeThresholds(parsed.safetyLevelThresholds);
    } catch {
        return DEFAULT_THRESHOLDS;
    }
};

export const getSafetyLevelFromScore = (score: number): SafetyLevel => {
    const normalizedScore = Number.isFinite(score) ? score : 0;
    const thresholds = getSafetyLevelThresholds();

    if (normalizedScore >= thresholds.advancedMin) return '고급';
    if (normalizedScore >= thresholds.intermediateMin) return '중급';
    return '초급';
};