import { HIGH_RISK_KEYWORD_GROUPS } from '../policyRegistry.js';
import type { HarnessContextSnapshot, HarnessGuardrailOverride, HarnessRiskDecision } from '../workflowTypes.js';
import { buildOverride, hasAny } from './shared.js';

export function evaluateShoringWeatherRule(
    text: string,
    context: HarnessContextSnapshot,
    currentDecision: HarnessRiskDecision,
): HarnessGuardrailOverride | null {
    const rainfall = context.weather.rainfallMm ?? 0;
    const hasShoring = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.shoring);
    const hasWeatherContext = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.weather);

    if ((!hasShoring || (!hasWeatherContext && rainfall <= 0)) || currentDecision !== 'SAFE_TO_PROCEED') {
        return null;
    }

    return buildOverride(
        'SHORING_WEATHER_RECHECK',
        'warning',
        '강우/침하 문맥에서 동바리 계열 작업이 감지되어 재확인이 필요합니다.',
        currentDecision,
        'SUPPLEMENTARY_REVIEW',
    );
}
