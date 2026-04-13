import type { HarnessAnalyzerOutput } from './workflowTypes.js';

export function validateAnalyzerOutput(output: Partial<HarnessAnalyzerOutput>): { ok: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!output.summary || typeof output.summary !== 'string' || output.summary.trim().length === 0) {
        issues.push('분석 요약 문자열이 필요합니다.');
    }

    if (!Array.isArray(output.extractedHazards)) {
        issues.push('위험 항목 배열이 필요합니다.');
    } else {
        const invalidHazard = output.extractedHazards.find((h) => typeof h !== 'string' || !h.trim());
        if (invalidHazard !== undefined) {
            issues.push('위험 항목 배열 항목은 비어있지 않은 문자열이어야 합니다.');
        }
    }

    if (!Array.isArray(output.recommendedActions)) {
        issues.push('권장 조치 배열이 필요합니다.');
    } else {
        const invalidAction = output.recommendedActions.find((a) => typeof a !== 'string' || !a.trim());
        if (invalidAction !== undefined) {
            issues.push('권장 조치 배열 항목은 비어있지 않은 문자열이어야 합니다.');
        }
    }

    if (typeof output.confidence !== 'number') {
        issues.push('분석 신뢰도 수치가 필요합니다.');
    } else if (output.confidence < 0 || output.confidence > 1) {
        issues.push(`분석 신뢰도는 0~1 사이여야 합니다. (현재값: ${output.confidence.toFixed(3)})`);
    }

    return {
        ok: issues.length === 0,
        issues,
    };
}
