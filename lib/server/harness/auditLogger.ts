import type {
    HarnessAnalyzerOutput,
    HarnessAuditEvent,
    HarnessContextSnapshot,
    HarnessDecisionResult,
    HarnessEvaluationOutput,
    HarnessGuardrailOverride,
    HarnessInputValidationResult,
} from './workflowTypes.js';

export function buildHarnessAuditEvents(options: {
    validation: HarnessInputValidationResult;
    context: HarnessContextSnapshot;
    decision: HarnessDecisionResult;
    overrides: HarnessGuardrailOverride[];
    analyzer?: HarnessAnalyzerOutput;
    evaluator?: HarnessEvaluationOutput;
}): HarnessAuditEvent[] {
    const now = new Date().toISOString();

    const events: HarnessAuditEvent[] = [
        {
            stage: 'input-validation',
            timestamp: now,
            note: options.validation.ok
                ? `입력 품질 검증 통과 — 텍스트 ${options.validation.textLength}자, 키워드 ${options.validation.detectedKeywords.length}건`
                : `입력 품질 검증 실패 — 이슈 ${options.validation.issues.length}건`,
            payload: {
                ok: options.validation.ok,
                textLength: options.validation.textLength,
                specialCharacterRatio: options.validation.specialCharacterRatio,
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
    ];

    // 분석 에이전트 결과 이벤트 (전달된 경우)
    if (options.analyzer) {
        events.push({
            stage: 'analyzer',
            timestamp: now,
            note: options.analyzer.extractedHazards.length > 0
                ? `위험 ${options.analyzer.extractedHazards.length}건 감지 — ${options.analyzer.extractedHazards.join(', ')}`
                : '명시적 고위험 신호 없음',
            payload: {
                summary: options.analyzer.summary,
                extractedHazards: options.analyzer.extractedHazards,
                recommendedActions: options.analyzer.recommendedActions,
                confidence: options.analyzer.confidence,
            },
        });
    }

    // 평가 에이전트 결과 이벤트 (전달된 경우)
    if (options.evaluator) {
        events.push({
            stage: 'evaluator',
            timestamp: now,
            note: options.evaluator.requiresHumanApproval
                ? `인간 승인 필요 — 증거충분도 ${options.evaluator.evidenceSufficiency}%, 플래그 ${options.evaluator.flags.join(', ') || '없음'}`
                : `자동 처리 가능 — 증거충분도 ${options.evaluator.evidenceSufficiency}%`,
            payload: {
                evidenceSufficiency: options.evaluator.evidenceSufficiency,
                requiresHumanApproval: options.evaluator.requiresHumanApproval,
                flags: options.evaluator.flags,
            },
        });
    }

    events.push(
        {
            stage: 'guardrail-decision',
            timestamp: now,
            note: `가드레일 최종 판단 — ${options.decision.riskDecision} / ${options.decision.workflowState}`,
            payload: {
                workflowState: options.decision.workflowState,
                riskDecision: options.decision.riskDecision,
                approvalState: options.decision.approvalState,
                requiresManagerApproval: options.decision.requiresManagerApproval,
                overrideCount: options.overrides.length,
            },
        },
        ...options.overrides.map((override) => ({
            stage: 'guardrail-override',
            timestamp: now,
            note: `[${override.ruleCode}] ${override.message}`,
            payload: {
                ruleCode: override.ruleCode,
                ruleVersion: override.ruleVersion,
                severity: override.severity,
                originalDecision: override.originalDecision,
                overriddenDecision: override.overriddenDecision,
            },
        })),
    );

    return events;
}
