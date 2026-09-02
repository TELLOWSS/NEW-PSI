import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildHarnessPersistenceDecisionPayload,
    fetchHarnessPersistenceHealth,
    fetchPersistedHarnessWorkflowStatus,
    hashHarnessReference,
    persistHarnessAnalysis,
    persistHarnessApproval,
    sanitizeHarnessAuditEvent,
} from '../lib/server/harness/persistence';
import { buildHarnessAuditEvents } from '../lib/server/harness/auditLogger';
import { buildHarnessContextSnapshot } from '../lib/server/harness/contextAssembler';
import { validateHarnessInput } from '../lib/server/harness/inputValidators';
import { buildHarnessPromptSnapshot } from '../lib/server/harness/promptLayers';
import type { HarnessAnalyzeRequest, HarnessDecisionResult } from '../lib/server/harness/workflowTypes';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const PROMPT_ID = '22222222-2222-4222-8222-222222222222';
const POLICY_ID = '33333333-3333-4333-8333-333333333333';
const RAW_TEXT = '원문_김현장_추락위험_안전대_보완의견';
const RAW_NAME = 'WorkerAlice';
const RAW_FILE = '김현장_위험성평가.png';
const RAW_LEADER = '팀장박현장';
const RAW_COMMENT = '승인사유_근로자김현장_교육기록';
const RAW_SOURCE_ID = '김현장_기록_2026_09_02';
const NOW = '2026-09-02T01:00:00.000Z';
const decision: HarnessDecisionResult = {
    workflowState: 'awaiting_manager_approval',
    riskDecision: 'CRITICAL_STOP',
    approvalState: 'PENDING',
    secondPassStatus: 'NEEDED',
    requiresManagerApproval: true,
};

type Row = Record<string, any>;
type Write = { table: string; mode: string; payload: any };
let tables: Record<string, Row[]>;
let writes: Write[];
let filters: Array<{ table: string; key: string; value: unknown }>;

function mockQuery(table: string) {
    let mode = 'select';
    let payload: any;
    let single = false;
    let take = Number.POSITIVE_INFINITY;
    let result: any;
    const where: Array<[string, unknown]> = [];
    const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => {
            where.push([key, value]);
            filters.push({ table, key, value });
            return query;
        },
        order: () => query,
        limit: (value: number) => { take = value; return query; },
        maybeSingle: () => { single = true; return query; },
        single: () => { single = true; return query; },
        then: (resolve: any, reject: any) => {
            if (!result) {
                let rows = tables[table] || [];
                const matches = (row: Row) => where.every(([key, value]) => row[key] === value);
                if (mode === 'select') {
                    rows = rows.filter(matches).slice(0, take);
                } else {
                    writes.push({ table, mode, payload: structuredClone(payload) });
                    if (mode === 'update') {
                        rows = rows.filter(matches).map((row) => Object.assign(row, payload));
                    } else {
                        const ids: Record<string, string> = {
                            ai_workflow_runs: RUN_ID,
                            ai_prompt_versions: PROMPT_ID,
                            ai_policy_versions: POLICY_ID,
                        };
                        rows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({
                            id: ids[table] || `row-${(tables[table] || []).length + 1}`,
                            created_at: NOW,
                            ...structuredClone(row),
                        }));
                        tables[table] = [...(tables[table] || []), ...rows];
                    }
                }
                result = { data: single ? rows[0] || null : rows, error: null };
            }
            return Promise.resolve(result).then(resolve, reject);
        },
    };
    for (const action of ['insert', 'update', 'upsert']) {
        query[action] = (value: unknown) => { mode = action; payload = value; return query; };
    }
    return query;
}

function analysisOptions() {
    const payload: HarnessAnalyzeRequest = {
        recordId: RAW_SOURCE_ID,
        documentText: RAW_TEXT,
        fileName: RAW_FILE,
        jobType: RAW_NAME,
        ocrConfidence: 0.73,
        imageQualityScore: 0.81,
        ocrQualityScore: 0.75,
        requiresManualReview: true,
        ocrQualityReasons: ['low-ocr-confidence', RAW_NAME, RAW_TEXT],
        ocrFieldConfidences: { name: 0.8, jobField: 0.91 },
        weather: { condition: RAW_TEXT, windSpeedMps: 12, rainfallMm: 5 },
        workPlan: { taskName: RAW_TEXT, concurrentHighRiskTasks: [RAW_TEXT, RAW_NAME] },
        sensorEvents: [{ type: RAW_TEXT, severity: 'high', message: RAW_TEXT }],
        metadata: { name: RAW_NAME, teamLeader: RAW_LEADER, documentText: RAW_TEXT, documentDate: '2026-09-02' },
    };
    const validation = validateHarnessInput(payload);
    const context = buildHarnessContextSnapshot(payload);
    const analyzer = {
        confidence: 0.75,
        summary: RAW_TEXT,
        extractedHazards: [RAW_TEXT],
        recommendedActions: [RAW_COMMENT],
    };
    const evaluator = { evidenceSufficiency: 60, requiresHumanApproval: true, flags: ['LOW_MODEL_CONFIDENCE', RAW_NAME] };
    const overrides = [{
        ruleCode: 'FALL_PROTECTION_MISSING',
        ruleVersion: 'psi-harness-rules-2026-04-13',
        severity: 'critical' as const,
        message: RAW_TEXT,
        originalDecision: 'SAFE_TO_PROCEED' as const,
        overriddenDecision: 'CRITICAL_STOP' as const,
    }];
    return {
        payload, decision, analyzer, validation, evaluator, context, overrides,
        promptSnapshot: buildHarnessPromptSnapshot(payload, context),
        auditEvents: buildHarnessAuditEvents({ validation, context, decision, overrides, analyzer, evaluator }),
    };
}

function expectNoRawData(value: unknown) {
    const serialized = JSON.stringify(value);
    for (const sensitive of [RAW_TEXT, RAW_NAME, RAW_FILE, RAW_LEADER, RAW_COMMENT, RAW_SOURCE_ID]) {
        expect(serialized).not.toContain(sensitive);
    }
    expect(serialized).not.toContain('documentText');
    expect(serialized).not.toContain('normalizedText');
    expect(serialized).not.toContain('"assembledPrompt":');
}

beforeEach(() => {
    tables = {};
    writes = [];
    filters = [];
    mocks.createClient.mockClear();
    mocks.createClient.mockReturnValue({ from: mockQuery });
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-service-key');
});

afterEach(() => vi.unstubAllEnvs());

describe('minimal harness persistence privacy', () => {
    it('does not use public keys, admin headers or a generic key as a persistence fallback', async () => {
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
        vi.stubEnv('SUPABASE_SERVICE_KEY', '');
        vi.stubEnv('SERVICE_ROLE_KEY', 'unsupported-generic-key');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'another-public-anon-key');
        vi.stubEnv('VITE_PSI_ADMIN_SECRET', 'public-admin-header');
        vi.stubEnv('PSI_ADMIN_SECRET', 'server-admin-header');

        const analysis = await persistHarnessAnalysis(analysisOptions());
        const approval = await persistHarnessApproval({
            workflowRunId: RUN_ID, approver: RAW_NAME, comment: RAW_COMMENT, action: 'approve', decision,
        });
        const status = await fetchPersistedHarnessWorkflowStatus(RAW_SOURCE_ID);
        const health = await fetchHarnessPersistenceHealth();

        expect(analysis.persisted).toBe(false);
        expect(approval.persisted).toBe(false);
        expect(status).toMatchObject({ persisted: false, found: false, data: null });
        expect(health).toMatchObject({ connected: false, envConfigured: false, keyMode: 'missing', tablesReady: false });
        expect(analysis.warning).toBe('서버 전용 저장 연결이 설정되지 않아 처리 상태를 저장하지 않았습니다.');
        expect(approval.warning).toBe(analysis.warning);
        expect(status.warning).toBe(analysis.warning);
        expect(health.warning).toBe(analysis.warning);
        expectNoRawData({ analysis, approval, status, health });
        expect(mocks.createClient).not.toHaveBeenCalled();
        expect(writes).toEqual([]);
    });

    it('uses the explicit server service-role alias without forwarding admin headers', async () => {
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
        vi.stubEnv('SUPABASE_SERVICE_KEY', 'explicit-server-service-key');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'unused-public-anon-key');
        vi.stubEnv('PSI_ADMIN_SECRET', 'unused-admin-header');

        const result = await persistHarnessAnalysis(analysisOptions());
        const health = await fetchHarnessPersistenceHealth();
        expect(result.persisted).toBe(true);
        expect(health).toMatchObject({ connected: true, envConfigured: true, keyMode: 'service_role' });
        expect(mocks.createClient).toHaveBeenCalledWith('https://example.supabase.co', 'explicit-server-service-key', {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        expect(JSON.stringify(mocks.createClient.mock.calls)).not.toContain('unused');
    });

    it('reports an unconfigured boundary when the URL is missing even if the server key exists', async () => {
        vi.stubEnv('VITE_SUPABASE_URL', '');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
        const health = await fetchHarnessPersistenceHealth();
        expect(health).toMatchObject({
            connected: false, envConfigured: false, supabaseUrlConfigured: false, keyMode: 'service_role', tablesReady: false,
        });
        expect(mocks.createClient).not.toHaveBeenCalled();
    });

    it('hashes local references deterministically without rehashing stored references', () => {
        const reference = hashHarnessReference(RAW_SOURCE_ID);
        expect(reference).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(hashHarnessReference(RAW_SOURCE_ID)).toBe(reference);
        expect(hashHarnessReference(reference)).toBe(reference);
        expect(hashHarnessReference('')).toBeNull();
    });

    it('keeps only numeric quality, known codes and state from the analyzer payload', () => {
        const options = analysisOptions();
        const result = buildHarnessPersistenceDecisionPayload({
            ...options,
            promptVersion: options.context.promptVersion,
            policyVersion: options.context.policyVersion,
        });
        expectNoRawData(result);
        expect(result.quality.ocrFieldConfidences).toEqual({ name: 0.8, jobField: 0.91 });
        expect(result.quality.ocrQualityReasonCodes).toEqual(['low-ocr-confidence']);
        expect(result.evaluator?.flags).toEqual(['LOW_MODEL_CONFIDENCE']);
        expect(result.decision).toEqual(decision);
        expect(result.validation?.issueCodes).toContain('OCR_QUALITY_GATE_REVIEW');
    });

    it('does not treat an ASCII personal name or filename as a safe diagnostic code', () => {
        const result = sanitizeHarnessAuditEvent({
            stage: RAW_NAME,
            timestamp: NOW,
            note: RAW_TEXT,
            payload: {
                fileName: RAW_FILE,
                flags: ['LOW_MODEL_CONFIDENCE', RAW_NAME, 'alice.png'],
                issues: [{ code: 'OCR_CONFIDENCE_LOW', message: RAW_TEXT }, { code: RAW_NAME }],
                promptVersion: RAW_NAME,
                documentText: RAW_TEXT,
                detectedKeywords: [RAW_TEXT],
                confidence: 0.9,
            },
        });
        expectNoRawData(result);
        expect(result).toEqual({
            stage: 'workflow', timestamp: NOW,
            payload: { confidence: 0.9, flags: ['LOW_MODEL_CONFIDENCE'], issueCodes: ['OCR_CONFIDENCE_LOW'], detectedKeywordCount: 1 },
        });
    });

    it('writes no raw content in runs, events, overrides, snapshots or prompt versions', async () => {
        const result = await persistHarnessAnalysis(analysisOptions());
        expect(result).toEqual({ persisted: true, workflowRunId: RUN_ID, warning: null });
        expectNoRawData(writes);
        expect(writes.map((write) => write.table)).toEqual([
            'ai_prompt_versions', 'ai_policy_versions', 'ai_workflow_runs',
            'ai_context_snapshots', 'ai_workflow_events', 'ai_guardrail_overrides',
        ]);
        expect(tables.ai_prompt_versions[0]).toMatchObject({ system_instruction: null, prompt_layers_json: {} });
        expect(tables.ai_workflow_runs[0]).toMatchObject({
            source_record_id: hashHarnessReference(RAW_SOURCE_ID), latest_summary: null, job_type: null,
        });
        expect(tables.ai_context_snapshots[0].schedule_json).toEqual({ concurrentHighRiskTaskCount: 2 });
        expect(tables.ai_context_snapshots[0].sensor_events_json).toEqual([{ severity: 'high' }]);
        expect(tables.ai_workflow_events.every((row) => row.note === null && row.actor === null)).toBe(true);
    });

    it('reanalysis updates the existing workflow without restoring raw payloads', async () => {
        await persistHarnessAnalysis(analysisOptions());
        writes = [];
        const result = await persistHarnessAnalysis({
            ...analysisOptions(), workflowRunId: RUN_ID,
            decision: { ...decision, workflowState: 'second_pass_analyzing', secondPassStatus: 'IN_PROGRESS' },
        });
        expect(result.workflowRunId).toBe(RUN_ID);
        expect(tables.ai_workflow_runs).toHaveLength(1);
        expect(writes.find((write) => write.table === 'ai_workflow_runs')?.mode).toBe('update');
        expect(tables.ai_workflow_runs[0].workflow_state).toBe('second_pass_analyzing');
        expectNoRawData(writes);
    });

    it('approval retains minimal quality history, not names, comments or extra decision fields', async () => {
        await persistHarnessAnalysis(analysisOptions());
        const savedValidation = tables.ai_workflow_runs[0].latest_decision_payload.validation;
        writes = [];
        const result = await persistHarnessApproval({
            workflowRunId: RUN_ID, approver: RAW_NAME, comment: RAW_COMMENT, action: 'approve',
            decision: {
                ...decision, workflowState: 'completed', approvalState: 'APPROVED', secondPassStatus: 'DONE',
                requiresManagerApproval: false, documentText: RAW_TEXT,
            } as HarnessDecisionResult,
        });
        expect(result.persisted).toBe(true);
        expectNoRawData(writes);
        const saved = tables.ai_workflow_runs[0].latest_decision_payload;
        expect(saved.validation).toEqual(savedValidation);
        expect(saved.evaluator.evidenceSufficiency).toBe(60);
        expect(saved.approval.commentProvided).toBe(true);
        expect(saved.approval.approverHash).toBe(hashHarnessReference(RAW_NAME));
        expect(tables.ai_human_approvals[0]).toMatchObject({
            approver_name: null, approver_role: null, approval_comment: null, approval_action: 'approve',
        });
    });

    it('scrubs legacy stored bodies and override payloads from status responses', async () => {
        await persistHarnessAnalysis(analysisOptions());
        const run = tables.ai_workflow_runs[0];
        run.latest_summary = RAW_TEXT;
        run.source_record_id = RAW_SOURCE_ID;
        run.latest_decision_payload.payload = { documentText: RAW_TEXT, name: RAW_NAME, fileName: RAW_FILE };
        run.latest_decision_payload.approval = { approver: RAW_NAME, comment: RAW_COMMENT, action: 'approve', updatedAt: NOW };
        tables.ai_context_snapshots[0].metadata_json = { name: RAW_NAME, teamLeader: RAW_LEADER, documentText: RAW_TEXT };
        tables.ai_context_snapshots[0].weather_json.condition = RAW_TEXT;
        tables.ai_context_snapshots[0].schedule_json.taskName = RAW_TEXT;
        tables.ai_context_snapshots[0].sensor_events_json = [{ severity: RAW_NAME, message: RAW_TEXT }];
        tables.ai_workflow_events[0].note = RAW_TEXT;
        tables.ai_workflow_events[0].event_stage = RAW_NAME;
        tables.ai_workflow_events[0].payload_json = { documentText: RAW_TEXT };
        tables.ai_guardrail_overrides[0].trigger_payload_json = { documentText: RAW_TEXT, name: RAW_NAME };
        tables.ai_guardrail_overrides[0].message = RAW_TEXT;
        tables.ai_prompt_versions[0].system_instruction = RAW_TEXT;
        tables.ai_prompt_versions[0].prompt_layers_json = { assembledPrompt: RAW_TEXT };
        tables.ai_human_approvals = [{
            workflow_run_id: RUN_ID, approver_name: RAW_NAME, approval_comment: RAW_COMMENT,
            approval_action: 'approve', decision_before: 'CRITICAL_STOP', decision_after: 'SUPPLEMENTARY_REVIEW', created_at: NOW,
        }];
        writes = [];

        const result = await fetchPersistedHarnessWorkflowStatus(RUN_ID);
        expect(result.found).toBe(true);
        expect(result.data?.riskDecision).toBe('CRITICAL_STOP');
        expect(result.data?.overrides[0].triggerPayload).toEqual({});
        expect(result.data?.analyzerSummary.confidence).toBe(0.75);
        expect(result.data?.evaluatorSummary.evidenceSufficiency).toBe(60);
        expect(result.data?.approvals[0].comment).toBeNull();
        expect(result.diagnostics.sourceRecordId).toBe(hashHarnessReference(RAW_SOURCE_ID));
        expectNoRawData(result);
        expect(writes).toEqual([]);
    });

    it('finds legacy source IDs read-only and hashes them on the next update', async () => {
        await persistHarnessAnalysis(analysisOptions());
        tables.ai_workflow_runs[0].source_record_id = RAW_SOURCE_ID;
        writes = [];
        const found = await fetchPersistedHarnessWorkflowStatus(RAW_SOURCE_ID);
        expect(found.found).toBe(true);
        expect(found.diagnostics.resolvedBy).toBe('source_record_id');
        expectNoRawData(found);
        expect(writes).toEqual([]);
        await persistHarnessAnalysis(analysisOptions());
        expect(tables.ai_workflow_runs).toHaveLength(1);
        expect(tables.ai_workflow_runs[0].source_record_id).toBe(hashHarnessReference(RAW_SOURCE_ID));
        expectNoRawData(writes);
    });
});
