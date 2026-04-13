import { HIGH_RISK_KEYWORD_GROUPS } from '../policyRegistry.js';
import type { HarnessContextSnapshot, HarnessGuardrailOverride, HarnessRiskDecision } from '../workflowTypes.js';
import { buildOverride, hasAny } from './shared.js';

/**
 * 굴착·흙막이 가드레일
 *
 * 굴착 또는 흙막이 문맥 감지 시 버팀대·띠장·어스앙카 등
 * 토압 지지 조치 언급이 없으면 CRITICAL_STOP 으로 격상한다.
 */
export function evaluateExcavationRule(text: string, currentDecision: HarnessRiskDecision): HarnessGuardrailOverride | null {
    const hasExcavation = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.excavation);
    const hasRetainingMeasure = hasAny(text, ['버팀대', '띠장', '어스앙카', '소일네일', '흙막이판', '강널말뚝', '토압']);

    if (!hasExcavation || hasRetainingMeasure || currentDecision === 'CRITICAL_STOP') {
        return null;
    }

    return buildOverride(
        'EXCAVATION_SUPPORT_MISSING',
        'critical',
        '굴착·흙막이 작업 문맥이 있으나 토사 붕괴 방지(버팀대·띠장·어스앙카) 조치 근거가 부족합니다.',
        currentDecision,
        'CRITICAL_STOP',
    );
}

/**
 * 굴착 + 강우 복합 조건 가드레일
 *
 * 굴착 문맥에서 강우 컨텍스트가 감지되면 침하/붕괴 위험으로 IMMEDIATE_ATTENTION.
 * 이미 CRITICAL_STOP 이면 건너뜀.
 */
export function evaluateExcavationRainRule(
    text: string,
    context: HarnessContextSnapshot,
    currentDecision: HarnessRiskDecision,
): HarnessGuardrailOverride | null {
    const hasExcavation = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.excavation);
    const hasRainContext = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.weather) || (context.weather.rainfallMm ?? 0) > 0;

    if (!hasExcavation || !hasRainContext || currentDecision === 'CRITICAL_STOP') {
        return null;
    }

    return buildOverride(
        'EXCAVATION_RAIN_RISK',
        'high',
        '굴착 작업 중 강우·우천 조건이 감지되어 토사 침하·붕괴 위험으로 추가 검토가 필요합니다.',
        currentDecision,
        'IMMEDIATE_ATTENTION',
    );
}
