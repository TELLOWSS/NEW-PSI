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

type HarnessTransitionAction = HarnessApprovalAction | 'reanalyze';

export interface HarnessTransitionActionStatus {
    action: HarnessTransitionAction;
    allowed: boolean;
    reason: string | null;
    nextWorkflowState: HarnessWorkflowState | null;
}

export class HarnessTransitionError extends Error {
    statusCode: number;

    constructor(message: string, statusCode = 400) {
        super(message);
        this.name = 'HarnessTransitionError';
        this.statusCode = statusCode;
    }
}

const APPROVAL_ACTION_ALLOWED_STATES: Record<HarnessApprovalAction, HarnessWorkflowState[]> = {
    approve: ['awaiting_manager_approval', 'manager_revised'],
    reject: ['awaiting_manager_approval', 'manager_revised', 'manual_review_required', 'second_pass_analyzing'],
    'request-reanalysis': ['awaiting_manager_approval', 'manager_revised', 'manual_review_required'],
};

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

export function assertHarnessApprovalActionAllowed(options: {
    action: HarnessApprovalAction;
    currentWorkflowState?: HarnessWorkflowState;
    currentApprovalState?: HarnessApprovalState;
    currentSecondPassStatus?: HarnessDecisionResult['secondPassStatus'];
}) {
    const currentWorkflowState = options.currentWorkflowState || 'awaiting_manager_approval';
    const currentApprovalState = options.currentApprovalState || 'PENDING';
    const allowedStates = APPROVAL_ACTION_ALLOWED_STATES[options.action] || [];

    if (!allowedStates.includes(currentWorkflowState)) {
        throw new HarnessTransitionError(`현재 상태(${currentWorkflowState})에서는 ${options.action} 전이를 진행하실 수 없습니다.`);
    }

    if (options.action === 'approve' && currentApprovalState === 'APPROVED') {
        throw new HarnessTransitionError('이미 승인 완료된 워크플로우입니다.');
    }

    if (currentWorkflowState === 'second_pass_analyzing' && options.currentSecondPassStatus === 'IN_PROGRESS') {
        throw new HarnessTransitionError('2차 재분석이 진행 중일 때는 승인/반려/재분석 요청을 동시에 진행하실 수 없습니다.');
    }

    if (options.action === 'reject' && currentWorkflowState === 'completed') {
        throw new HarnessTransitionError('완료 상태에서는 반려 전이를 적용하실 수 없습니다. 먼저 재검토 상태로 되돌려 주셔야 합니다.');
    }

    if (options.action === 'request-reanalysis') {
        if (currentWorkflowState === 'completed' || (currentApprovalState === 'APPROVED' && options.currentSecondPassStatus === 'DONE')) {
            throw new HarnessTransitionError('완료 또는 승인 확정된 워크플로우에서는 바로 재분석을 시작하실 수 없습니다.');
        }
        if (currentWorkflowState === 'second_pass_analyzing' && options.currentSecondPassStatus === 'IN_PROGRESS') {
            throw new HarnessTransitionError('이미 2차 재분석이 진행 중입니다.');
        }
    }
}

export function assertHarnessApprovalCommentAllowed(options: {
    action: HarnessApprovalAction;
    comment?: string | null;
}) {
    const normalizedComment = String(options.comment || '').trim();

    if ((options.action === 'reject' || options.action === 'request-reanalysis') && normalizedComment.length < 8) {
        throw new HarnessTransitionError('반려 또는 재분석 요청 시에는 8자 이상의 판단 근거 코멘트가 필요합니다.');
    }
}

export function assertHarnessReanalysisAllowed(options: {
    currentWorkflowState?: HarnessWorkflowState;
    currentApprovalState?: HarnessApprovalState;
    currentSecondPassStatus?: HarnessDecisionResult['secondPassStatus'];
}) {
    const currentWorkflowState = options.currentWorkflowState;

    if (!currentWorkflowState) {
        return;
    }

    if (!['awaiting_manager_approval', 'manager_revised', 'manual_review_required'].includes(currentWorkflowState)) {
        throw new HarnessTransitionError(`현재 상태(${currentWorkflowState})에서는 재분석을 시작하실 수 없습니다.`);
    }

    if (options.currentApprovalState === 'APPROVED' || (currentWorkflowState === 'completed' && options.currentSecondPassStatus === 'DONE')) {
        throw new HarnessTransitionError('승인 완료된 워크플로우는 바로 재분석으로 전이하실 수 없습니다.');
    }

    if (currentWorkflowState === 'second_pass_analyzing' || options.currentSecondPassStatus === 'IN_PROGRESS') {
        throw new HarnessTransitionError('이미 재분석이 진행 중이므로 중복 재분석을 시작하실 수 없습니다.');
    }
}

export function getHarnessTransitionActionStatuses(options: {
    currentWorkflowState?: HarnessWorkflowState;
    currentApprovalState?: HarnessApprovalState;
    currentSecondPassStatus?: HarnessDecisionResult['secondPassStatus'];
}): HarnessTransitionActionStatus[] {
    const actions: HarnessTransitionAction[] = ['approve', 'reject', 'request-reanalysis', 'reanalyze'];

    return actions.map((action) => {
        try {
            if (action === 'reanalyze') {
                assertHarnessReanalysisAllowed(options);
                return {
                    action,
                    allowed: true,
                    reason: null,
                    nextWorkflowState: 'second_pass_analyzing',
                };
            }

            assertHarnessApprovalActionAllowed({
                action,
                currentWorkflowState: options.currentWorkflowState,
                currentApprovalState: options.currentApprovalState,
                currentSecondPassStatus: options.currentSecondPassStatus,
            });

            return {
                action,
                allowed: true,
                reason: null,
                nextWorkflowState: action === 'approve'
                    ? 'completed'
                    : action === 'reject'
                        ? 'awaiting_manager_approval'
                        : 'second_pass_analyzing',
            };
        } catch (error) {
            return {
                action,
                allowed: false,
                reason: error instanceof Error ? error.message : '전이 조건을 확인할 수 없습니다.',
                nextWorkflowState: null,
            };
        }
    });
}

export function buildHarnessApprovalDecision(options: {
    action: HarnessApprovalAction;
    currentDecision: HarnessRiskDecision;
    currentWorkflowState?: HarnessWorkflowState;
    currentApprovalState?: HarnessApprovalState;
    currentSecondPassStatus?: HarnessDecisionResult['secondPassStatus'];
}): Pick<HarnessDecisionResult, 'workflowState' | 'approvalState' | 'secondPassStatus' | 'requiresManagerApproval' | 'riskDecision'> {
    assertHarnessApprovalActionAllowed(options);

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
