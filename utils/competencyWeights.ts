import type { AppSettings } from '../types';

export type CompetencyWeightKey =
    | 'psychological'
    | 'jobUnderstanding'
    | 'riskAssessmentUnderstanding'
    | 'proficiency'
    | 'improvementExecution'
    | 'repeatViolationPenalty';

export type CompetencyWeightSettings = NonNullable<AppSettings['competencyWeights']>;

export const DEFAULT_COMPETENCY_WEIGHTS: CompetencyWeightSettings = {
    psychological: 0.20,
    jobUnderstanding: 0.22,
    riskAssessmentUnderstanding: 0.22,
    proficiency: 0.18,
    improvementExecution: 0.18,
    repeatViolationPenalty: 1,
    version: 'v1.0.0',
};

export const COMPETENCY_WEIGHT_FIELDS: Array<{
    key: CompetencyWeightKey;
    code: 'W1' | 'W2' | 'W3' | 'W4' | 'W5' | 'W6';
    label: string;
    role: 'weighted-score' | 'penalty-multiplier';
    defaultValue: number;
    step: number;
    help: string;
}> = [
    {
        key: 'psychological',
        code: 'W1',
        label: '심리/작성 안정성',
        role: 'weighted-score',
        defaultValue: DEFAULT_COMPETENCY_WEIGHTS.psychological,
        step: 0.01,
        help: 'OCR 신뢰도, 답변 압박 신호, 작성 누락/배치 문제를 반영합니다.',
    },
    {
        key: 'jobUnderstanding',
        code: 'W2',
        label: '작업 이해도',
        role: 'weighted-score',
        defaultValue: DEFAULT_COMPETENCY_WEIGHTS.jobUnderstanding,
        step: 0.01,
        help: '본인 공종, 위치, 세부작업을 구체적으로 이해했는지 봅니다.',
    },
    {
        key: 'riskAssessmentUnderstanding',
        code: 'W3',
        label: '위험성평가 이해도',
        role: 'weighted-score',
        defaultValue: DEFAULT_COMPETENCY_WEIGHTS.riskAssessmentUnderstanding,
        step: 0.01,
        help: '위험요인, 위험수준, 사고 가능 이유를 연결해 적었는지 봅니다.',
    },
    {
        key: 'proficiency',
        code: 'W4',
        label: '현장 숙련도',
        role: 'weighted-score',
        defaultValue: DEFAULT_COMPETENCY_WEIGHTS.proficiency,
        step: 0.01,
        help: '검증 가능한 실무 행동과 현장 경험 기반 판단을 반영합니다.',
    },
    {
        key: 'improvementExecution',
        code: 'W5',
        label: '개선 이행도',
        role: 'weighted-score',
        defaultValue: DEFAULT_COMPETENCY_WEIGHTS.improvementExecution,
        step: 0.01,
        help: '작업 전·중·후 어떤 행동을 실행할지 구체적으로 적었는지 봅니다.',
    },
    {
        key: 'repeatViolationPenalty',
        code: 'W6',
        label: '반복지적 감점 배율',
        role: 'penalty-multiplier',
        defaultValue: DEFAULT_COMPETENCY_WEIGHTS.repeatViolationPenalty,
        step: 0.1,
        help: '다음 달 추적에서 동일 위험 재발이나 약속 행동 미이행이 확인될 때 감점을 얼마나 강하게 적용할지 정합니다. W1~W5 합계에는 포함하지 않습니다.',
    },
];

export const COMPETENCY_WEIGHT_PRESETS: Array<{
    id: string;
    label: string;
    description: string;
    weights: Pick<CompetencyWeightSettings,
        'psychological'
        | 'jobUnderstanding'
        | 'riskAssessmentUnderstanding'
        | 'proficiency'
        | 'improvementExecution'
        | 'repeatViolationPenalty'
    >;
}> = [
    {
        id: 'balanced',
        label: '기본 균형형',
        description: '현장·교육·이행을 균형 있게 보는 기본 상품 기준입니다.',
        weights: {
            psychological: 0.20,
            jobUnderstanding: 0.22,
            riskAssessmentUnderstanding: 0.22,
            proficiency: 0.18,
            improvementExecution: 0.18,
            repeatViolationPenalty: 1,
        },
    },
    {
        id: 'risk-understanding',
        label: '위험인지 강화형',
        description: '위험요인·위험수준 해석을 회사 규칙상 더 중시할 때 씁니다.',
        weights: {
            psychological: 0.16,
            jobUnderstanding: 0.22,
            riskAssessmentUnderstanding: 0.30,
            proficiency: 0.16,
            improvementExecution: 0.16,
            repeatViolationPenalty: 1.1,
        },
    },
    {
        id: 'execution',
        label: '개선이행 강화형',
        description: '교육 후 행동 변화와 재발 방지 이행을 가장 중시할 때 씁니다.',
        weights: {
            psychological: 0.16,
            jobUnderstanding: 0.18,
            riskAssessmentUnderstanding: 0.20,
            proficiency: 0.18,
            improvementExecution: 0.28,
            repeatViolationPenalty: 1.2,
        },
    },
    {
        id: 'proficiency',
        label: '숙련/리더십 강화형',
        description: '팀장·신호수·숙련자 판단 품질을 더 크게 볼 때 씁니다.',
        weights: {
            psychological: 0.16,
            jobUnderstanding: 0.20,
            riskAssessmentUnderstanding: 0.20,
            proficiency: 0.28,
            improvementExecution: 0.16,
            repeatViolationPenalty: 1,
        },
    },
];

const toFiniteNumber = (value: unknown, fallback: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

export const sanitizeCompetencyWeights = (
    source?: Partial<CompetencyWeightSettings> | null,
): CompetencyWeightSettings => {
    const base = source || {};

    return {
        psychological: toFiniteNumber(base.psychological, DEFAULT_COMPETENCY_WEIGHTS.psychological),
        jobUnderstanding: toFiniteNumber(base.jobUnderstanding, DEFAULT_COMPETENCY_WEIGHTS.jobUnderstanding),
        riskAssessmentUnderstanding: toFiniteNumber(base.riskAssessmentUnderstanding, DEFAULT_COMPETENCY_WEIGHTS.riskAssessmentUnderstanding),
        proficiency: toFiniteNumber(base.proficiency, DEFAULT_COMPETENCY_WEIGHTS.proficiency),
        improvementExecution: toFiniteNumber(base.improvementExecution, DEFAULT_COMPETENCY_WEIGHTS.improvementExecution),
        repeatViolationPenalty: toFiniteNumber(base.repeatViolationPenalty, DEFAULT_COMPETENCY_WEIGHTS.repeatViolationPenalty),
        version: String(base.version || DEFAULT_COMPETENCY_WEIGHTS.version).trim() || DEFAULT_COMPETENCY_WEIGHTS.version,
    };
};

export const getScoreWeightSum = (weights?: Partial<CompetencyWeightSettings> | null): number => {
    const normalized = sanitizeCompetencyWeights(weights);
    return COMPETENCY_WEIGHT_FIELDS
        .filter((field) => field.role === 'weighted-score')
        .reduce((sum, field) => sum + Number(normalized[field.key] || 0), 0);
};
