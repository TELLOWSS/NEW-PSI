import type {
    HarnessAuditEvent,
    HarnessContextSnapshot,
    HarnessDecisionResult,
    HarnessGuardrailOverride,
    HarnessInputValidationResult,
} from './workflowTypes.js';

export function buildHarnessAuditEvents(options: {
    validation: HarnessInputValidationResult;
    context: HarnessContextSnapshot;
    decision: HarnessDecisionResult;
    overrides: HarnessGuardrailOverride[];
}): HarnessAuditEvent[] {
    const now = new Date().toISOString();

    return [
        {
            stage: 'input-validation',
            timestamp: now,
            note: '입력 품질 검증 완료',
            payload: {
                ok: options.validation.ok,
                issues: options.validation.issues,
                detectedKeywords: options.validation.detectedKeywords,
            },
        },
        {
            stage: 'context-snapshot',
            timestamp: now,
            note: '분석 시점 컨텍스트 스냅샷 저장',
            payload: {
                promptVersion: options.context.promptVersion,
                policyVersion: options.context.policyVersion,
                weather: options.context.weather,
                workPlan: options.context.workPlan,
                sensorEventsCount: options.context.sensorEvents.length,
            },
        },
        {
            stage: 'guardrail-decision',
            timestamp: now,
            note: '가드레일 판단 및 상태 결정',
            payload: {
                workflowState: options.decision.workflowState,
                riskDecision: options.decision.riskDecision,
                approvalState: options.decision.approvalState,
                requiresManagerApproval: options.decision.requiresManagerApproval,
            },
        },
        ...options.overrides.map((override) => ({
            stage: 'guardrail-override',
            timestamp: now,
            note: override.message,
            payload: {
                ruleCode: override.ruleCode,
                severity: override.severity,
                originalDecision: override.originalDecision,
                overriddenDecision: override.overriddenDecision,
            },
        })),
    ];
}
