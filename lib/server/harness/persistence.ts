import { createClient } from '@supabase/supabase-js';
import type {
    HarnessAnalyzeRequest,
    HarnessApprovalAction,
    HarnessAuditEvent,
    HarnessContextSnapshot,
    HarnessDecisionResult,
    HarnessEvaluationOutput,
    HarnessGuardrailOverride,
    HarnessInputValidationResult,
    HarnessPolicySnapshot,
    HarnessPromptLayerSnapshot,
    HarnessRiskDecision,
} from './workflowTypes.js';
import { getDefaultHarnessPolicy } from './policyRegistry.js';
import { buildHarnessVersionChangeSummary, buildHarnessVersionDetailsBundle } from '../../../utils/harnessVersionCatalog.js';

type SupabaseLike = ReturnType<typeof createClient>;

type WorkflowRunRow = {
    id: string;
    source_record_id?: string | null;
    workflow_state: HarnessDecisionResult['workflowState'];
    risk_decision: HarnessDecisionResult['riskDecision'];
    approval_state: HarnessDecisionResult['approvalState'];
    second_pass_status: HarnessDecisionResult['secondPassStatus'] | null;
    requires_manager_approval: boolean;
    prompt_version_id?: string | null;
    policy_version_id?: string | null;
    latest_summary?: string | null;
    latest_confidence?: number | null;
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
            .select('id, source_record_id, workflow_state, risk_decision, approval_state, second_pass_status, requires_manager_approval, prompt_version_id, policy_version_id, latest_summary, latest_confidence, latest_decision_payload')
            .eq('id', lookup)
            .maybeSingle();

        if (error) throw error;
        if (data) return data as WorkflowRunRow;
    }

    const { data, error } = await supabase
        .from('ai_workflow_runs')
        .select('id, source_record_id, workflow_state, risk_decision, approval_state, second_pass_status, requires_manager_approval, prompt_version_id, policy_version_id, latest_summary, latest_confidence, latest_decision_payload')
        .eq('source_record_id', lookup)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return (data as WorkflowRunRow | null) || null;
}

async function findWorkflowRunWithResolution(
    supabase: SupabaseLike,
    workflowRunIdOrSource: string,
): Promise<{ run: WorkflowRunRow | null; resolvedBy: 'workflow_run_id' | 'source_record_id' | null }> {
    const lookup = String(workflowRunIdOrSource || '').trim();
    if (!lookup) {
        return { run: null, resolvedBy: null };
    }

    if (isUuidLike(lookup)) {
        const { data, error } = await supabase
            .from('ai_workflow_runs')
            .select('id, source_record_id, workflow_state, risk_decision, approval_state, second_pass_status, requires_manager_approval, prompt_version_id, policy_version_id, latest_summary, latest_confidence, latest_decision_payload')
            .eq('id', lookup)
            .maybeSingle();

        if (error) throw error;
        if (data) {
            return { run: data as WorkflowRunRow, resolvedBy: 'workflow_run_id' };
        }
    }

    const { data, error } = await supabase
        .from('ai_workflow_runs')
        .select('id, source_record_id, workflow_state, risk_decision, approval_state, second_pass_status, requires_manager_approval, prompt_version_id, policy_version_id, latest_summary, latest_confidence, latest_decision_payload')
        .eq('source_record_id', lookup)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return {
        run: (data as WorkflowRunRow | null) || null,
        resolvedBy: data ? 'source_record_id' : null,
    };
}

async function ensurePromptVersion(
    supabase: SupabaseLike,
    promptSnapshot: HarnessPromptLayerSnapshot,
): Promise<string | null> {
    const { data, error } = await supabase
        .from('ai_prompt_versions')
        .upsert({
            prompt_version: promptSnapshot.version,
            system_instruction: promptSnapshot.systemInstruction.join('\n'),
            prompt_layers_json: {
                systemInstruction: promptSnapshot.systemInstruction,
                staticKnowledge: promptSnapshot.staticKnowledge,
                dynamicContext: promptSnapshot.dynamicContext,
                assembledPrompt: promptSnapshot.assembledPrompt,
            },
            created_by: 'psi-harness-api',
        }, {
            onConflict: 'prompt_version',
        })
        .select('id')
        .limit(1)
        .single();

    if (error) throw error;
    return String(data?.id || '').trim() || null;
}

async function ensurePolicyVersion(
    supabase: SupabaseLike,
    policySnapshot: HarnessPolicySnapshot,
): Promise<string | null> {
    const { data, error } = await supabase
        .from('ai_policy_versions')
        .upsert({
            policy_version: policySnapshot.version,
            policy_json: policySnapshot,
            created_by: 'psi-harness-api',
        }, {
            onConflict: 'policy_version',
        })
        .select('id')
        .limit(1)
        .single();

    if (error) throw error;
    return String(data?.id || '').trim() || null;
}

export async function persistHarnessAnalysis(options: {
    workflowRunId?: string;
    payload: HarnessAnalyzeRequest;
    decision: HarnessDecisionResult;
    analyzer?: { summary?: string; confidence?: number };
    validation?: HarnessInputValidationResult | Record<string, unknown>;
    evaluator?: HarnessEvaluationOutput | Record<string, unknown>;
    context: HarnessContextSnapshot;
    promptSnapshot?: HarnessPromptLayerSnapshot;
    auditEvents: HarnessAuditEvent[];
    overrides: HarnessGuardrailOverride[];
}) {
    try {
        const supabase = getHarnessSupabaseClient();
        const existingRun = await findWorkflowRun(supabase, options.workflowRunId || String(options.payload.recordId || ''));
        const promptVersionId = options.promptSnapshot
            ? await ensurePromptVersion(supabase, options.promptSnapshot)
            : null;
        const policyVersionId = await ensurePolicyVersion(supabase, getDefaultHarnessPolicy());
        const decisionPayload = {
            payload: options.payload,
            validation: options.validation || null,
            evaluator: options.evaluator || null,
            decision: options.decision,
            prompt: options.promptSnapshot || null,
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
            prompt_version_id: promptVersionId,
            policy_version_id: policyVersionId,
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
                prompt_version_id: promptVersionId,
                policy_version_id: policyVersionId,
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
                    rule_version: override.ruleVersion,
                    severity: override.severity,
                    trigger_type: 'guardrail-rule',
                    trigger_payload_json: {
                        ruleVersion: override.ruleVersion,
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

        const approvalRow = {
            workflow_run_id: workflowRunId,
            approver_name: options.approver,
            approver_role: options.approver,
            approval_action: options.action,
            approval_comment: options.comment || null,
            decision_before: previousDecision,
            decision_after: options.decision.riskDecision,
            created_at: approvalTimestamp,
        };

        const { error: approvalError } = await supabase
            .from('ai_human_approvals')
            .insert(approvalRow as any);
        if (approvalError) throw approvalError;

        const eventRow = {
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
        };

        const { error: eventError } = await supabase
            .from('ai_workflow_events')
            .insert(eventRow as any);
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
        const lookupValue = String(workflowRunId || '').trim();
        const { run, resolvedBy } = await findWorkflowRunWithResolution(supabase, lookupValue);
        if (!run) {
            return {
                found: false,
                persisted: true,
                warning: null,
                data: null,
                diagnostics: {
                    lookupValue,
                    found: false,
                    resolvedBy: null,
                    sourceRecordId: null,
                    eventCount: 0,
                    approvalCount: 0,
                    overrideCount: 0,
                    timelineCount: 0,
                },
            };
        }

        const { data: events, error: eventsError } = await supabase
            .from('ai_workflow_events')
            .select('event_stage, actor, note, created_at, payload_json')
            .eq('workflow_run_id', run.id)
            .order('created_at', { ascending: true });
        if (eventsError) throw eventsError;

        const { data: approvals, error: approvalsError } = await supabase
            .from('ai_human_approvals')
            .select('approver_name, approver_role, approval_action, approval_comment, decision_before, decision_after, created_at')
            .eq('workflow_run_id', run.id)
            .order('created_at', { ascending: true });
        if (approvalsError) throw approvalsError;

        const { data: overrides, error: overridesError } = await supabase
            .from('ai_guardrail_overrides')
            .select('rule_code, rule_version, severity, message, trigger_type, trigger_payload_json, original_decision, overridden_decision, created_at')
            .eq('workflow_run_id', run.id)
            .order('created_at', { ascending: true });
        if (overridesError) throw overridesError;

        const { data: contextRows, error: contextRowsError } = await supabase
            .from('ai_context_snapshots')
            .select('weather_json, schedule_json, sensor_events_json, metadata_json, ocr_confidence_score, image_quality_score, prompt_version_id, policy_version_id, created_at')
            .eq('workflow_run_id', run.id)
            .order('created_at', { ascending: false })
            .limit(1);
        if (contextRowsError) throw contextRowsError;

        const latestContextRow = Array.isArray(contextRows) && contextRows.length > 0 ? contextRows[0] : null;
        const promptVersionId = String(latestContextRow?.prompt_version_id || run.prompt_version_id || '').trim();
        const policyVersionId = String(latestContextRow?.policy_version_id || run.policy_version_id || '').trim();

        const [promptResult, policyResult] = await Promise.all([
            promptVersionId
                ? supabase
                    .from('ai_prompt_versions')
                    .select('prompt_version, system_instruction, prompt_layers_json, created_at')
                    .eq('id', promptVersionId)
                    .maybeSingle()
                : Promise.resolve({ data: null, error: null } as any),
            policyVersionId
                ? supabase
                    .from('ai_policy_versions')
                    .select('policy_version, policy_json, created_at')
                    .eq('id', policyVersionId)
                    .maybeSingle()
                : Promise.resolve({ data: null, error: null } as any),
        ]);
        if (promptResult?.error) throw promptResult.error;
        if (policyResult?.error) throw policyResult.error;

        const latestDecisionPayload = (run.latest_decision_payload || {}) as Record<string, any>;
        const latestApproval = Array.isArray(approvals) && approvals.length > 0 ? approvals[approvals.length - 1] : null;
        const evaluatorPayload = (latestDecisionPayload?.evaluator || {}) as Record<string, any>;
        const approvalPayload = (latestDecisionPayload?.approval || {}) as Record<string, any>;
        const resolvedPromptVersion = promptResult?.data?.prompt_version ? String(promptResult.data.prompt_version) : null;
        const resolvedPolicyVersion = policyResult?.data?.policy_version ? String(policyResult.data.policy_version) : null;
        const resolvedRuleVersions = Array.from(new Set((overrides || []).map((override: any) => String(override.rule_version || '').trim()).filter(Boolean)));
        const versionDetails = buildHarnessVersionDetailsBundle({
            promptVersions: [resolvedPromptVersion],
            policyVersions: [resolvedPolicyVersion],
            ruleVersions: resolvedRuleVersions,
        });
        const versionChangeSummary = buildHarnessVersionChangeSummary(versionDetails);

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

        const eventCount = Array.isArray(events) ? events.length : 0;
        const approvalCount = Array.isArray(approvals) ? approvals.length : 0;
        const overrideCount = Array.isArray(overrides) ? overrides.length : 0;

        return {
            found: true,
            persisted: true,
            warning: null,
            diagnostics: {
                lookupValue,
                found: true,
                resolvedBy,
                sourceRecordId: run.source_record_id || null,
                eventCount,
                approvalCount,
                overrideCount,
                timelineCount: timeline.length,
            },
            data: {
                workflowRunId: run.id,
                workflowState: run.workflow_state,
                riskDecision: run.risk_decision,
                approvalState: run.approval_state,
                secondPassStatus: run.second_pass_status || 'IN_PROGRESS',
                overrides: (overrides || []).map((override: any) => ({
                    ruleCode: String(override.rule_code || ''),
                    ruleVersion: String(override.rule_version || ''),
                    severity: String(override.severity || 'warning'),
                    message: String(override.message || ''),
                    triggerType: override.trigger_type ? String(override.trigger_type) : null,
                    triggerPayload: override.trigger_payload_json || {},
                    originalDecision: override.original_decision ? String(override.original_decision) : null,
                    overriddenDecision: override.overridden_decision ? String(override.overridden_decision) : null,
                    createdAt: String(override.created_at || new Date().toISOString()),
                })),
                approvals: (approvals || []).map((approval: any) => ({
                    approverName: approval.approver_name ? String(approval.approver_name) : null,
                    approverRole: approval.approver_role ? String(approval.approver_role) : null,
                    action: String(approval.approval_action || 'approve'),
                    comment: approval.approval_comment ? String(approval.approval_comment) : null,
                    decisionBefore: approval.decision_before ? String(approval.decision_before) : null,
                    decisionAfter: approval.decision_after ? String(approval.decision_after) : null,
                    createdAt: String(approval.created_at || new Date().toISOString()),
                })),
                contextSnapshot: latestContextRow
                    ? {
                        createdAt: String(latestContextRow.created_at || new Date().toISOString()),
                        weather: latestContextRow.weather_json || {},
                        schedule: latestContextRow.schedule_json || {},
                        sensorEvents: latestContextRow.sensor_events_json || [],
                        metadata: latestContextRow.metadata_json || {},
                        ocrConfidenceScore: latestContextRow.ocr_confidence_score ?? null,
                        imageQualityScore: latestContextRow.image_quality_score ?? null,
                    }
                    : null,
                promptVersion: promptResult?.data
                    ? {
                        version: String(promptResult.data.prompt_version || ''),
                        systemInstruction: String(promptResult.data.system_instruction || ''),
                        promptLayers: promptResult.data.prompt_layers_json || {},
                        createdAt: String(promptResult.data.created_at || new Date().toISOString()),
                    }
                    : null,
                policyVersion: policyResult?.data
                    ? {
                        version: String(policyResult.data.policy_version || ''),
                        policy: policyResult.data.policy_json || {},
                        createdAt: String(policyResult.data.created_at || new Date().toISOString()),
                    }
                    : null,
                analyzerSummary: {
                    summary: run.latest_summary ? String(run.latest_summary) : null,
                    confidence: typeof run.latest_confidence === 'number' ? run.latest_confidence : null,
                },
                evaluatorSummary: {
                    evidenceSufficiency: typeof evaluatorPayload.evidenceSufficiency === 'number' ? evaluatorPayload.evidenceSufficiency : null,
                    requiresHumanApproval: typeof evaluatorPayload.requiresHumanApproval === 'boolean' ? evaluatorPayload.requiresHumanApproval : null,
                    flags: Array.isArray(evaluatorPayload.flags) ? evaluatorPayload.flags.map((flag: unknown) => String(flag)) : [],
                },
                latestApprovalDiff: latestApproval
                    ? {
                        action: String(latestApproval.approval_action || 'approve'),
                        comment: latestApproval.approval_comment ? String(latestApproval.approval_comment) : null,
                        decisionBefore: latestApproval.decision_before ? String(latestApproval.decision_before) : null,
                        decisionAfter: latestApproval.decision_after ? String(latestApproval.decision_after) : null,
                        workflowStateAfter: run.workflow_state,
                        approvalStateAfter: run.approval_state,
                        secondPassStatusAfter: run.second_pass_status || 'IN_PROGRESS',
                        requiresManagerApprovalAfter: Boolean(run.requires_manager_approval),
                        updatedAt: approvalPayload.updatedAt ? String(approvalPayload.updatedAt) : String(latestApproval.created_at || new Date().toISOString()),
                    }
                    : null,
                versionDetails,
                versionChangeSummary,
                decisionPayload: latestDecisionPayload,
                timeline,
            },
        };
    } catch (error: any) {
        if (isMissingPersistenceDependency(error) || isMissingEnv(error)) {
            return {
                found: false,
                persisted: false,
                warning: error?.message || '하네스 persistence 비활성',
                data: null,
                diagnostics: {
                    lookupValue: String(workflowRunId || '').trim(),
                    found: false,
                    resolvedBy: null,
                    sourceRecordId: null,
                    eventCount: 0,
                    approvalCount: 0,
                    overrideCount: 0,
                    timelineCount: 0,
                },
            };
        }
        throw error;
    }
}

function getHarnessPersistenceEnvMeta() {
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

    return {
        supabaseUrlConfigured: Boolean(supabaseUrl),
        keyMode: serviceRoleKey ? 'service_role' : anonKey ? 'anon' : 'missing',
        envConfigured: Boolean(supabaseUrl && (serviceRoleKey || anonKey)),
    } as const;
}

export async function fetchHarnessPersistenceHealth() {
    const envMeta = getHarnessPersistenceEnvMeta();

    try {
        const supabase = getHarnessSupabaseClient();
        const [runsResult, eventsResult, approvalsResult, overridesResult, snapshotsResult] = await Promise.all([
            supabase.from('ai_workflow_runs').select('id', { count: 'exact', head: true }),
            supabase.from('ai_workflow_events').select('id', { count: 'exact', head: true }),
            supabase.from('ai_human_approvals').select('id', { count: 'exact', head: true }),
            supabase.from('ai_guardrail_overrides').select('id', { count: 'exact', head: true }),
            supabase.from('ai_context_snapshots').select('id', { count: 'exact', head: true }),
        ]);

        const firstError = runsResult.error || eventsResult.error || approvalsResult.error || overridesResult.error || snapshotsResult.error;
        if (firstError) throw firstError;

        return {
            connected: true,
            envConfigured: envMeta.envConfigured,
            keyMode: envMeta.keyMode,
            supabaseUrlConfigured: envMeta.supabaseUrlConfigured,
            tablesReady: true,
            warning: null,
            checkedAt: new Date().toISOString(),
            counts: {
                workflowRuns: Number(runsResult.count || 0),
                workflowEvents: Number(eventsResult.count || 0),
                humanApprovals: Number(approvalsResult.count || 0),
                guardrailOverrides: Number(overridesResult.count || 0),
                contextSnapshots: Number(snapshotsResult.count || 0),
            },
        };
    } catch (error: any) {
        const missingEnv = isMissingEnv(error);
        const missingTable = isMissingPersistenceDependency(error);

        return {
            connected: false,
            envConfigured: missingEnv ? false : envMeta.envConfigured,
            keyMode: envMeta.keyMode,
            supabaseUrlConfigured: envMeta.supabaseUrlConfigured,
            tablesReady: missingTable ? false : false,
            warning: error?.message || '하네스 persistence 상태를 확인할 수 없습니다.',
            checkedAt: new Date().toISOString(),
            counts: {
                workflowRuns: 0,
                workflowEvents: 0,
                humanApprovals: 0,
                guardrailOverrides: 0,
                contextSnapshots: 0,
            },
        };
    }
}