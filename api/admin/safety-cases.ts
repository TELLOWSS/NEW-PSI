import { createClient } from '@supabase/supabase-js';
import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../lib/server/adminAuthGuard.js';
import { markSchemaCompatibilityFallback } from '../../lib/server/schemaCompatibility.js';

const ALLOWED_STATUSES = new Set([
    'open',
    'action-in-progress',
    'awaiting-report',
    'awaiting-training',
    'awaiting-acknowledgement',
    'awaiting-reassessment',
    'closed',
]);
const ALLOWED_STAGES = new Set([
    'detected',
    'action',
    'report',
    'training',
    'acknowledgement',
    'reassessment',
]);

function getSupabaseClient() {
    const url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_ROLE_KEY || '';
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const adminSecret = process.env.VITE_PSI_ADMIN_SECRET || process.env.PSI_ADMIN_SECRET || '';
    const key = serviceKey || anonKey;
    if (!url || !key) throw new Error('Supabase 환경변수가 누락되었습니다.');
    return createClient(url, key, {
        global: {
            headers: adminSecret ? { 'x-psi-admin-secret': adminSecret } : {},
        },
    });
}

function isSchemaMissing(error: any): boolean {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === '42P01' || message.includes('safety_cases') || message.includes('safety_case_events');
}

function sendError(res: any, status: number, message: string) {
    return res.status(status).json({ ok: false, message, error: message });
}

function normalizeCaseRecord(raw: any) {
    const caseId = String(raw?.caseId || '').trim();
    const status = String(raw?.status || '').trim();
    if (!caseId) throw new Error('caseId가 필요합니다.');
    if (!ALLOWED_STATUSES.has(status)) throw new Error('사건 상태가 올바르지 않습니다.');

    return {
        case_id: caseId,
        source_plan_key: String(raw?.sourcePlanKey || '').trim(),
        source_record_id: String(raw?.sourceRecordId || '').trim() || null,
        worker_id: String(raw?.workerId || '').trim() || null,
        worker_name: String(raw?.workerName || '').trim(),
        job_field: String(raw?.jobField || '').trim(),
        team_leader: String(raw?.teamLeader || '').trim() || null,
        risk_label: String(raw?.riskLabel || '').trim(),
        action_title: String(raw?.actionTitle || '').trim(),
        owner_name: String(raw?.owner || '').trim() || null,
        due_label: String(raw?.dueLabel || '').trim() || null,
        due_at: String(raw?.dueAt || '').trim() || null,
        status,
        completed_stages: raw?.completedStages && typeof raw.completedStages === 'object' ? raw.completedStages : {},
        training_session_id: String(raw?.trainingSessionId || '').trim() || null,
        reassessment_record_id: String(raw?.reassessmentRecordId || '').trim() || null,
        created_at: String(raw?.createdAt || '').trim() || new Date().toISOString(),
        updated_at: String(raw?.updatedAt || '').trim() || new Date().toISOString(),
    };
}

function normalizeEvents(raw: any, caseId: string) {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((event) => event && ALLOWED_STAGES.has(String(event.stage || '')))
        .map((event) => ({
            event_id: String(event.id || '').trim(),
            case_id: caseId,
            stage: String(event.stage || '').trim(),
            occurred_at: String(event.occurredAt || '').trim() || new Date().toISOString(),
            actor: String(event.actor || '').trim() || '관리자',
            note: String(event.note || '').trim() || '상태 변경',
            evidence_id: String(event.evidenceId || '').trim() || null,
        }))
        .filter((event) => event.event_id);
}

async function handleSave(supabase: any, payload: any, res: any) {
    const record = normalizeCaseRecord(payload?.record);
    const result = await supabase
        .from('safety_cases')
        .upsert(record, { onConflict: 'case_id', ignoreDuplicates: false });

    if (result.error) {
        if (isSchemaMissing(result.error)) {
            markSchemaCompatibilityFallback(res, { area: 'safety-cases:save', reason: 'missing-schema' });
            return res.status(200).json({ ok: true, schemaReady: false, mode: 'fallback-local', caseId: record.case_id });
        }
        throw new Error(result.error.message || '보호사건 저장 실패');
    }

    const events = normalizeEvents(payload?.record?.events, record.case_id);
    if (events.length > 0) {
        const eventResult = await supabase
            .from('safety_case_events')
            .upsert(events, { onConflict: 'event_id', ignoreDuplicates: true });
        if (eventResult.error && !isSchemaMissing(eventResult.error)) {
            throw new Error(eventResult.error.message || '보호사건 타임라인 저장 실패');
        }
    }

    return res.status(200).json({ ok: true, schemaReady: true, caseId: record.case_id });
}

async function handleList(supabase: any, payload: any, res: any) {
    let query = supabase
        .from('safety_cases')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(500);
    const workerId = String(payload?.workerId || '').trim();
    if (workerId) query = query.eq('worker_id', workerId);
    const result = await query;
    if (result.error) {
        if (isSchemaMissing(result.error)) {
            markSchemaCompatibilityFallback(res, { area: 'safety-cases:list', reason: 'missing-schema' });
            return res.status(200).json({ ok: true, schemaReady: false, mode: 'fallback-local', items: [] });
        }
        throw new Error(result.error.message || '보호사건 조회 실패');
    }

    const caseRows = result.data || [];
    const caseIds = caseRows.map((row: any) => String(row?.case_id || '')).filter(Boolean);
    let eventRows: any[] = [];
    if (caseIds.length > 0) {
        const eventResult = await supabase
            .from('safety_case_events')
            .select('*')
            .in('case_id', caseIds)
            .order('occurred_at', { ascending: true });
        if (!eventResult.error) eventRows = eventResult.data || [];
    }

    const eventsByCase = new Map<string, any[]>();
    eventRows.forEach((event: any) => {
        const caseId = String(event?.case_id || '');
        const existing = eventsByCase.get(caseId) || [];
        existing.push({
            id: String(event?.event_id || ''),
            stage: String(event?.stage || ''),
            occurredAt: event?.occurred_at || null,
            actor: String(event?.actor || ''),
            note: String(event?.note || ''),
            evidenceId: event?.evidence_id || undefined,
        });
        eventsByCase.set(caseId, existing);
    });

    const items = caseRows.map((row: any) => ({
        caseId: String(row?.case_id || ''),
        sourcePlanKey: String(row?.source_plan_key || ''),
        sourceRecordId: row?.source_record_id || undefined,
        workerId: row?.worker_id || undefined,
        workerName: String(row?.worker_name || ''),
        jobField: String(row?.job_field || ''),
        teamLeader: row?.team_leader || undefined,
        riskLabel: String(row?.risk_label || ''),
        actionTitle: String(row?.action_title || ''),
        owner: String(row?.owner_name || ''),
        dueLabel: String(row?.due_label || ''),
        dueAt: row?.due_at || undefined,
        status: String(row?.status || 'open'),
        completedStages: row?.completed_stages || {},
        trainingSessionId: row?.training_session_id || undefined,
        reassessmentRecordId: row?.reassessment_record_id || undefined,
        createdAt: row?.created_at || new Date().toISOString(),
        updatedAt: row?.updated_at || new Date().toISOString(),
        events: eventsByCase.get(String(row?.case_id || '')) || [],
    }));

    return res.status(200).json({ ok: true, schemaReady: true, items });
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') return sendError(res, 405, 'Method Not Allowed');
    if (!isValidAdminAuthRequest(req)) return sendUnauthorizedAdminResponse(res);

    try {
        const action = String(req.body?.action || '').trim();
        const payload = req.body?.payload || {};
        const supabase = getSupabaseClient();
        if (action === 'save') return await handleSave(supabase, payload, res);
        if (action === 'list') return await handleList(supabase, payload, res);
        return sendError(res, 400, '지원하지 않는 action입니다.');
    } catch (error: any) {
        return sendError(res, 500, error?.message || '보호사건 처리 실패');
    }
}
