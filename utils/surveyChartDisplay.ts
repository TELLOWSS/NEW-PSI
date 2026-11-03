/**
 * Presentation-only helpers for manager/worker survey charts.
 * Absent data must remain absent; a null/no-response month is not a zero-point score.
 * These functions do not change risk grading or automatic field safety decisions.
 */
export const averageAvailableSurveyScores = (values: ReadonlyArray<unknown>): number | null => {
    const comparable = values.filter(
        (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );
    if (!comparable.length) return null;
    return Math.round(
        (comparable.reduce((sum, value) => sum + value, 0) / comparable.length) * 10,
    ) / 10;
};

export const getRiskGapChartHeight = (tradeCount: number): number =>
    Math.max(260, Math.max(0, Math.floor(Number.isFinite(tradeCount) ? tradeCount : 0)) * 38 + 70);
