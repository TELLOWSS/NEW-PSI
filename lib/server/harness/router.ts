import type {
    HarnessApprovalAction,
    HarnessApprovalState,
    HarnessDecisionResult,
    HarnessEvaluationOutput,
    HarnessGuardrailOverride,
    HarnessInputValidationResult,
    HarnessRiskDecision,
    HarnessWorkflowState,
} from './workflowTypes.js';

function resolveWorkflowState(options: {
    validation: HarnessInputValidationResult;
    overrides: HarnessGuardrailOverride[];
    requiresHumanApproval: boolean;
}): HarnessWorkflowState {
    const hasCriticalValidation = options.validation.issues.some((issue) => issue.severity === 'critical');
    if (hasCriticalValidation) return 'manual_review_required';
    if (options.requiresHumanApproval || options.overrides.some((override) => override.overriddenDecision === 'CRITICAL_STOP' || override.overriddenDecision === 'IMMEDIATE_ATTENTION')) {
        return 'awaiting_manager_approval';
    }
    return 'completed';
}

function resolveApprovalState(workflowState: HarnessWorkflowState, requiresHumanApproval: boolean): HarnessApprovalState {
    if (workflowState === 'completed') {
        return requiresHumanApproval ? 'APPROVED' : 'NOT_REQUIRED';
    }
    if (workflowState === 'awaiting_manager_approval' || workflowState === 'manual_review_required') {
        return 'PENDING';
    }
    return requiresHumanApproval ? 'REQUIRED' : 'NOT_REQUIRED';
}

function resolveSecondPassStatus(workflowState: HarnessWorkflowState): HarnessDecisionResult['secondPassStatus'] {
    if (workflowState === 'completed') return 'DONE';
    if (workflowState === 'awaiting_manager_approval') return 'NEEDED';
    return 'IN_PROGRESS';
}

export function buildHarnessDecision(options: {
    validation: HarnessInputValidationResult;
    evaluation: HarnessEvaluationOutput;
    decision: HarnessRiskDecision;
    overrides: HarnessGuardrailOverride[];
}): HarnessDecisionResult {
    const requiresManagerApproval = options.evaluation.requiresHumanApproval || options.decision !== 'SAFE_TO_PROCEED';
    const workflowState = resolveWorkflowState({
        validation: options.validation,
        overrides: options.overrides,
        requiresHumanApproval: requiresManagerApproval,
    });
    const approvalState = resolveApprovalState(workflowState, requiresManagerApproval);

    return {
        workflowState,
        riskDecision: options.decision,
        approvalState,
        secondPassStatus: resolveSecondPassStatus(workflowState),
        requiresManagerApproval,
    };
}

export function buildHarnessApprovalDecision(options: {
    action: HarnessApprovalAction;
    currentDecision: HarnessRiskDecision;
}): Pick<HarnessDecisionResult, 'workflowState' | 'approvalState' | 'secondPassStatus' | 'requiresManagerApproval' | 'riskDecision'> {
    if (options.action === 'approve') {
        return {
            workflowState: 'completed',
            approvalState: 'APPROVED',
            secondPassStatus: 'DONE',
            requiresManagerApproval: false,
            riskDecision: options.currentDecision,
        };
    }

    if (options.action === 'reject') {
        return {
            workflowState: 'awaiting_manager_approval',
            approvalState: 'REJECTED',
            secondPassStatus: 'NEEDED',
            requiresManagerApproval: true,
            riskDecision: options.currentDecision,
        };
    }

    return {
        workflowState: 'second_pass_analyzing',
        approvalState: 'PENDING',
        secondPassStatus: 'IN_PROGRESS',
        requiresManagerApproval: true,
        riskDecision: options.currentDecision,
    };
}
