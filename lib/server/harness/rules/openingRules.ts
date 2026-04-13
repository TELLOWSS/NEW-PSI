import { HIGH_RISK_KEYWORD_GROUPS } from '../policyRegistry.js';
import type { HarnessGuardrailOverride, HarnessRiskDecision } from '../workflowTypes.js';
import { buildOverride, hasAny } from './shared.js';

/**
 * 개구부·고소작업 가드레일
 *
 * 개구부 또는 고소작업 문맥이 감지됐을 때
 * 안전 덮개, 안전망, 추락방지망 등의 차단 조치 언급이 없으면
 * CRITICAL_STOP 으로 격상한다.
 * 이미 CRITICAL_STOP 이면 중복 override 를 만들지 않는다.
 */
export function evaluateOpeningRule(text: string, currentDecision: HarnessRiskDecision): HarnessGuardrailOverride | null {
    const hasOpeningContext = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.opening);
    const hasBarrierMeasure = hasAny(text, ['안전덮개', '안전망', '추락방지망', '개구부덮개', '울타리', '방호울', '안전난간']);

    if (!hasOpeningContext || hasBarrierMeasure || currentDecision === 'CRITICAL_STOP') {
        return null;
    }

    return buildOverride(
        'OPENING_BARRIER_MISSING',
        'critical',
        '개구부·고소작업 문맥이 있으나 개구부 차단 또는 추락 방지망 설치 근거가 부족합니다.',
        currentDecision,
        'CRITICAL_STOP',
    );
}
