import { createClient } from '@supabase/supabase-js';
import type {
    HarnessAnalyzeRequest,
    HarnessApprovalAction,
    HarnessAuditEvent,
    HarnessContextSnapshot,
    HarnessDecisionResult,
    HarnessGuardrailOverride,
    HarnessRiskDecision,
} from './workflowTypes.js';

type SupabaseLike = ReturnType<typeof createClient>;

type WorkflowRunRow = {
    id: string;
    source_record_id?: string | null;
    workflow_state: HarnessDecisionResult['workflowState'];
    risk_decision: HarnessDecisionResult['riskDecision'];
    approval_state: HarnessDecisionResult['approvalState'];
    second_pass_status: HarnessDecisionResult['secondPassStatus'] | null;
    requires_manager_approval: boolean;
    latest_decision_payload?: Record<string, unknown> | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuidLike = (value: string) => UUID_PATTERN.test(String(value || '').trim());

const normalizeIsoDate = (value?: string | null) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
};

const isMissingPersistenceDependency = (error: any) => {
    const message = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '').toUpperCase();
    return code === '42P01' || message.includes('ai_workflow_') || message.includes('relation');
};

const isMissingEnv = (error: any) => {
    return String(error?.message || '').includes('Supabase 환경변수 누락');
};

function getHarnessSupabaseClient(): SupabaseLike {
    const supabaseUrl =
        process.env.VITE_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        '';
    const serviceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SERVICE_ROLE_KEY ||
        '';
    const anonKey =
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        '';
    const psiAdminSecret =
        process.env.VITE_PSI_ADMIN_SECRET ||
        process.env.PSI_ADMIN_SECRET ||
        '';

    const keyToUse = serviceRoleKey || anonKey;
    if (!supabaseUrl || !keyToUse) {
        throw new Error('Supabase 환경변수 누락');
    }

    return createClient(supabaseUrl, keyToUse, {
        global: {
            headers: psiAdminSecret ? { 'x-psi-admin-secret': psiAdminSecret } : {},
        },
    });
}

async function findWorkflowRun(supabase: SupabaseLike, workflowRunIdOrSource: string): Promise<WorkflowRunRow | null> {
    const lookup = String(workflowRunIdOrSource || '').trim();
    if (!lookup) return null;

    if (isUuidLike(lookup)) {
        const { data, error } = await supabase
            .from('ai_workflow_runs')
            .select('id, source_record_id, workflow_state, risk_decision, approval_state, second_pass_status, requires_manager_approval, latest_decision_payload')
            .eq('id', lookup)
            .maybeSingle();

        if (error) throw error;
        if (data) return data as WorkflowRunRow;
    }

    const { data, error } = await supabase
        .from('ai_workflow_runs')
        .select('id, source_record_id, workflow_state, risk_decision, approval_state, second_pass_status, requires_manager_approval, latest_decision_payload')
        .eq('source_record_id', lookup)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return (data as WorkflowRunRow | null) || null;
}

export async function persistHarnessAnalysis(options: {
    workflowRunId?: string;
    payload: HarnessAnalyzeRequest;
    decision: HarnessDecisionResult;
    analyzer?: { summary?: string; confidence?: number };
    validation?: Record<string, unknown>;
    evaluator?: Record<string, unknown>;
    context: HarnessContextSnapshot;
    auditEvents: HarnessAuditEvent[];
    overrides: HarnessGuardrailOverride[];
}) {
    try {
        const supabase = getHarnessSupabaseClient();
        const existingRun = await findWorkflowRun(supabase, options.workflowRunId || String(options.payload.recordId || ''));
        const decisionPayload = {
            payload: options.payload,
            validation: options.validation || null,
            evaluator: options.evaluator || null,
            decision: options.decision,
        };

        const runRow = {
            source_record_id: String(options.payload.recordId || existingRun?.source_record_id || '').trim() || null,
            source_type: 'ocr_record',
            job_type: String(options.payload.jobType || '').trim() || null,
            document_date: normalizeIsoDate((options.payload.metadata as Record<string, unknown> | undefined)?.documentDate as string | undefined),
            workflow_state: options.decision.workflowState,
            risk_decision: options.decision.riskDecision,
            approval_state: options.decision.approvalState,
            second_pass_status: options.decision.secondPassStatus,
            requires_manager_approval: options.decision.requiresManagerApproval,
            latest_summary: String(options.analyzer?.summary || '').trim() || null,
            latest_confidence: Number.isFinite(options.analyzer?.confidence)
                ? Number(options.analyzer?.confidence)
                : null,
            latest_decision_payload: decisionPayload,
        };

        let workflowRunId = existingRun?.id || null;

        if (existingRun?.id) {
            const { error } = await supabase
                .from('ai_workflow_runs')
                .update(runRow)
                .eq('id', existingRun.id);
            if (error) throw error;
        } else {
            const { data, error } = await supabase
                .from('ai_workflow_runs')
                .insert(runRow)
                .select('id')
                .limit(1)
                .single();
            if (error) throw error;
            workflowRunId = String(data?.id || '');
        }

        if (!workflowRunId) {
            return { persisted: false, workflowRunId: null, warning: 'workflow run id 생성 실패' };
        }

        const { error: contextError } = await supabase
            .from('ai_context_snapshots')
            .insert({
                workflow_run_id: workflowRunId,
                weather_json: options.context.weather,
                schedule_json: options.context.workPlan,
                sensor_events_json: options.context.sensorEvents,
                metadata_json: options.payload.metadata || {},
                ocr_confidence_score: Number.isFinite(options.payload.ocrConfidence)
                    ? Number(options.payload.ocrConfidence)
                    : null,
                image_quality_score: Number.isFinite(options.payload.imageQualityScore)
                    ? Number(options.payload.imageQualityScore)
                    : null,
            });
        if (contextError) throw contextError;

        if (options.auditEvents.length > 0) {
            const { error: eventsError } = await supabase
                .from('ai_workflow_events')
                .insert(options.auditEvents.map((event) => ({
                    workflow_run_id: workflowRunId,
                    event_stage: event.stage,
                    event_type: 'system',
                    actor: null,
                    note: event.note,
                    payload_json: event.payload || {},
                    created_at: event.timestamp,
                })));
            if (eventsError) throw eventsError;
        }

        if (options.overrides.length > 0) {
            const { error: overridesError } = await supabase
                .from('ai_guardrail_overrides')
                .insert(options.overrides.map((override) => ({
                    workflow_run_id: workflowRunId,
                    rule_code: override.ruleCode,
                    severity: override.severity,
                    trigger_type: 'guardrail-rule',
                    trigger_payload_json: {
                        originalDecision: override.originalDecision,
                        overriddenDecision: override.overriddenDecision,
                    },
                    message: override.message,
                    original_decision: override.originalDecision,
                    overridden_decision: override.overriddenDecision,
                })));
            if (overridesError) throw overridesError;
        }

        return { persisted: true, workflowRunId, warning: null };
    } catch (error: any) {
        if (isMissingPersistenceDependency(error) || isMissingEnv(error)) {
            return { persisted: false, workflowRunId: null, warning: error?.message || '하네스 persistence 비활성' };
        }
        throw error;
    }
}

export async function persistHarnessApproval(options: {
    workflowRunId: string;
    sourceRecordId?: string;
    approver: string;
    action: HarnessApprovalAction;
    comment?: string;
    decision: Pick<HarnessDecisionResult, 'workflowState' | 'approvalState' | 'secondPassStatus' | 'requiresManagerApproval' | 'riskDecision'>;
}) {
    try {
        const supabase = getHarnessSupabaseClient();
        const existingRun = await findWorkflowRun(supabase, options.workflowRunId || options.sourceRecordId || '');

        const previousDecision = existingRun?.risk_decision || null;
        const runUpdate = {
            source_record_id: String(existingRun?.source_record_id || options.sourceRecordId || options.workflowRunId || '').trim() || null,
            source_type: 'ocr_record',
            workflow_state: options.decision.workflowState,
            risk_decision: options.decision.riskDecision,
            approval_state: options.decision.approvalState,
            second_pass_status: options.decision.secondPassStatus,
            requires_manager_approval: options.decision.requiresManagerApproval,
            latest_decision_payload: {
                ...(existingRun?.latest_decision_payload || {}),
                approval: {
                    approver: options.approver,
                    action: options.action,
                    comment: options.comment || null,
                    updatedAt: new Date().toISOString(),
                },
                decision: options.decision,
            },
        };

        let workflowRunId = existingRun?.id || null;
        if (existingRun?.id) {
            const { error } = await supabase
                .from('ai_workflow_runs')
                .update(runUpdate)
                .eq('id', existingRun.id);
            if (error) throw error;
        } else {
            const { data, error } = await supabase
                .from('ai_workflow_runs')
                .insert(runUpdate)
                .select('id')
                .limit(1)
                .single();
            if (error) throw error;
            workflowRunId = String(data?.id || '');
        }

        if (!workflowRunId) {
            return { persisted: false, workflowRunId: null, warning: 'workflow run id 생성 실패' };
        }

        const approvalTimestamp = new Date().toISOString();

        const { error: approvalError } = await supabase
            .from('ai_human_approvals')
            .insert({
                workflow_run_id: workflowRunId,
                approver_name: options.approver,
                approver_role: options.approver,
                approval_action: options.action,
                approval_comment: options.comment || null,
                decision_before: previousDecision,
                decision_after: options.decision.riskDecision,
                created_at: approvalTimestamp,
            });
        if (approvalError) throw approvalError;

        const { error: eventError } = await supabase
            .from('ai_workflow_events')
            .insert({
                workflow_run_id: workflowRunId,
                event_stage: 'approval',
                event_type: 'human-approval',
                actor: options.approver,
                note: `${options.action} 처리`,
                payload_json: {
                    comment: options.comment || null,
                    workflowState: options.decision.workflowState,
                    approvalState: options.decision.approvalState,
                    riskDecision: options.decision.riskDecision,
                },
                created_at: approvalTimestamp,
            });
        if (eventError) throw eventError;

        return { persisted: true, workflowRunId, warning: null, approvedAt: approvalTimestamp };
    } catch (error: any) {
        if (isMissingPersistenceDependency(error) || isMissingEnv(error)) {
            return { persisted: false, workflowRunId: null, warning: error?.message || '하네스 persistence 비활성', approvedAt: new Date().toISOString() };
        }
        throw error;
    }
}

export async function fetchPersistedHarnessWorkflowStatus(workflowRunId: string) {
    try {
        const supabase = getHarnessSupabaseClient();
        const run = await findWorkflowRun(supabase, workflowRunId);
        if (!run) {
            return { found: false, persisted: true, warning: null, data: null };
        }

        const { data: events, error: eventsError } = await supabase
            .from('ai_workflow_events')
            .select('event_stage, actor, note, created_at, payload_json')
            .eq('workflow_run_id', run.id)
            .order('created_at', { ascending: true });
        if (eventsError) throw eventsError;

        const { data: approvals, error: approvalsError } = await supabase
            .from('ai_human_approvals')
            .select('approver_name, approver_role, approval_action, approval_comment, created_at')
            .eq('workflow_run_id', run.id)
            .order('created_at', { ascending: true });
        if (approvalsError) throw approvalsError;

        const timeline = [
            ...(events || []).map((event: any) => ({
                stage: String(event.event_stage || 'workflow'),
                timestamp: String(event.created_at || new Date().toISOString()),
                note: String(event.note || '').trim() || '워크플로우 이벤트',
                actor: event.actor ? String(event.actor) : undefined,
            })),
            ...(approvals || []).map((approval: any) => ({
                stage: 'human-approval',
                timestamp: String(approval.created_at || new Date().toISOString()),
                note: `${approval.approval_action}${approval.approval_comment ? ` · ${approval.approval_comment}` : ''}`,
                actor: String(approval.approver_role || approval.approver_name || 'manager'),
            })),
        ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        return {
            found: true,
            persisted: true,
            warning: null,
            data: {
                workflowRunId: run.id,
                workflowState: run.workflow_state,
                riskDecision: run.risk_decision,
                approvalState: run.approval_state,
                secondPassStatus: run.second_pass_status || 'IN_PROGRESS',
                timeline,
            },
        };
    } catch (error: any) {
        if (isMissingPersistenceDependency(error) || isMissingEnv(error)) {
            return { found: false, persisted: false, warning: error?.message || '하네스 persistence 비활성', data: null };
        }
        throw error;
    }
}