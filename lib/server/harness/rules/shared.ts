import { RULE_VERSION } from '../policyRegistry.js';
import type { HarnessGuardrailOverride, HarnessRiskDecision } from '../workflowTypes.js';

export function hasAny(text: string, keywords: string[]): boolean {
    return keywords.some((keyword) => text.includes(keyword));
}

export function buildOverride(
    ruleCode: string,
    severity: HarnessGuardrailOverride['severity'],
    message: string,
    originalDecision: HarnessRiskDecision,
    overriddenDecision: HarnessRiskDecision,
): HarnessGuardrailOverride {
    return { ruleCode, ruleVersion: RULE_VERSION, severity, message, originalDecision, overriddenDecision };
}
