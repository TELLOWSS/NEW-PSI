import type {
    HarnessAnalyzeRequest,
    HarnessApprovalAction,
    HarnessApprovalState,
    HarnessRiskDecision,
    HarnessWorkflowState,
} from '../lib/server/harness/workflowTypes.js';
import type { HarnessVersionChangeSummaryBundle, HarnessVersionDetailsBundle, HarnessVersionDescriptor } from '../utils/harnessVersionCatalog';
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

export interface HarnessWorkflowDiagnostics {
    lookupValue: string;
    found: boolean;
    resolvedBy: 'workflow_run_id' | 'source_record_id' | null;
    sourceRecordId: string | null;
    eventCount: number;
    approvalCount: number;
    overrideCount: number;
    timelineCount: number;
}

export interface HarnessWorkflowOverride {
    ruleCode: string;
    ruleVersion: string;
    severity: string;
    message: string;
    triggerType: string | null;
    triggerPayload: Record<string, unknown>;
    originalDecision: string | null;
    overriddenDecision: string | null;
    createdAt: string;
}

export interface HarnessWorkflowApproval {
    approverName: string | null;
    approverRole: string | null;
    action: string;
    comment: string | null;
    decisionBefore: string | null;
    decisionAfter: string | null;
    createdAt: string;
}

export interface HarnessWorkflowContextSnapshot {
    createdAt: string;
    weather: Record<string, unknown>;
    schedule: Record<string, unknown>;
    sensorEvents: Array<Record<string, unknown>>;
    metadata: Record<string, unknown>;
    ocrConfidenceScore: number | null;
    imageQualityScore: number | null;
}

export interface HarnessWorkflowPromptVersion {
    version: string;
    systemInstruction: string;
    promptLayers: Record<string, unknown>;
    createdAt: string;
}

export interface HarnessWorkflowPolicyVersion {
    version: string;
    policy: Record<string, unknown>;
    createdAt: string;
}

export interface HarnessWorkflowAnalyzerSummary {
    summary: string | null;
    confidence: number | null;
}

export interface HarnessWorkflowEvaluatorSummary {
    evidenceSufficiency: number | null;
    requiresHumanApproval: boolean | null;
    flags: string[];
}

export interface HarnessWorkflowApprovalDiff {
    action: string;
    comment: string | null;
    decisionBefore: string | null;
    decisionAfter: string | null;
    workflowStateAfter: HarnessWorkflowState;
    approvalStateAfter: HarnessApprovalState;
    secondPassStatusAfter: 'NEEDED' | 'IN_PROGRESS' | 'DONE';
    requiresManagerApprovalAfter: boolean;
    updatedAt: string;
}

export interface HarnessWorkflowTransitionAction {
    action: HarnessApprovalAction | 'reanalyze';
    allowed: boolean;
    reason: string | null;
    nextWorkflowState: HarnessWorkflowState | null;
}

export type HarnessWorkflowVersionDescriptor = HarnessVersionDescriptor;
export type HarnessWorkflowVersionDetails = HarnessVersionDetailsBundle;
export type HarnessWorkflowVersionChangeSummary = HarnessVersionChangeSummaryBundle;

export interface HarnessPersistenceHealth {
    connected: boolean;
    envConfigured: boolean;
    keyMode: 'service_role' | 'anon' | 'missing';
    supabaseUrlConfigured: boolean;
    tablesReady: boolean;
    warning: string | null;
    checkedAt: string;
    counts: {
        workflowRuns: number;
        workflowEvents: number;
        humanApprovals: number;
        guardrailOverrides: number;
        contextSnapshots: number;
    };
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
        diagnostics?: HarnessWorkflowDiagnostics;
        workflowState: HarnessWorkflowState;
        riskDecision: HarnessRiskDecision;
        approvalState: HarnessApprovalState;
        secondPassStatus: 'NEEDED' | 'IN_PROGRESS' | 'DONE';
        transitionActions: HarnessWorkflowTransitionAction[];
        overrides: HarnessWorkflowOverride[];
        approvals: HarnessWorkflowApproval[];
        contextSnapshot: HarnessWorkflowContextSnapshot | null;
        promptVersion: HarnessWorkflowPromptVersion | null;
        policyVersion: HarnessWorkflowPolicyVersion | null;
        analyzerSummary: HarnessWorkflowAnalyzerSummary;
        evaluatorSummary: HarnessWorkflowEvaluatorSummary;
        latestApprovalDiff: HarnessWorkflowApprovalDiff | null;
        versionDetails: HarnessWorkflowVersionDetails;
        versionChangeSummary: HarnessWorkflowVersionChangeSummary;
        decisionPayload: Record<string, unknown> | null;
        timeline: Array<{ stage: string; timestamp: string; note: string; actor?: string }>;
    }>('harness.workflow-status', { workflowRunId });
}

export async function fetchHarnessPersistenceHealth() {
    const json = await postAdminJson<{ ok: boolean; data?: HarnessPersistenceHealth; message?: string }>(
        '/api/harness/persistence-health',
        {},
        {
            fallbackMessage: 'Harness persistence 상태 조회 실패',
            method: 'GET',
        } as any,
    );

    if (!json?.ok || !json.data) {
        throw new Error(String(json?.message || 'Harness persistence 상태 조회 실패'));
    }

    return json.data;
}
