import type { SixMetricAverages } from './dashboardDataTransformer';

export const POSITIVE_METRIC_KEYS = ['psychological', 'jobUnderstanding', 'riskAssessmentUnderstanding', 'proficiency', 'improvementExecution'] as const;
export const SIX_METRIC_KEYS = [...POSITIVE_METRIC_KEYS, 'repeatViolationPenalty'] as const;
export const SIX_METRIC_LABELS: Record<keyof SixMetricAverages, string> = {
    psychological: '응답 충실도', jobUnderstanding: '업무이해도', riskAssessmentUnderstanding: '위험성평가',
    proficiency: '숙련도', improvementExecution: '개선이행도', repeatViolationPenalty: '반복위반 감점',
};
export const METRIC_MAX: Record<keyof SixMetricAverages, number> = {
    psychological: 10, jobUnderstanding: 20, riskAssessmentUnderstanding: 20,
    proficiency: 30, improvementExecution: 20, repeatViolationPenalty: 30,
};

export function metricValue(key: keyof SixMetricAverages, value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const score = key === 'repeatViolationPenalty' ? Math.abs(value) : value;
    return score >= 0 && score <= METRIC_MAX[key] ? score : null;
}

export function buildRadarMetrics(target: SixMetricAverages, site: SixMetricAverages) {
    return POSITIVE_METRIC_KEYS.map(key => {
        const targetRaw = metricValue(key, target[key]);
        const siteRaw = metricValue(key, site[key]);
        return {
            key, metric: SIX_METRIC_LABELS[key], max: METRIC_MAX[key], targetRaw, siteRaw,
            타겟: targetRaw === null ? null : Math.round(targetRaw / METRIC_MAX[key] * 100),
            현장평균: siteRaw === null ? null : Math.round(siteRaw / METRIC_MAX[key] * 100),
        };
    });
}
