import { HIGH_RISK_KEYWORD_GROUPS } from '../policyRegistry.js';
import type { HarnessContextSnapshot, HarnessGuardrailOverride, HarnessRiskDecision } from '../workflowTypes.js';
import { buildOverride, hasAny } from './shared.js';

const SHORING_SUPPORT_MEASURES = [
    '깔판', '깔목', '잭베이스', '수직간격', '강관비계', '연결핀', '안전인증', '수직재',
];

/**
 * SHORING_SUPPORT_MISSING: 동바리 계열 작업이 감지됐으나 하중 분산·지지 조치 언급이 없으면 CRITICAL_STOP
 */
export function evaluateShoringRule(
    text: string,
    currentDecision: HarnessRiskDecision,
): HarnessGuardrailOverride | null {
    if (currentDecision === 'CRITICAL_STOP') return null;

    const hasShoring = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.shoring);
    if (!hasShoring) return null;

    const hasSupportMeasure = hasAny(text, SHORING_SUPPORT_MEASURES);
    if (hasSupportMeasure) return null;

    return buildOverride(
        'SHORING_SUPPORT_MISSING',
        'critical',
        '동바리 계열 작업이 감지됐으나 깔판·잭베이스·수직재 등 하중 분산 및 지지 조치가 확인되지 않아 위험합니다.',
        currentDecision,
        'CRITICAL_STOP',
    );
}

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
