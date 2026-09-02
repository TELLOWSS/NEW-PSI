import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
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
import { buildHarnessRuleImpactSummary } from '../../../utils/harnessRuleImpactSummary.js';

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
    latest_confidence?: number | null;
    latest_decision_payload?: Record<string, unknown> | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASHED_REFERENCE_PATTERN = /^sha256:[0-9a-f]{64}$/i;
// Only application-owned codes may cross the persistence boundary. A character
// regexp alone would also accept personal names, filenames and OCR snippets.
const SAFE_VERSION_PATTERN = /^psi-harness-(?:prompt|policy|rules)-\d{4}-\d{2}-\d{2}$/;
const SAFE_CODES = new Set([
    'uploaded', 'ocr_validating', 'manual_review_required', 'context_ready',
    'first_pass_analyzing', 'evaluator_review', 'awaiting_manager_approval',
    'manager_revised', 'second_pass_analyzing', 'completed',
    'SAFE_TO_PROCEED', 'SUPPLEMENTARY_REVIEW', 'IMMEDIATE_ATTENTION', 'CRITICAL_STOP',
    'NOT_REQUIRED', 'REQUIRED', 'PENDING', 'APPROVED', 'REJECTED',
    'NEEDED', 'IN_PROGRESS', 'DONE', 'approve', 'reject', 'request-reanalysis',
    'info', 'warning', 'high', 'critical', 'unknown',
    'workflow', 'input-validation', 'context-snapshot', 'analyzer', 'evaluator',
    'guardrail-decision', 'guardrail-override', 'guardrail-rule', 'approval', 'human-approval',
    'OCR_QUALITY_GATE_REVIEW', 'INPUT_TEXT_TOO_SHORT', 'INPUT_TEXT_LOW_SIGNAL',
    'OCR_CONFIDENCE_CRITICAL', 'OCR_CONFIDENCE_LOW', 'IMAGE_QUALITY_LOW',
    'HIGH_RISK_CONTEXT_MISSING', 'HIGH_RISK_EVIDENCE_THIN',
    'INPUT_VALIDATION_FAILED', 'ACTION_GUIDANCE_MISSING', 'LOW_MODEL_CONFIDENCE',
    'INSUFFICIENT_EVIDENCE_VOLUME', 'INPUT_QUALITY_BLOCK', 'HIGH_RISK_JOBTYPE_REVIEW',
    'CRANE_ACCESS_CONTROL_MISSING', 'HIGH_WIND_CONTEXT', 'EXCAVATION_SUPPORT_MISSING',
    'EXCAVATION_RAIN_RISK', 'LIFTING_CONTROL_MISSING', 'LIFTING_HIGH_WIND',
    'FALL_PROTECTION_MISSING', 'OPENING_BARRIER_MISSING', 'SCAFFOLD_PROTECTION_MISSING',
    'SHORING_SUPPORT_MISSING', 'SHORING_WEATHER_RECHECK',
    'wrong-document', 'insufficient-psi-markers', 'missing-source-text',
    'missing-critical-value', 'low-ocr-confidence', 'low-critical-field-confidence', 'incomplete-q1-q5',
]);
const PERSISTENCE_SCHEMA_VERSION = 'psi-harness-minimal-v1';

const isUuidLike = (value: string) => UUID_PATTERN.test(String(value || '').trim());

const toFiniteNumber = (value: unknown): number | null => {
    const numeric = typeof value === 'number' ? value : Number.NaN;
    return Number.isFinite(numeric) ? numeric : null;
};

const toSafeCode = (value: unknown): string | null => {
    const normalized = String(value || '').trim();
    return SAFE_CODES.has(normalized) || SAFE_VERSION_PATTERN.test(normalized) ? normalized : null;
};

const toSafeCodeList = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];

    const codes = value
        .map((item) => {
            if (typeof item === 'string') return toSafeCode(item);
            if (item && typeof item === 'object') {
                return toSafeCode((item as Record<string, unknown>).code);
            }
            return null;
        })
        .filter((item): item is string => Boolean(item));

    return Array.from(new Set(codes));
};

/**
 * 서버에는 로컬 OCR 레코드 식별자를 평문으로 남기지 않는다. 동일 입력은 동일
 * 참조값으로 변환되어 기존 워크플로우 조회/갱신 기능은 유지된다.
 */
export const hashHarnessReference = (value: unknown): string | null => {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    if (HASHED_REFERENCE_PATTERN.test(normalized)) return normalized.toLowerCase();
    return `sha256:${createHash('sha256').update(`psi-harness-reference-v1\u0000${normalized}`).digest('hex')}`;
};

const sanitizeValidationSummary = (value: unknown) => {
    if (!value || typeof value !== 'object') return null;
    const validation = value as Record<string, unknown>;
    const issues = Array.isArray(validation.issues) ? validation.issues : [];
    const detectedKeywords = Array.isArray(validation.detectedKeywords) ? validation.detectedKeywords : [];

    return {
        ok: typeof validation.ok === 'boolean' ? validation.ok : null,
        textLength: toFiniteNumber(validation.textLength),
        specialCharacterRatio: toFiniteNumber(validation.specialCharacterRatio),
        issueCodes: toSafeCodeList(validation.issueCodes ?? issues),
        detectedKeywordCount: toFiniteNumber(validation.detectedKeywordCount) ?? detectedKeywords.length,
    };
};

const sanitizeEvaluatorSummary = (value: unknown) => {
    if (!value || typeof value !== 'object') return null;
    const evaluator = value as Record<string, unknown>;
    return {
        evidenceSufficiency: toFiniteNumber(evaluator.evidenceSufficiency),
        requiresHumanApproval: typeof evaluator.requiresHumanApproval === 'boolean'
            ? evaluator.requiresHumanApproval
            : null,
        flags: toSafeCodeList(evaluator.flags),
    };
};

const sanitizeOcrFieldConfidences = (value: unknown) => {
    if (!value || typeof value !== 'object') return {};
    const fields = value as Record<string, unknown>;
    return Object.fromEntries(
        ['name', 'jobField', 'date', 'nationality', 'handwrittenAnswers']
            .map((key) => [key, toFiniteNumber(fields[key])] as const)
            .filter(([, numeric]) => numeric !== null),
    );
};

export function buildHarnessPersistenceDecisionPayload(options: {
    payload: HarnessAnalyzeRequest;
    decision: HarnessDecisionResult;
    analyzer?: { confidence?: number };
    validation?: HarnessInputValidationResult | Record<string, unknown>;
    evaluator?: HarnessEvaluationOutput | Record<string, unknown>;
    promptVersion?: string | null;
    policyVersion?: string | null;
}) {
    return {
        schemaVersion: PERSISTENCE_SCHEMA_VERSION,
        recordReferenceHash: hashHarnessReference(options.payload.recordId),
        quality: {
            ocrConfidence: toFiniteNumber(options.payload.ocrConfidence),
            imageQualityScore: toFiniteNumber(options.payload.imageQualityScore),
            ocrQualityScore: toFiniteNumber(options.payload.ocrQualityScore),
            requiresManualReview: options.payload.requiresManualReview === true,
            ocrQualityReasonCodes: toSafeCodeList(options.payload.ocrQualityReasons),
            ocrFieldConfidences: sanitizeOcrFieldConfidences(options.payload.ocrFieldConfidences),
        },
        analyzer: {
            confidence: toFiniteNumber(options.analyzer?.confidence),
        },
        validation: sanitizeValidationSummary(options.validation),
        evaluator: sanitizeEvaluatorSummary(options.evaluator),
        decision: {
            workflowState: options.decision.workflowState,
            riskDecision: options.decision.riskDecision,
            approvalState: options.decision.approvalState,
            secondPassStatus: options.decision.secondPassStatus,
            requiresManagerApproval: options.decision.requiresManagerApproval,
        },
        promptVersion: toSafeCode(options.promptVersion),
        policyVersion: toSafeCode(options.policyVersion),
    };
}

export function sanitizeHarnessAuditEvent(event: HarnessAuditEvent) {
    const rawPayload = event.payload && typeof event.payload === 'object'
        ? event.payload as Record<string, unknown>
        : {};
    const payload: Record<string, unknown> = {};
    const numericKeys = [
        'textLength',
        'specialCharacterRatio',
        'sensorEventsCount',
        'confidence',
        'evidenceSufficiency',
        'overrideCount',
    ];
    const booleanKeys = ['ok', 'requiresHumanApproval', 'requiresManagerApproval'];
    const codeKeys = [
        'promptVersion',
        'policyVersion',
        'workflowState',
        'riskDecision',
        'approvalState',
        'ruleCode',
        'ruleVersion',
        'severity',
        'originalDecision',
        'overriddenDecision',
    ];

    for (const key of numericKeys) {
        const numeric = toFiniteNumber(rawPayload[key]);
        if (numeric !== null) payload[key] = numeric;
    }
    for (const key of booleanKeys) {
        if (typeof rawPayload[key] === 'boolean') payload[key] = rawPayload[key];
    }
    for (const key of codeKeys) {
        const code = toSafeCode(rawPayload[key]);
        if (code) payload[key] = code;
    }

    const flags = toSafeCodeList(rawPayload.flags);
    if (flags.length > 0) payload.flags = flags;
    const issueCodes = toSafeCodeList(rawPayload.issues);
    if (issueCodes.length > 0) payload.issueCodes = issueCodes;
    if (Array.isArray(rawPayload.detectedKeywords)) {
        payload.detectedKeywordCount = rawPayload.detectedKeywords.length;
    }
    if (Array.isArray(rawPayload.extractedHazards)) {
        payload.extractedHazardCount = rawPayload.extractedHazards.length;
    }
    if (Array.isArray(rawPayload.recommendedActions)) {
        payload.recommendedActionCount = rawPayload.recommendedActions.length;
    }

    const parsedTimestamp = new Date(String(event.timestamp || ''));
    return {
        stage: toSafeCode(event.stage) || 'workflow',
        timestamp: Number.isNaN(parsedTimestamp.getTime()) ? new Date().toISOString() : parsedTimestamp.toISOString(),
        payload,
    };
}

const buildMinimalContextSnapshot = (
    payload: HarnessAnalyzeRequest,
    context: HarnessContextSnapshot,
) => ({
    weather: {
        windSpeedMps: toFiniteNumber(context.weather?.windSpeedMps),
        rainfallMm: toFiniteNumber(context.weather?.rainfallMm),
    },
    schedule: {
        concurrentHighRiskTaskCount: Array.isArray(context.workPlan?.concurrentHighRiskTasks)
            ? context.workPlan.concurrentHighRiskTasks.length
            : 0,
    },
    sensorEvents: Array.isArray(context.sensorEvents)
        ? context.sensorEvents.map((event) => ({ severity: toSafeCode(event.severity) || 'unknown' }))
        : [],
    metadata: {
        recordReferenceHash: hashHarnessReference(payload.recordId),
        requiresManualReview: payload.requiresManualReview === true,
        ocrQualityScore: toFiniteNumber(payload.ocrQualityScore),
        ocrQualityReasonCodes: toSafeCodeList(payload.ocrQualityReasons),
        ocrFieldConfidences: sanitizeOcrFieldConfidences(payload.ocrFieldConfidences),
    },
});

const sanitizeStoredDecisionPayload = (
    value: unknown,
    run: WorkflowRunRow,
    promptVersion?: string | null,
    policyVersion?: string | null,
) => {
    const stored = value && typeof value === 'object' ? value as Record<string, any> : {};
    const quality = stored.quality && typeof stored.quality === 'object'
        ? stored.quality as Record<string, unknown>
        : {};
    const analyzer = stored.analyzer && typeof stored.analyzer === 'object'
        ? stored.analyzer as Record<string, unknown>
        : {};
    const approval = stored.approval && typeof stored.approval === 'object'
        ? stored.approval as Record<string, unknown>
        : null;

    return {
        schemaVersion: PERSISTENCE_SCHEMA_VERSION,
        recordReferenceHash: hashHarnessReference(stored.recordReferenceHash || run.source_record_id),
        quality: {
            ocrConfidence: toFiniteNumber(quality.ocrConfidence),
            imageQualityScore: toFiniteNumber(quality.imageQualityScore),
            ocrQualityScore: toFiniteNumber(quality.ocrQualityScore),
            requiresManualReview: quality.requiresManualReview === true,
            ocrQualityReasonCodes: toSafeCodeList(quality.ocrQualityReasonCodes),
            ocrFieldConfidences: sanitizeOcrFieldConfidences(quality.ocrFieldConfidences),
        },
        analyzer: {
            confidence: toFiniteNumber(analyzer.confidence ?? run.latest_confidence),
        },
        validation: sanitizeValidationSummary(stored.validation),
        evaluator: sanitizeEvaluatorSummary(stored.evaluator),
        decision: {
            workflowState: run.workflow_state,
            riskDecision: run.risk_decision,
            approvalState: run.approval_state,
            secondPassStatus: run.second_pass_status,
            requiresManagerApproval: run.requires_manager_approval,
        },
        promptVersion: toSafeCode(promptVersion || stored.promptVersion),
        policyVersion: toSafeCode(policyVersion || stored.policyVersion),
        approval: approval
            ? {
                approverHash: hashHarnessReference(approval.approverHash || approval.approver),
                action: toSafeCode(approval.action),
                commentHash: hashHarnessReference(approval.commentHash || approval.comment),
                commentProvided: approval.commentProvided === true || Boolean(approval.comment),
                updatedAt: normalizeIsoTimestamp(approval.updatedAt),
            }
            : null,
    };
};

const normalizeIsoTimestamp = (value: unknown): string | null => {
    const parsed = new Date(String(value || ''));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const sanitizeStoredContextRow = (row: Record<string, any> | null) => {
    if (!row) return null;
    const weather = row.weather_json && typeof row.weather_json === 'object'
        ? row.weather_json as Record<string, unknown>
        : {};
    const schedule = row.schedule_json && typeof row.schedule_json === 'object'
        ? row.schedule_json as Record<string, unknown>
        : {};
    const metadata = row.metadata_json && typeof row.metadata_json === 'object'
        ? row.metadata_json as Record<string, unknown>
        : {};
    const sensorEvents = Array.isArray(row.sensor_events_json) ? row.sensor_events_json : [];
    const existingConcurrentTasks = Array.isArray(schedule.concurrentHighRiskTasks)
        ? schedule.concurrentHighRiskTasks.length
        : null;

    return {
        createdAt: normalizeIsoTimestamp(row.created_at) || new Date().toISOString(),
        weather: {
            windSpeedMps: toFiniteNumber(weather.windSpeedMps),
            rainfallMm: toFiniteNumber(weather.rainfallMm),
        },
        schedule: {
            concurrentHighRiskTaskCount: toFiniteNumber(schedule.concurrentHighRiskTaskCount)
                ?? existingConcurrentTasks
                ?? 0,
        },
        sensorEvents: sensorEvents.map((event: unknown) => {
            const severity = event && typeof event === 'object'
                ? toSafeCode((event as Record<string, unknown>).severity)
                : null;
            return { severity: severity || 'unknown' };
        }),
        metadata: {
            recordReferenceHash: hashHarnessReference(metadata.recordReferenceHash),
            requiresManualReview: metadata.requiresManualReview === true,
            ocrQualityScore: toFiniteNumber(metadata.ocrQualityScore),
            ocrQualityReasonCodes: toSafeCodeList(metadata.ocrQualityReasonCodes),
            ocrFieldConfidences: sanitizeOcrFieldConfidences(metadata.ocrFieldConfidences),
        },
        ocrConfidenceScore: toFiniteNumber(row.ocr_confidence_score),
        imageQualityScore: toFiniteNumber(row.image_quality_score),
    };
};

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

const PERSISTENCE_CONFIGURATION_WARNING = '서버 전용 저장 연결이 설정되지 않아 처리 상태를 저장하지 않았습니다.';

class HarnessPersistenceConfigurationError extends Error {
    constructor() {
        super(PERSISTENCE_CONFIGURATION_WARNING);
        this.name = 'HarnessPersistenceConfigurationError';
    }
}

const isMissingEnv = (error: unknown) => error instanceof HarnessPersistenceConfigurationError;

function getHarnessPersistenceConfig() {
    return {
        supabaseUrl: (process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
        serviceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim(),
    };
}

function getHarnessSupabaseClient(): SupabaseLike {
    const { supabaseUrl, serviceRoleKey } = getHarnessPersistenceConfig();
    if (!supabaseUrl || !serviceRoleKey) {
        throw new HarnessPersistenceConfigurationError();
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });
}

async function findWorkflowRun(supabase: SupabaseLike, workflowRunIdOrSource: string): Promise<WorkflowRunRow | null> {
    return (await findWorkflowRunWithResolution(supabase, workflowRunIdOrSource)).run;
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
            .select('id, source_record_id, workflow_state, risk_decision, approval_state, second_pass_status, requires_manager_approval, prompt_version_id, policy_version_id, latest_confidence, latest_decision_payload')
            .eq('id', lookup)
            .maybeSingle();

        if (error) throw error;
        if (data) {
            return { run: data as WorkflowRunRow, resolvedBy: 'workflow_run_id' };
        }
    }

    const { data, error } = await supabase
        .from('ai_workflow_runs')
        .select('id, source_record_id, workflow_state, risk_decision, approval_state, second_pass_status, requires_manager_approval, prompt_version_id, policy_version_id, latest_confidence, latest_decision_payload')
        .eq('source_record_id', hashHarnessReference(lookup) || lookup)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    // Read-only compatibility for workflows created before reference hashing.
    // The next update replaces this legacy source ID with the hashed reference.
    if (!data && !HASHED_REFERENCE_PATTERN.test(lookup)) {
        const legacy = await supabase
            .from('ai_workflow_runs')
            .select('id, source_record_id, workflow_state, risk_decision, approval_state, second_pass_status, requires_manager_approval, prompt_version_id, policy_version_id, latest_confidence, latest_decision_payload')
            .eq('source_record_id', lookup)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (legacy.error) throw legacy.error;
        return {
            run: (legacy.data as WorkflowRunRow | null) || null,
            resolvedBy: legacy.data ? 'source_record_id' : null,
        };
    }
    return {
        run: (data as WorkflowRunRow | null) || null,
        resolvedBy: data ? 'source_record_id' : null,
    };
}

async function ensurePromptVersion(
    supabase: SupabaseLike,
    promptSnapshot: HarnessPromptLayerSnapshot,
): Promise<string | null> {
    const client = supabase as any;
    const { data, error } = await client
        .from('ai_prompt_versions')
        .upsert({
            prompt_version: toSafeCode(promptSnapshot.version) || 'unknown',
            system_instruction: null,
            prompt_layers_json: {},
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
    const client = supabase as any;
    const { data, error } = await client
        .from('ai_policy_versions')
        .upsert({
            policy_version: toSafeCode(policySnapshot.version) || 'unknown',
            policy_json: {
                minTextLength: policySnapshot.minTextLength,
                minOcrConfidence: policySnapshot.minOcrConfidence,
                criticalOcrConfidence: policySnapshot.criticalOcrConfidence,
            },
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
        const client = supabase as any;
        const existingRun = await findWorkflowRun(supabase, options.workflowRunId || String(options.payload.recordId || ''));
        const promptVersionId = options.promptSnapshot
            ? await ensurePromptVersion(supabase, options.promptSnapshot)
            : null;
        const policyVersionId = await ensurePolicyVersion(supabase, getDefaultHarnessPolicy());
        const decisionPayload = buildHarnessPersistenceDecisionPayload({
            payload: options.payload,
            decision: options.decision,
            analyzer: options.analyzer,
            validation: options.validation,
            evaluator: options.evaluator,
            promptVersion: options.promptSnapshot?.version || options.context.promptVersion,
            policyVersion: options.context.policyVersion,
        });
        const minimalContext = buildMinimalContextSnapshot(options.payload, options.context);

        const runRow = {
            source_record_id: hashHarnessReference(options.payload.recordId || existingRun?.source_record_id),
            source_type: 'ocr_record',
            job_type: null,
            document_date: normalizeIsoDate((options.payload.metadata as Record<string, unknown> | undefined)?.documentDate as string | undefined),
            workflow_state: options.decision.workflowState,
            risk_decision: options.decision.riskDecision,
            approval_state: options.decision.approvalState,
            second_pass_status: options.decision.secondPassStatus,
            requires_manager_approval: options.decision.requiresManagerApproval,
            latest_summary: null,
            latest_confidence: Number.isFinite(options.analyzer?.confidence)
                ? Number(options.analyzer?.confidence)
                : null,
            latest_decision_payload: decisionPayload,
            prompt_version_id: promptVersionId,
            policy_version_id: policyVersionId,
        };

        let workflowRunId = existingRun?.id || null;

        if (existingRun?.id) {
            const { error } = await client
                .from('ai_workflow_runs')
                .update(runRow)
                .eq('id', existingRun.id);
            if (error) throw error;
        } else {
            const { data, error } = await client
                .from('ai_workflow_runs')
                .insert(runRow)
                .select('id')
                .limit(1)
                .single();
            if (error) throw error;
            workflowRunId = String((data as any)?.id || '');
        }

        if (!workflowRunId) {
            return { persisted: false, workflowRunId: null, warning: '처리 번호 생성 실패' };
        }

        const { error: contextError } = await client
            .from('ai_context_snapshots')
            .insert({
                workflow_run_id: workflowRunId,
                weather_json: minimalContext.weather,
                schedule_json: minimalContext.schedule,
                sensor_events_json: minimalContext.sensorEvents,
                metadata_json: minimalContext.metadata,
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
            const sanitizedEvents = options.auditEvents.map(sanitizeHarnessAuditEvent);
            const { error: eventsError } = await client
                .from('ai_workflow_events')
                .insert(sanitizedEvents.map((event) => ({
                    workflow_run_id: workflowRunId,
                    event_stage: event.stage,
                    event_type: 'system',
                    actor: null,
                    note: null,
                    payload_json: event.payload,
                    created_at: event.timestamp,
                })));
            if (eventsError) throw eventsError;
        }

        if (options.overrides.length > 0) {
            const { error: overridesError } = await client
                .from('ai_guardrail_overrides')
                .insert(options.overrides.map((override) => ({
                    workflow_run_id: workflowRunId,
                    rule_code: toSafeCode(override.ruleCode) || 'unknown',
                    rule_version: toSafeCode(override.ruleVersion),
                    severity: toSafeCode(override.severity) || 'warning',
                    trigger_type: 'guardrail-rule',
                    trigger_payload_json: {
                        ruleVersion: toSafeCode(override.ruleVersion),
                        originalDecision: toSafeCode(override.originalDecision),
                        overriddenDecision: toSafeCode(override.overriddenDecision),
                    },
                    message: null,
                    original_decision: toSafeCode(override.originalDecision),
                    overridden_decision: toSafeCode(override.overriddenDecision),
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
        const client = supabase as any;
        const existingRun = await findWorkflowRun(supabase, options.workflowRunId || options.sourceRecordId || '');

        const previousDecision = toSafeCode(existingRun?.risk_decision);
        const approvalTimestamp = new Date().toISOString();
        const recordReferenceHash = hashHarnessReference(
            existingRun?.source_record_id || options.sourceRecordId || options.workflowRunId,
        );
        const runUpdate = {
            source_record_id: recordReferenceHash,
            source_type: 'ocr_record',
            job_type: null,
            workflow_state: options.decision.workflowState,
            risk_decision: options.decision.riskDecision,
            approval_state: options.decision.approvalState,
            second_pass_status: options.decision.secondPassStatus,
            requires_manager_approval: options.decision.requiresManagerApproval,
            latest_summary: null,
            latest_decision_payload: {
                ...(existingRun ? sanitizeStoredDecisionPayload(existingRun.latest_decision_payload, existingRun) : {}),
                schemaVersion: PERSISTENCE_SCHEMA_VERSION,
                recordReferenceHash,
                approval: {
                    approverHash: hashHarnessReference(options.approver),
                    action: options.action,
                    commentHash: hashHarnessReference(options.comment),
                    commentProvided: Boolean(String(options.comment || '').trim()),
                    updatedAt: approvalTimestamp,
                },
                decision: {
                    workflowState: options.decision.workflowState,
                    riskDecision: options.decision.riskDecision,
                    approvalState: options.decision.approvalState,
                    secondPassStatus: options.decision.secondPassStatus,
                    requiresManagerApproval: options.decision.requiresManagerApproval,
                },
            },
        };

        let workflowRunId = existingRun?.id || null;
        if (existingRun?.id) {
            const { error } = await client
                .from('ai_workflow_runs')
                .update(runUpdate)
                .eq('id', existingRun.id);
            if (error) throw error;
        } else {
            const { data, error } = await client
                .from('ai_workflow_runs')
                .insert(runUpdate)
                .select('id')
                .limit(1)
                .single();
            if (error) throw error;
            workflowRunId = String((data as any)?.id || '');
        }

        if (!workflowRunId) {
            return { persisted: false, workflowRunId: null, warning: '처리 번호 생성 실패' };
        }

        const approvalRow = {
            workflow_run_id: workflowRunId,
            approver_name: null,
            approver_role: null,
            approval_action: options.action,
            approval_comment: null,
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
            actor: null,
            note: null,
            payload_json: {
                action: options.action,
                approverHash: hashHarnessReference(options.approver),
                commentHash: hashHarnessReference(options.comment),
                commentProvided: Boolean(String(options.comment || '').trim()),
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
                    lookupValue: hashHarnessReference(lookupValue) || '',
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
            .select('event_stage, created_at')
            .eq('workflow_run_id', run.id)
            .order('created_at', { ascending: true });
        if (eventsError) throw eventsError;

        const { data: approvals, error: approvalsError } = await supabase
            .from('ai_human_approvals')
            .select('approval_action, decision_before, decision_after, created_at')
            .eq('workflow_run_id', run.id)
            .order('created_at', { ascending: true });
        if (approvalsError) throw approvalsError;

        const { data: overrides, error: overridesError } = await supabase
            .from('ai_guardrail_overrides')
            .select('rule_code, rule_version, severity, trigger_type, original_decision, overridden_decision, created_at')
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
                    .select('prompt_version, created_at')
                    .eq('id', promptVersionId)
                    .maybeSingle()
                : Promise.resolve({ data: null, error: null } as any),
            policyVersionId
                ? supabase
                    .from('ai_policy_versions')
                    .select('policy_version, created_at')
                    .eq('id', policyVersionId)
                    .maybeSingle()
                : Promise.resolve({ data: null, error: null } as any),
        ]);
        if (promptResult?.error) throw promptResult.error;
        if (policyResult?.error) throw policyResult.error;

        const latestApproval = Array.isArray(approvals) && approvals.length > 0 ? approvals[approvals.length - 1] : null;
        const resolvedPromptVersion = toSafeCode(promptResult?.data?.prompt_version);
        const resolvedPolicyVersion = toSafeCode(policyResult?.data?.policy_version);
        const latestDecisionPayload = sanitizeStoredDecisionPayload(
            run.latest_decision_payload,
            run,
            resolvedPromptVersion,
            resolvedPolicyVersion,
        );
        const evaluatorPayload = (latestDecisionPayload.evaluator || {}) as Record<string, any>;
        const approvalPayload = (latestDecisionPayload.approval || {}) as Record<string, any>;
        const resolvedRuleVersions = Array.from(new Set((overrides || []).map((override: any) => toSafeCode(override.rule_version)).filter(Boolean)));
        const versionDetails = buildHarnessVersionDetailsBundle({
            promptVersions: [resolvedPromptVersion],
            policyVersions: [resolvedPolicyVersion],
            ruleVersions: resolvedRuleVersions,
        });
        const versionChangeSummary = buildHarnessVersionChangeSummary(versionDetails);
        const normalizedOverrides = (overrides || []).map((override: any) => ({
            ruleCode: toSafeCode(override.rule_code) || 'unknown',
            ruleVersion: toSafeCode(override.rule_version) || '',
            severity: toSafeCode(override.severity) || 'warning',
            message: '',
            triggerType: toSafeCode(override.trigger_type),
            originalDecision: toSafeCode(override.original_decision),
            overriddenDecision: toSafeCode(override.overridden_decision),
            createdAt: normalizeIsoTimestamp(override.created_at) || new Date().toISOString(),
            triggerPayload: {},
        }));
        const ruleImpactSummary = buildHarnessRuleImpactSummary(normalizedOverrides);

        const timeline = [
            ...(events || []).map((event: any) => ({
                stage: toSafeCode(event.event_stage) || 'workflow',
                timestamp: normalizeIsoTimestamp(event.created_at) || new Date().toISOString(),
                note: toSafeCode(event.event_stage) || 'workflow',
            })),
            ...(approvals || []).map((approval: any) => ({
                stage: 'human-approval',
                timestamp: normalizeIsoTimestamp(approval.created_at) || new Date().toISOString(),
                note: toSafeCode(approval.approval_action) || 'approval',
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
                lookupValue: hashHarnessReference(lookupValue) || '',
                found: true,
                resolvedBy,
                sourceRecordId: hashHarnessReference(run.source_record_id),
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
                overrides: normalizedOverrides,
                approvals: (approvals || []).map((approval: any) => ({
                    approverName: null,
                    approverRole: null,
                    action: toSafeCode(approval.approval_action) || 'unknown',
                    comment: null,
                    decisionBefore: toSafeCode(approval.decision_before),
                    decisionAfter: toSafeCode(approval.decision_after),
                    createdAt: normalizeIsoTimestamp(approval.created_at) || new Date().toISOString(),
                })),
                contextSnapshot: sanitizeStoredContextRow(latestContextRow),
                promptVersion: promptResult?.data
                    ? {
                        version: resolvedPromptVersion || 'unknown',
                        systemInstruction: '',
                        promptLayers: {},
                        createdAt: normalizeIsoTimestamp(promptResult.data.created_at) || new Date().toISOString(),
                    }
                    : null,
                policyVersion: policyResult?.data
                    ? {
                        version: resolvedPolicyVersion || 'unknown',
                        policy: {},
                        createdAt: normalizeIsoTimestamp(policyResult.data.created_at) || new Date().toISOString(),
                    }
                    : null,
                analyzerSummary: {
                    summary: null,
                    confidence: typeof run.latest_confidence === 'number' ? run.latest_confidence : null,
                },
                evaluatorSummary: {
                    evidenceSufficiency: typeof evaluatorPayload.evidenceSufficiency === 'number' ? evaluatorPayload.evidenceSufficiency : null,
                    requiresHumanApproval: typeof evaluatorPayload.requiresHumanApproval === 'boolean' ? evaluatorPayload.requiresHumanApproval : null,
                    flags: Array.isArray(evaluatorPayload.flags) ? evaluatorPayload.flags.map((flag: unknown) => String(flag)) : [],
                },
                latestApprovalDiff: latestApproval
                    ? {
                        action: toSafeCode(latestApproval.approval_action) || 'unknown',
                        comment: null,
                        decisionBefore: toSafeCode(latestApproval.decision_before),
                        decisionAfter: toSafeCode(latestApproval.decision_after),
                        workflowStateAfter: run.workflow_state,
                        approvalStateAfter: run.approval_state,
                        secondPassStatusAfter: run.second_pass_status || 'IN_PROGRESS',
                        requiresManagerApprovalAfter: Boolean(run.requires_manager_approval),
                        updatedAt: normalizeIsoTimestamp(approvalPayload.updatedAt || latestApproval.created_at) || new Date().toISOString(),
                    }
                    : null,
                versionDetails,
                versionChangeSummary,
                ruleImpactSummary,
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
                    lookupValue: hashHarnessReference(workflowRunId) || '',
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
    const { supabaseUrl, serviceRoleKey } = getHarnessPersistenceConfig();

    return {
        supabaseUrlConfigured: Boolean(supabaseUrl),
        keyMode: serviceRoleKey ? 'service_role' : 'missing',
        envConfigured: Boolean(supabaseUrl && serviceRoleKey),
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
        return {
            connected: false,
            envConfigured: missingEnv ? false : envMeta.envConfigured,
            keyMode: envMeta.keyMode,
            supabaseUrlConfigured: envMeta.supabaseUrlConfigured,
            tablesReady: false,
            warning: missingEnv ? PERSISTENCE_CONFIGURATION_WARNING : '서버 저장 연결 상태를 확인할 수 없습니다.',
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
