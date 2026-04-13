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
import { evaluateExcavationRainRule, evaluateExcavationRule } from './rules/excavationRules.js';
import { evaluateFallProtectionRule } from './rules/fallProtectionRules.js';
import { evaluateLiftingRule, evaluateLiftingWindRule } from './rules/liftingRules.js';
import { evaluateOpeningRule } from './rules/openingRules.js';
import { evaluateScaffoldRule } from './rules/scaffoldRules.js';
import { buildOverride } from './rules/shared.js';
import { evaluateShoringRule, evaluateShoringWeatherRule } from './rules/shoringRules.js';

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

    /**
     * 각 규칙은 "현재 최신 decision"을 받아야 하므로
     * 배열 생성 시 클로저로 캡처하지 않고, 호출 시점에 d를 인자로 전달한다.
     */
    const modularRuleEvaluators: Array<(d: HarnessRiskDecision) => HarnessGuardrailOverride | null> = [
        (d) => evaluateFallProtectionRule(text, d),
        (d) => evaluateOpeningRule(text, d),
        (d) => evaluateScaffoldRule(text, d),
        (d) => evaluateCraneRule(text, d),
        (d) => evaluateCraneWeatherRule(text, context, d),
        (d) => evaluateShoringRule(text, d),
        (d) => evaluateShoringWeatherRule(text, context, d),
        (d) => evaluateExcavationRule(text, d),
        (d) => evaluateExcavationRainRule(text, context, d),
        (d) => evaluateLiftingRule(text, d),
        (d) => evaluateLiftingWindRule(text, context, d),
    ];

    for (const evaluateRule of modularRuleEvaluators) {
        const override = evaluateRule(decision);
        if (!override) continue;
        overrides.push(override);
        decision = override.overriddenDecision;
    }

    const normalizedJobType = String(payload.jobType || '').trim();
    if (normalizedJobType && DEFAULT_HARNESS_POLICY.highRiskJobTypes.includes(normalizedJobType) && decision === 'SAFE_TO_PROCEED') {
        // 고위험 공종은 다른 룰 결과와 무관하게 최소 SUPPLEMENTARY_REVIEW 부여
        overrides.push(buildOverride(
            'HIGH_RISK_JOBTYPE_REVIEW',
            'warning',
            '고위험 공종이므로 인간 승인 전 추가 검토가 필요합니다.',
            decision,
            'SUPPLEMENTARY_REVIEW',
        ));
        decision = 'SUPPLEMENTARY_REVIEW';
    }

    return { decision, overrides };
}
