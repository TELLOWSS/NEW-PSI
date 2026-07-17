import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../lib/server/adminAuthGuard.js';
import { createSupabaseServerClient } from '../../lib/server/supabaseServer.js';
import { markSchemaCompatibilityFallback } from '../../lib/server/schemaCompatibility.js';

type PlanStatus = 'not-started' | 'in-progress' | 'completed';

const ALLOWED_STATUS = new Set<PlanStatus>(['not-started', 'in-progress', 'completed']);

function getSupabaseClient() {
    return createSupabaseServerClient({
        errorMessage: 'Supabase 환경변수가 누락되었습니다. SUPABASE_SERVICE_ROLE_KEY 또는 VITE_SUPABASE_ANON_KEY를 확인해 주세요.',
    });
}

function sendJsonError(res: any, statusCode: number, message: string) {
    return res.status(statusCode).json({
        ok: false,
        error: message,
        message,
    });
}

function normalizeBoardScope(raw: unknown): string {
    return String(raw || '').trim();
}

function normalizePlanKey(raw: unknown): string {
    return String(raw || '').trim();
}

function normalizeStatus(raw: unknown): PlanStatus | null {
    const value = String(raw || '').trim() as PlanStatus;
    if (!ALLOWED_STATUS.has(value)) return null;
    return value;
}

function isMissingTableError(error: any): boolean {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return (
        code === '42P01' ||
        message.includes('predictive_execution_plan_statuses') ||
        message.includes('predictive_execution_plan_status_logs') ||
        message.includes('relation')
    );
}

function isMissingCaseIdColumnError(error: any): boolean {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return code === '42703' || message.includes('case_id');
}

async function handleList(supabase: any, payload: any, res: any) {
    const boardScope = normalizeBoardScope(payload?.boardScope);
    if (!boardScope) return sendJsonError(res, 400, 'boardScope가 필요합니다.');

    const incomingPlanKeys = Array.isArray(payload?.planKeys)
        ? payload.planKeys.map((key: unknown) => normalizePlanKey(key)).filter(Boolean)
        : [];

    let query = supabase
        .from('predictive_execution_plan_statuses')
        .select('plan_key, status, updated_at, updated_by')
        .eq('board_scope', boardScope)
        .order('updated_at', { ascending: false })
        .limit(5000);

    if (incomingPlanKeys.length > 0) {
        query = query.in('plan_key', incomingPlanKeys);
    }

    const result = await query;
    if (result.error) {
        if (isMissingTableError(result.error)) {
            markSchemaCompatibilityFallback(res, { area: 'predictive-plan-status:list', reason: 'missing-table' });
            return res.status(200).json({
                ok: true,
                action: 'list',
                boardScope,
                mode: 'fallback-local',
                items: [],
            });
        }
        throw new Error(result.error.message || '실행 계획 상태 조회 실패');
    }

    const items = (result.data || []).map((row: any) => ({
        planKey: String(row?.plan_key || ''),
        status: normalizeStatus(row?.status) || 'not-started',
        updatedAt: row?.updated_at || null,
        updatedBy: row?.updated_by || null,
    }));

    return res.status(200).json({
        ok: true,
        action: 'list',
        boardScope,
        items,
    });
}

async function handleUpsert(supabase: any, payload: any, res: any) {
    const boardScope = normalizeBoardScope(payload?.boardScope);
    const planKey = normalizePlanKey(payload?.planKey);
    const status = normalizeStatus(payload?.status);

    if (!boardScope) return sendJsonError(res, 400, 'boardScope가 필요합니다.');
    if (!planKey) return sendJsonError(res, 400, 'planKey가 필요합니다.');
    if (!status) return sendJsonError(res, 400, 'status 값이 올바르지 않습니다.');

    // 현재 저장된 상태를 조회해 previous_status로 기록
    let previousStatus: PlanStatus | null = null;
    const prevResult = await supabase
        .from('predictive_execution_plan_statuses')
        .select('status')
        .eq('board_scope', boardScope)
        .eq('plan_key', planKey)
        .maybeSingle();
    if (!prevResult.error && prevResult.data?.status) {
        previousStatus = normalizeStatus(prevResult.data.status);
    }

    const upsertPayload = {
        board_scope: boardScope,
        plan_key: planKey,
        case_id: String(payload?.caseId || '').trim() || null,
        status,
        updated_by: String(payload?.updatedBy || '').trim() || '관리자',
        worker_name: String(payload?.workerName || '').trim() || null,
        job_field: String(payload?.jobField || '').trim() || null,
        team_leader: String(payload?.teamLeader || '').trim() || null,
        risk_label: String(payload?.riskLabel || '').trim() || null,
        action_title: String(payload?.actionTitle || '').trim() || null,
        due_label: String(payload?.dueLabel || '').trim() || null,
        updated_at: new Date().toISOString(),
    };

    let result = await supabase
        .from('predictive_execution_plan_statuses')
        .upsert(upsertPayload, { onConflict: 'board_scope,plan_key', ignoreDuplicates: false })
        .select('plan_key, status, updated_at, updated_by')
        .single();

    if (result.error && isMissingCaseIdColumnError(result.error)) {
        const { case_id: _caseId, ...legacyPayload } = upsertPayload;
        result = await supabase
            .from('predictive_execution_plan_statuses')
            .upsert(legacyPayload, { onConflict: 'board_scope,plan_key', ignoreDuplicates: false })
            .select('plan_key, status, updated_at, updated_by')
            .single();
    }

    if (result.error) {
        if (isMissingTableError(result.error)) {
            markSchemaCompatibilityFallback(res, { area: 'predictive-plan-status:upsert', reason: 'missing-table' });
            return res.status(200).json({
                ok: true,
                action: 'upsert',
                mode: 'fallback-local',
                item: {
                    planKey,
                    status,
                    updatedAt: new Date().toISOString(),
                    updatedBy: upsertPayload.updated_by,
                },
            });
        }
        throw new Error(result.error.message || '실행 계획 상태 저장 실패');
    }

    const logPayload = {
        board_scope: boardScope,
        plan_key: planKey,
        case_id: upsertPayload.case_id,
        status,
        previous_status: previousStatus,
        updated_by: upsertPayload.updated_by,
        worker_name: upsertPayload.worker_name,
        job_field: upsertPayload.job_field,
        team_leader: upsertPayload.team_leader,
        risk_label: upsertPayload.risk_label,
        action_title: upsertPayload.action_title,
        due_label: upsertPayload.due_label,
        created_at: new Date().toISOString(),
    };

    let logInsertResult = await supabase
        .from('predictive_execution_plan_status_logs')
        .insert(logPayload);

    if (logInsertResult.error && isMissingCaseIdColumnError(logInsertResult.error)) {
        const { case_id: _caseId, ...legacyLogPayload } = logPayload;
        logInsertResult = await supabase
            .from('predictive_execution_plan_status_logs')
            .insert(legacyLogPayload);
    }

    if (logInsertResult.error && !isMissingTableError(logInsertResult.error)) {
        console.warn('[predictive-plan-status] 히스토리 로그 저장 실패:', logInsertResult.error.message || logInsertResult.error);
    }

    return res.status(200).json({
        ok: true,
        action: 'upsert',
        item: {
            planKey: String((result.data as any)?.plan_key || planKey),
            status: normalizeStatus((result.data as any)?.status) || status,
            updatedAt: (result.data as any)?.updated_at || null,
            updatedBy: (result.data as any)?.updated_by || upsertPayload.updated_by,
        },
    });
}

async function handleHistory(supabase: any, payload: any, res: any) {
    const boardScope = normalizeBoardScope(payload?.boardScope);
    const planKey = normalizePlanKey(payload?.planKey);
    const limit = Math.max(1, Math.min(20, Number(payload?.limit || 5)));

    if (!boardScope) return sendJsonError(res, 400, 'boardScope가 필요합니다.');
    if (!planKey) return sendJsonError(res, 400, 'planKey가 필요합니다.');

    const result = await supabase
        .from('predictive_execution_plan_status_logs')
        .select('status, previous_status, updated_by, created_at')
        .eq('board_scope', boardScope)
        .eq('plan_key', planKey)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (result.error) {
        if (isMissingTableError(result.error)) {
            markSchemaCompatibilityFallback(res, { area: 'predictive-plan-status:history', reason: 'missing-table' });
            return res.status(200).json({
                ok: true,
                action: 'history',
                mode: 'fallback-local',
                boardScope,
                planKey,
                items: [],
            });
        }
        throw new Error(result.error.message || '실행 계획 히스토리 조회 실패');
    }

    const items = (result.data || []).map((row: any) => ({
        status: normalizeStatus(row?.status) || 'not-started',
        previousStatus: normalizeStatus(row?.previous_status) ?? null,
        updatedBy: String(row?.updated_by || '').trim() || null,
        updatedAt: row?.created_at || null,
    }));

    return res.status(200).json({
        ok: true,
        action: 'history',
        boardScope,
        planKey,
        items,
    });
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return sendJsonError(res, 405, 'Method Not Allowed');
    }

    if (!isValidAdminAuthRequest(req)) {
        return sendUnauthorizedAdminResponse(res);
    }

    try {
        const action = String(req.body?.action || '').trim();
        const payload = req.body?.payload || {};
        const supabase = getSupabaseClient();

        if (action === 'list') {
            return await handleList(supabase, payload, res);
        }

        if (action === 'upsert') {
            return await handleUpsert(supabase, payload, res);
        }

        if (action === 'history') {
            return await handleHistory(supabase, payload, res);
        }

        return sendJsonError(res, 400, '지원하지 않는 action입니다.');
    } catch (error: any) {
        return sendJsonError(res, 500, error?.message || '실행 계획 상태 처리 실패');
    }
}
