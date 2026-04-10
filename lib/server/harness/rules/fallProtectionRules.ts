import { HIGH_RISK_KEYWORD_GROUPS } from '../policyRegistry.js';
import type { HarnessGuardrailOverride, HarnessRiskDecision } from '../workflowTypes.js';
import { buildOverride, hasAny } from './shared.js';

export function evaluateFallProtectionRule(text: string, currentDecision: HarnessRiskDecision): HarnessGuardrailOverride | null {
    const hasFallContext = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.fall);
    const hasFallProtection = hasAny(text, ['안전대', '안전고리', '안전난간', '구명줄']);

    if (!hasFallContext || hasFallProtection) {
        return null;
    }

    return buildOverride(
        'FALL_PROTECTION_MISSING',
        'critical',
        '추락 관련 작업 문맥이 있으나 추락 방호 조치 키워드가 부족합니다.',
        currentDecision,
        'CRITICAL_STOP',
    );
}
