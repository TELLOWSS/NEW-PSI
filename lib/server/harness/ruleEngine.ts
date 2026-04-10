import { DEFAULT_HARNESS_POLICY, HIGH_RISK_KEYWORD_GROUPS } from './policyRegistry.js';
import type {
    HarnessAnalyzeRequest,
    HarnessContextSnapshot,
    HarnessEvaluationOutput,
    HarnessGuardrailOverride,
    HarnessInputValidationResult,
    HarnessRiskDecision,
} from './workflowTypes.js';

function hasAny(text: string, keywords: string[]): boolean {
    return keywords.some((keyword) => text.includes(keyword));
}

function buildOverride(
    ruleCode: string,
    severity: HarnessGuardrailOverride['severity'],
    message: string,
    originalDecision: HarnessRiskDecision,
    overriddenDecision: HarnessRiskDecision,
): HarnessGuardrailOverride {
    return { ruleCode, severity, message, originalDecision, overriddenDecision };
}

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

    const hasFallContext = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.fall);
    const hasFallProtection = hasAny(text, ['안전대', '안전고리', '안전난간', '구명줄']);
    if (hasFallContext && !hasFallProtection) {
        const nextDecision: HarnessRiskDecision = 'CRITICAL_STOP';
        overrides.push(buildOverride(
            'FALL_PROTECTION_MISSING',
            'critical',
            '추락 관련 작업 문맥이 있으나 추락 방호 조치 키워드가 부족합니다.',
            decision,
            nextDecision,
        ));
        decision = nextDecision;
    }

    const hasScaffold = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.scaffold);
    const hasScaffoldProtection = hasAny(text, ['안전난간', '아웃트리거', '작업발판', '안전대']);
    if (hasScaffold && !hasScaffoldProtection && decision !== 'CRITICAL_STOP') {
        const nextDecision: HarnessRiskDecision = 'IMMEDIATE_ATTENTION';
        overrides.push(buildOverride(
            'SCAFFOLD_PROTECTION_MISSING',
            'high',
            '비계 관련 문맥이 있으나 필수 보호 조치 언급이 부족합니다.',
            decision,
            nextDecision,
        ));
        decision = nextDecision;
    }

    const hasCrane = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.crane);
    const hasAccessControl = hasAny(text, ['작업반경', '통제', '신호수', '유도자']);
    if (hasCrane && !hasAccessControl && decision !== 'CRITICAL_STOP') {
        const nextDecision: HarnessRiskDecision = 'IMMEDIATE_ATTENTION';
        overrides.push(buildOverride(
            'CRANE_ACCESS_CONTROL_MISSING',
            'high',
            '타워크레인/인양 작업 문맥이 있으나 접근 통제 근거가 부족합니다.',
            decision,
            nextDecision,
        ));
        decision = nextDecision;
    }

    const windSpeed = context.weather.windSpeedMps ?? 0;
    if (windSpeed >= 10 && (hasCrane || hasScaffold) && decision === 'SAFE_TO_PROCEED') {
        const nextDecision: HarnessRiskDecision = 'SUPPLEMENTARY_REVIEW';
        overrides.push(buildOverride(
            'HIGH_WIND_CONTEXT',
            'warning',
            '강풍 조건이 감지되어 고소/인양 작업은 추가 확인이 필요합니다.',
            decision,
            nextDecision,
        ));
        decision = nextDecision;
    }

    const rainfall = context.weather.rainfallMm ?? 0;
    const hasShoring = hasAny(text, HIGH_RISK_KEYWORD_GROUPS.shoring);
    if ((rainfall > 0 || hasAny(text, HIGH_RISK_KEYWORD_GROUPS.weather)) && hasShoring && decision === 'SAFE_TO_PROCEED') {
        const nextDecision: HarnessRiskDecision = 'SUPPLEMENTARY_REVIEW';
        overrides.push(buildOverride(
            'SHORING_WEATHER_RECHECK',
            'warning',
            '강우/침하 문맥에서 동바리 계열 작업이 감지되어 재확인이 필요합니다.',
            decision,
            nextDecision,
        ));
        decision = nextDecision;
    }

    const normalizedJobType = String(payload.jobType || '').trim();
    if (normalizedJobType && DEFAULT_HARNESS_POLICY.highRiskJobTypes.includes(normalizedJobType) && decision === 'SAFE_TO_PROCEED') {
        const nextDecision: HarnessRiskDecision = evaluation?.requiresHumanApproval ? 'SUPPLEMENTARY_REVIEW' : 'SAFE_TO_PROCEED';
        if (nextDecision !== decision) {
            overrides.push(buildOverride(
                'HIGH_RISK_JOBTYPE_REVIEW',
                'warning',
                '고위험 공종이므로 인간 승인 전 추가 검토가 필요합니다.',
                decision,
                nextDecision,
            ));
            decision = nextDecision;
        }
    }

    return { decision, overrides };
}
