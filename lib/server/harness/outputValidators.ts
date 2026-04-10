import type { HarnessAnalyzerOutput } from './workflowTypes.js';

export function validateAnalyzerOutput(output: Partial<HarnessAnalyzerOutput>): { ok: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!output.summary || typeof output.summary !== 'string') {
        issues.push('분석 요약 문자열이 필요합니다.');
    }

    if (!Array.isArray(output.extractedHazards)) {
        issues.push('위험 항목 배열이 필요합니다.');
    }

    if (!Array.isArray(output.recommendedActions)) {
        issues.push('권장 조치 배열이 필요합니다.');
    }

    if (typeof output.confidence !== 'number') {
        issues.push('분석 신뢰도 수치가 필요합니다.');
    }

    return {
        ok: issues.length === 0,
        issues,
    };
}
