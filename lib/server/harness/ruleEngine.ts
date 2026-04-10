import { DEFAULT_HARNESS_POLICY } from './policyRegistry.js';
import type {
    HarnessAnalyzeRequest,
    HarnessContextSnapshot,
    HarnessEvaluationOutput,
    HarnessGuardrailOverride,
    HarnessInputValidationResult,
    HarnessRiskDecision,
} from './workflowTypes.js';
import { evaluateCraneRule, evaluateCraneWeatherRule } from './rules/craneRules.js';
import { evaluateFallProtectionRule } from './rules/fallProtectionRules.js';
import { evaluateScaffoldRule } from './rules/scaffoldRules.js';
import { buildOverride } from './rules/shared.js';
import { evaluateShoringWeatherRule } from './rules/shoringRules.js';

export function evaluateHarnessRules(options: {
    payload: HarnessAnalyzeRequest;
    validation: HarnessInputValidationResult;
    context: HarnessContextSnapshot;
    evaluation?: HarnessEvaluationOutput;
}): {
    decision: HarnessRiskDecision;
    overrides: HarnessGuardrailOverride[];
} {
    const { payload, validation, context, evaluation } = options;
    const text = validation.normalizedText;
    let decision: HarnessRiskDecision = 'SAFE_TO_PROCEED';
    const overrides: HarnessGuardrailOverride[] = [];

    if (validation.issues.some((issue) => issue.code === 'OCR_CONFIDENCE_CRITICAL' || issue.code === 'INPUT_TEXT_TOO_SHORT')) {
        decision = 'CRITICAL_STOP';
        overrides.push(buildOverride(
            'INPUT_QUALITY_BLOCK',
            'critical',
            'OCR 품질 또는 텍스트 분량이 기준 미달이어서 자동 판단을 중단합니다.',
            'SAFE_TO_PROCEED',
            decision,
        ));
    }

    const modularRuleEvaluators = [
        () => evaluateFallProtectionRule(text, decision),
        () => evaluateScaffoldRule(text, decision),
        () => evaluateCraneRule(text, decision),
        () => evaluateCraneWeatherRule(text, context, decision),
        () => evaluateShoringWeatherRule(text, context, decision),
    ];

    for (const evaluateRule of modularRuleEvaluators) {
        const override = evaluateRule();
        if (!override) continue;
        overrides.push(override);
        decision = override.overriddenDecision;
    }

    const normalizedJobType = String(payload.jobType || '').trim();
    if (normalizedJobType && DEFAULT_HARNESS_POLICY.highRiskJobTypes.includes(normalizedJobType) && decision === 'SAFE_TO_PROCEED') {
        const nextDecision: HarnessRiskDecision = evaluation?.requiresHumanApproval ? 'SUPPLEMENTARY_REVIEW' : 'SAFE_TO_PROCEED';
        if (nextDecision !== decision) {
            overrides.push(buildOverride(
                'HIGH_RISK_JOBTYPE_REVIEW',
                'warning',
                '고위험 공종이므로 인간 승인 전 추가 검토가 필요합니다.',
                decision,
                nextDecision,
            ));
            decision = nextDecision;
        }
    }

    return { decision, overrides };
}
