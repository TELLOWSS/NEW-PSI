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

    return {
        evidenceSufficiency: Math.max(0, Math.min(100, Math.round((options.analyzer.confidence * 100) - (flags.length * 10)))),
        requiresHumanApproval: flags.length > 0 || options.analyzer.extractedHazards.length > 0,
        flags,
    };
}
