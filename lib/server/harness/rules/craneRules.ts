import { HIGH_RISK_KEYWORD_GROUPS } from '../policyRegistry.js';
import type { HarnessContextSnapshot, HarnessGuardrailOverride, HarnessRiskDecision } from '../workflowTypes.js';
import { buildOverride, hasAny } from './shared.js';

export function evaluateCraneRule(text: string, currentDecision: HarnessRiskDecision): HarnessGuardrailOverride | null {
    const hasCrane = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.crane);
    const hasAccessControl = hasAny(text, ['작업반경', '통제', '신호수', '유도자']);

    if (!hasCrane || hasAccessControl || currentDecision === 'CRITICAL_STOP') {
        return null;
    }

    return buildOverride(
        'CRANE_ACCESS_CONTROL_MISSING',
        'high',
        '타워크레인/인양 작업 문맥이 있으나 접근 통제 근거가 부족합니다.',
        currentDecision,
        'IMMEDIATE_ATTENTION',
    );
}

export function evaluateCraneWeatherRule(
    text: string,
    context: HarnessContextSnapshot,
    currentDecision: HarnessRiskDecision,
): HarnessGuardrailOverride | null {
    const hasCrane = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.crane);
    const windSpeed = context.weather.windSpeedMps ?? 0;

    if (!hasCrane || windSpeed < 10 || currentDecision !== 'SAFE_TO_PROCEED') {
        return null;
    }

    return buildOverride(
        'HIGH_WIND_CONTEXT',
        'warning',
        '강풍 조건이 감지되어 인양 작업은 추가 확인이 필요합니다.',
        currentDecision,
        'SUPPLEMENTARY_REVIEW',
    );
}
