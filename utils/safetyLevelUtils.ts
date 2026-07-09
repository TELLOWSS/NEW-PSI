export type SafetyLevel = '초급' | '중급' | '고급';
export type SafetyLevelDisplayAudience = 'manager' | 'public' | 'worker' | 'developer';

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

export const SAFETY_SIGNAL_COPY = {
    score: '위험인식 신호',
    scoreCompact: '인식신호',
    level: '지원단계',
    signal: '보호신호',
    stable: '안정',
    review: '확인',
    priority: '우선지원',
    explanation: '근로자를 평가하는 점수가 아니라, 수기 기록에서 드러난 위험 인식과 교육 환류 필요성을 정리한 보호 신호입니다.',
} as const;

const MANAGER_LEVEL_LABELS: Record<SafetyLevel, string> = {
    고급: SAFETY_SIGNAL_COPY.stable,
    중급: SAFETY_SIGNAL_COPY.review,
    초급: SAFETY_SIGNAL_COPY.priority,
};

const PUBLIC_LEVEL_LABELS: Record<SafetyLevel, string> = {
    고급: `${SAFETY_SIGNAL_COPY.stable}군`,
    중급: `${SAFETY_SIGNAL_COPY.review}군`,
    초급: `${SAFETY_SIGNAL_COPY.priority}군`,
};

const WORKER_LEVEL_LABELS: Record<SafetyLevel, string> = {
    고급: '오늘 내용 유지',
    중급: '다시 확인',
    초급: '먼저 설명',
};

export const getSafetyLevelDisplayLabel = (
    level: SafetyLevel,
    audience: SafetyLevelDisplayAudience = 'manager',
): string => {
    if (audience === 'developer') return level;
    if (audience === 'public') return PUBLIC_LEVEL_LABELS[level] ?? level;
    if (audience === 'worker') return WORKER_LEVEL_LABELS[level] ?? level;
    return MANAGER_LEVEL_LABELS[level] ?? level;
};

export const getSafetyLevelDisplayInitial = (level: SafetyLevel): string => {
    switch (level) {
        case '고급':
            return '안';
        case '중급':
            return '확';
        case '초급':
            return '우';
        default:
            return '-';
    }
};
