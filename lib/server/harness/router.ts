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

const WORKFLOW_STATE_LABELS: Record<HarnessWorkflowState, string> = {
    uploaded: '업로드됨',
    ocr_validating: 'OCR 검증 중',
    manual_review_required: '수동 검토 필요',
    context_ready: '컨텍스트 준비',
    first_pass_analyzing: '1차 분석 중',
    evaluator_review: '검증 중',
    awaiting_manager_approval: '관리자 승인 대기',
    manager_revised: '관리자 수정 완료',
    second_pass_analyzing: '2차 재분석 중',
    completed: '완료',
};

const ACTION_LABELS: Record<HarnessTransitionAction, string> = {
    approve: '승인',
    reject: '반려',
    'request-reanalysis': '재분석 요청',
    reanalyze: '재분석 시작',
};

const getWorkflowStateLabel = (state: HarnessWorkflowState) => WORKFLOW_STATE_LABELS[state] || state;

const buildActionBlockedMessage = (state: HarnessWorkflowState, action: HarnessTransitionAction) => {
    return `${getWorkflowStateLabel(state)} 상태에서는 ${ACTION_LABELS[action]}을(를) 진행할 수 없습니다.`;
};

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
        throw new HarnessTransitionError(buildActionBlockedMessage(currentWorkflowState, options.action));
    }

    if (options.action === 'approve' && currentApprovalState === 'APPROVED') {
        throw new HarnessTransitionError('이미 승인 완료된 건은 다시 승인할 수 없습니다.');
    }

    if (currentWorkflowState === 'second_pass_analyzing' && options.currentSecondPassStatus === 'IN_PROGRESS') {
        throw new HarnessTransitionError('2차 재분석 진행 중에는 승인·반려·재분석 요청을 함께 진행할 수 없습니다.');
    }

    if (options.action === 'reject' && currentWorkflowState === 'completed') {
        throw new HarnessTransitionError('완료 상태는 바로 반려할 수 없습니다. 먼저 재검토 흐름으로 전환해 주세요.');
    }

    if (options.action === 'request-reanalysis') {
        if (currentWorkflowState === 'completed' || (currentApprovalState === 'APPROVED' && options.currentSecondPassStatus === 'DONE')) {
            throw new HarnessTransitionError('완료 또는 승인 확정 상태에서는 바로 재분석을 시작할 수 없습니다.');
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
        throw new HarnessTransitionError('반려 또는 재분석 요청에는 8자 이상 판단 근거 코멘트가 필요합니다.');
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
        throw new HarnessTransitionError(buildActionBlockedMessage(currentWorkflowState, 'reanalyze'));
    }

    if (options.currentApprovalState === 'APPROVED' || (currentWorkflowState === 'completed' && options.currentSecondPassStatus === 'DONE')) {
        throw new HarnessTransitionError('승인 완료된 건은 바로 재분석으로 전환할 수 없습니다.');
    }

    if (currentWorkflowState === 'second_pass_analyzing' || options.currentSecondPassStatus === 'IN_PROGRESS') {
        throw new HarnessTransitionError('이미 재분석이 진행 중이므로 중복 재분석을 시작할 수 없습니다.');
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
                        ? 'manager_revised'
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
        // 반려 후 관리자가 내용을 수정·보완할 수 있도록 manager_revised 상태로 전환
        return {
            workflowState: 'manager_revised',
            approvalState: 'REJECTED',
            secondPassStatus: 'NEEDED',
            requiresManagerApproval: true,
            riskDecision: options.currentDecision === 'SAFE_TO_PROCEED'
                ? 'SUPPLEMENTARY_REVIEW'
                : options.currentDecision,
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
