import { HIGH_RISK_KEYWORD_GROUPS } from '../policyRegistry.js';
import type { HarnessGuardrailOverride, HarnessRiskDecision } from '../workflowTypes.js';
import { buildOverride, hasAny } from './shared.js';

export function evaluateScaffoldRule(text: string, currentDecision: HarnessRiskDecision): HarnessGuardrailOverride | null {
    const hasScaffold = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.scaffold);
    const hasScaffoldProtection = hasAny(text, ['안전난간', '아웃트리거', '작업발판', '안전대']);

    if (!hasScaffold || hasScaffoldProtection || currentDecision === 'CRITICAL_STOP') {
        return null;
    }

    return buildOverride(
        'SCAFFOLD_PROTECTION_MISSING',
        'high',
        '비계 관련 문맥이 있으나 필수 보호 조치 언급이 부족합니다.',
        currentDecision,
        'IMMEDIATE_ATTENTION',
    );
}
