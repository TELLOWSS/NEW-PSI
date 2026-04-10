import type {
    HarnessAnalyzeRequest,
    HarnessApprovalAction,
    HarnessApprovalState,
    HarnessRiskDecision,
    HarnessWorkflowState,
} from '../lib/server/harness/workflowTypes.js';
import { postAdminJson } from '../utils/adminApiClient';

export interface HarnessGatewayDecision {
    workflowState: HarnessWorkflowState;
    riskDecision: HarnessRiskDecision;
    approvalState: HarnessApprovalState;
    secondPassStatus: 'NEEDED' | 'IN_PROGRESS' | 'DONE';
    requiresManagerApproval: boolean;
}

export interface HarnessGatewayResponse<T> {
    ok: boolean;
    data?: T;
    message?: string;
}

export interface HarnessPersistenceMeta {
    persisted: boolean;
    workflowRunId?: string | null;
    warning?: string | null;
}

async function postGateway<T>(gatewayAction: string, payload: Record<string, unknown>): Promise<T> {
    const json = await postAdminJson<{ ok: boolean; data?: T; message?: string }>(
        '/api/gateway',
        {
            gatewayAction,
            ...payload,
        },
        {
            fallbackMessage: 'Harness gateway 호출 실패',
        },
    );

    if (!json?.ok || !json.data) {
        throw new Error(String(json?.message || 'Harness gateway 호출 실패'));
    }

    return json.data as T;
}

export async function analyzeHarnessRecord(payload: HarnessAnalyzeRequest) {
    return postGateway<{
        workflowRunId: string | null;
        persistence: HarnessPersistenceMeta;
        decision: HarnessGatewayDecision;
        overrides: Array<{ ruleCode: string; message: string; severity: string }>;
        auditEvents: Array<{ stage: string; timestamp: string; note: string }>;
    }>('harness.analyze', payload as Record<string, unknown>);
}

export async function approveHarnessRecord(payload: {
    workflowRunId: string;
    recordId?: string;
    approver: string;
    action: HarnessApprovalAction;
    comment?: string;
    currentDecision?: HarnessRiskDecision;
}) {
    return postGateway<{
        workflowRunId: string;
        persistence: HarnessPersistenceMeta;
        approver: string;
        action: HarnessApprovalAction;
        approvedAt: string;
        workflowState: HarnessWorkflowState;
        approvalState: HarnessApprovalState;
        secondPassStatus: 'NEEDED' | 'IN_PROGRESS' | 'DONE';
        requiresManagerApproval: boolean;
        riskDecision: HarnessRiskDecision;
    }>('harness.approve', payload as Record<string, unknown>);
}

export async function reanalyzeHarnessRecord(payload: HarnessAnalyzeRequest & { workflowRunId?: string; revisedBy?: string }) {
    return postGateway<{
        workflowRunId: string | null;
        persistence: HarnessPersistenceMeta;
        revisedBy: string | null;
        reanalysisType: 'second-pass';
        decision: HarnessGatewayDecision;
        overrides: Array<{ ruleCode: string; message: string; severity: string }>;
        auditEvents: Array<{ stage: string; timestamp: string; note: string }>;
    }>('harness.reanalyze', payload as Record<string, unknown>);
}

export async function fetchHarnessWorkflowStatus(workflowRunId: string) {
    return postGateway<{
        workflowRunId: string;
        persistence?: HarnessPersistenceMeta;
        workflowState: HarnessWorkflowState;
        riskDecision: HarnessRiskDecision;
        approvalState: HarnessApprovalState;
        secondPassStatus: 'NEEDED' | 'IN_PROGRESS' | 'DONE';
        timeline: Array<{ stage: string; timestamp: string; note: string; actor?: string }>;
    }>('harness.workflow-status', { workflowRunId });
}
