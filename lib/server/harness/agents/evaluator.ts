import type {
    HarnessAnalyzerOutput,
    HarnessEvaluationOutput,
    HarnessInputValidationResult,
} from '../workflowTypes.js';

export function buildDeterministicEvaluatorOutput(options: {
    analyzer: HarnessAnalyzerOutput;
    validation: HarnessInputValidationResult;
}): HarnessEvaluationOutput {
    const flags: string[] = [];

    if (!options.validation.ok) {
        flags.push('INPUT_VALIDATION_FAILED');
    }

    if (options.analyzer.extractedHazards.length > 0 && options.analyzer.recommendedActions.length === 0) {
        flags.push('ACTION_GUIDANCE_MISSING');
    }

    if (options.analyzer.confidence < 0.85) {
        flags.push('LOW_MODEL_CONFIDENCE');
    }

    // 텍스트 분량이 너무 짧으면 근거 불충분 판정
    if (options.validation.textLength < 80) {
        flags.push('INSUFFICIENT_EVIDENCE_VOLUME');
    }

    // 고위험 hazard 2건 이상이면 반드시 인간 승인 필요
    const hazardCount = options.analyzer.extractedHazards.length;
    const requiresHumanApproval =
        flags.length > 0 ||
        hazardCount > 0;

    // 증거 충분도: 기본 confidence → hazard 건당 -8점 → flag 건당 -10점
    const evidenceSufficiency = Math.max(
        0,
        Math.min(
            100,
            Math.round(options.analyzer.confidence * 100) - hazardCount * 8 - flags.length * 10,
        ),
    );

    return {
        evidenceSufficiency,
        requiresHumanApproval,
        flags,
    };
}
