import { createClient } from '@supabase/supabase-js';
import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../lib/server/adminAuthGuard.js';

type SurveyRiskLevel = '상' | '중' | '하';

const TABLE_NAME = 'survey_risk_baselines';
const ALLOWED_LEVELS = new Set<SurveyRiskLevel>(['상', '중', '하']);

function getSupabaseClient() {
    const supabaseUrl =
        process.env.VITE_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        '';
    const serviceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SERVICE_ROLE_KEY ||
        '';

    if (!supabaseUrl || !serviceRoleKey) {
        return null;
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
    });
}

function sendJsonError(res: any, statusCode: number, message: string) {
    return res.status(statusCode).json({
        ok: false,
        error: message,
        message,
    });
}

function normalizeMonthKey(raw: unknown): string {
    const value = String(raw || '').trim();
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : '';
}

function normalizeTrade(raw: unknown): string {
    return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

function normalizeLevel(raw: unknown): SurveyRiskLevel | null {
    const value = String(raw || '').trim() as SurveyRiskLevel;
    return ALLOWED_LEVELS.has(value) ? value : null;
}

function isFallbackError(error: any): boolean {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return (
        code === '42P01'
        || code === 'PGRST205'
        || code === '42501'
        || message.includes(TABLE_NAME)
        || message.includes('permission denied')
        || message.includes('schema cache')
    );
}

function fallbackResponse(res: any, action: string) {
    return res.status(200).json({
        ok: true,
        action,
        mode: 'fallback-local',
        items: action === 'list' ? [] : undefined,
    });
}

async function handleList(supabase: any, res: any) {
    const result = await supabase
        .from(TABLE_NAME)
        .select('trade, month_key, level, updated_at')
        .order('month_key', { ascending: false })
        .order('trade', { ascending: true })
        .limit(5000);

    if (result.error) {
        if (isFallbackError(result.error)) return fallbackResponse(res, 'list');
        throw new Error(result.error.message || '관리자 위험 기준 조회 실패');
    }

    return res.status(200).json({
        ok: true,
        action: 'list',
        items: (result.data || []).map((row: any) => ({
            trade: String(row?.trade || ''),
            monthKey: String(row?.month_key || ''),
            level: String(row?.level || ''),
            updatedAt: row?.updated_at || null,
        })),
    });
}

async function handleUpsert(supabase: any, payload: any, res: any) {
    const monthKey = normalizeMonthKey(payload?.monthKey);
    const trade = normalizeTrade(payload?.trade);
    const level = normalizeLevel(payload?.level);
    const updatedBy = String(payload?.updatedBy || '').trim().slice(0, 80) || '관리자';

    if (!monthKey) return sendJsonError(res, 400, 'monthKey는 YYYY-MM 형식이어야 합니다.');
    if (!trade) return sendJsonError(res, 400, '공종이 필요합니다.');
    if (!level) return sendJsonError(res, 400, '위험등급은 상·중·하 중 하나여야 합니다.');

    const result = await supabase
        .from(TABLE_NAME)
        .upsert({
            month_key: monthKey,
            trade,
            level,
            updated_by: updatedBy,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'month_key,trade',
            ignoreDuplicates: false,
        })
        .select('trade, month_key, level, updated_at')
        .single();

    if (result.error) {
        if (isFallbackError(result.error)) return fallbackResponse(res, 'upsert');
        throw new Error(result.error.message || '관리자 위험 기준 저장 실패');
    }

    return res.status(200).json({
        ok: true,
        action: 'upsert',
        item: {
            trade: String(result.data?.trade || trade),
            monthKey: String(result.data?.month_key || monthKey),
            level: String(result.data?.level || level),
            updatedAt: result.data?.updated_at || null,
        },
    });
}

async function handleDelete(supabase: any, payload: any, res: any) {
    const monthKey = normalizeMonthKey(payload?.monthKey);
    const trade = normalizeTrade(payload?.trade);

    if (!monthKey) return sendJsonError(res, 400, 'monthKey는 YYYY-MM 형식이어야 합니다.');
    if (!trade) return sendJsonError(res, 400, '공종이 필요합니다.');

    const result = await supabase
        .from(TABLE_NAME)
        .delete()
        .eq('month_key', monthKey)
        .eq('trade', trade);

    if (result.error) {
        if (isFallbackError(result.error)) return fallbackResponse(res, 'delete');
        throw new Error(result.error.message || '관리자 위험 기준 삭제 실패');
    }

    return res.status(200).json({
        ok: true,
        action: 'delete',
        deleted: true,
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

        if (!supabase) {
            return fallbackResponse(res, action || 'unknown');
        }
        if (action === 'list') return await handleList(supabase, res);
        if (action === 'upsert') return await handleUpsert(supabase, payload, res);
        if (action === 'delete') return await handleDelete(supabase, payload, res);

        return sendJsonError(res, 400, '지원하지 않는 action입니다.');
    } catch (error: any) {
        return sendJsonError(res, 500, error?.message || '관리자 위험 기준 처리 실패');
    }
}
