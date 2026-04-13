import { HIGH_RISK_KEYWORD_GROUPS } from '../policyRegistry.js';
import type { HarnessContextSnapshot, HarnessGuardrailOverride, HarnessRiskDecision } from '../workflowTypes.js';
import { buildOverride, hasAny } from './shared.js';

/**
 * 중량물 인양 가드레일
 *
 * 중량물 인양 문맥에서 줄걸이·훅·와이어로프 등 인양구 확인
 * 또는 신호수 배치 언급이 없으면 IMMEDIATE_ATTENTION.
 */
export function evaluateLiftingRule(text: string, currentDecision: HarnessRiskDecision): HarnessGuardrailOverride | null {
    const hasLifting = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.lifting);
    const hasLiftingControl = hasAny(text, ['줄걸이', '훅', '와이어로프', '샤클', '신호수', '유도자', '인양로프', '인양구']);

    if (!hasLifting || hasLiftingControl || currentDecision === 'CRITICAL_STOP') {
        return null;
    }

    return buildOverride(
        'LIFTING_CONTROL_MISSING',
        'high',
        '중량물 인양 작업 문맥이 있으나 줄걸이·신호수 등 인양 통제 조치 근거가 부족합니다.',
        currentDecision,
        'IMMEDIATE_ATTENTION',
    );
}

/**
 * 중량물 인양 + 강풍 복합 조건 가드레일
 *
 * 인양 작업 중 풍속 10m/s 이상이면 CRITICAL_STOP.
 */
export function evaluateLiftingWindRule(
    text: string,
    context: HarnessContextSnapshot,
    currentDecision: HarnessRiskDecision,
): HarnessGuardrailOverride | null {
    const hasLifting = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.lifting);
    const windSpeed = context.weather.windSpeedMps ?? 0;

    if (!hasLifting || windSpeed < 10 || currentDecision === 'CRITICAL_STOP') {
        return null;
    }

    return buildOverride(
        'LIFTING_HIGH_WIND',
        'critical',
        `강풍(${windSpeed}m/s)이 감지된 상태에서 중량물 인양 작업은 즉시 중단이 필요합니다.`,
        currentDecision,
        'CRITICAL_STOP',
    );
}
