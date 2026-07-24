import { createClient } from '@supabase/supabase-js';
import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../lib/server/adminAuthGuard.js';
import { markSchemaCompatibilityFallback } from '../../lib/server/schemaCompatibility.js';

type SurveyRiskLevel = '상' | '중' | '하';
type BaselineSeverity = 'minor' | 'serious' | 'fatal';
type BaselineExposure = 'rare' | 'repeated' | 'continuous';
type BaselineControl = 'controlled' | 'partial' | 'weak';
type BaselineSource = 'wizard' | 'manual' | 'previous-month';

const TABLE_NAME = 'survey_risk_baselines';
const HISTORY_TABLE_NAME = 'survey_risk_baseline_history';
const ALLOWED_LEVELS = new Set<SurveyRiskLevel>(['상', '중', '하']);
const ALLOWED_SEVERITIES = new Set<BaselineSeverity>(['minor', 'serious', 'fatal']);
const ALLOWED_EXPOSURES = new Set<BaselineExposure>(['rare', 'repeated', 'continuous']);
const ALLOWED_CONTROLS = new Set<BaselineControl>(['controlled', 'partial', 'weak']);
const ALLOWED_SOURCES = new Set<BaselineSource>(['wizard', 'manual', 'previous-month']);

function getSupabaseClient() {
    const supabaseUrl =
        process.env.VITE_SUPABASE_URL
        || process.env.NEXT_PUBLIC_SUPABASE_URL
        || '';
    const serviceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY
        || process.env.SUPABASE_SERVICE_KEY
        || process.env.SERVICE_ROLE_KEY
        || '';

    if (!supabaseUrl || !serviceRoleKey) return null;

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

function normalizeBasis(raw: any, fallbackUpdatedBy = '관리자') {
    const sourceValue = String(raw?.source || 'manual').trim() as BaselineSource;
    const severityValue = String(raw?.severity || '').trim() as BaselineSeverity;
    const exposureValue = String(raw?.exposure || '').trim() as BaselineExposure;
    const controlValue = String(raw?.control || '').trim() as BaselineControl;
    return {
        severity: ALLOWED_SEVERITIES.has(severityValue) ? severityValue : null,
        exposure: ALLOWED_EXPOSURES.has(exposureValue) ? exposureValue : null,
        control: ALLOWED_CONTROLS.has(controlValue) ? controlValue : null,
        reason: String(raw?.reason || '').trim().slice(0, 500),
        source: ALLOWED_SOURCES.has(sourceValue) ? sourceValue : 'manual' as BaselineSource,
        ruleVersion: String(raw?.ruleVersion || '').trim().slice(0, 80) || 'manual-v1',
        updatedBy: String(raw?.updatedBy || fallbackUpdatedBy).trim().slice(0, 80) || '관리자',
    };
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

function isHistoryFallbackError(error: any): boolean {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return (
        code === '42P01'
        || code === 'PGRST205'
        || code === '42501'
        || message.includes(HISTORY_TABLE_NAME)
        || message.includes('permission denied')
        || message.includes('schema cache')
    );
}

function fallbackResponse(res: any, action: string) {
    markSchemaCompatibilityFallback(res, { area: `survey-risk-baselines:${action}`, reason: 'missing-or-inaccessible-schema' });
    return res.status(200).json({
        ok: true,
        action,
        mode: 'fallback-local',
        items: action === 'list' || action === 'list-history' ? [] : undefined,
    });
}

function mapHistoryRow(row: any) {
    return {
        id: String(row?.id || ''),
        monthKey: String(row?.month_key || ''),
        trade: String(row?.trade || ''),
        action: String(row?.action || ''),
        previousLevel: row?.previous_level || null,
        nextLevel: row?.next_level || null,
        basis: {
            severity: row?.severity || undefined,
            exposure: row?.exposure || undefined,
            control: row?.control_state || undefined,
            reason: String(row?.reason || ''),
            source: String(row?.source || 'manual'),
            ruleVersion: String(row?.rule_version || 'manual-v1'),
            updatedBy: String(row?.updated_by || '관리자'),
        },
        changedAt: row?.changed_at || null,
    };
}

async function loadHistoryRows(
    supabase: any,
    filters: { monthKey?: string; trade?: string; limit?: number } = {},
) {
    let query = supabase
        .from(HISTORY_TABLE_NAME)
        .select('id, month_key, trade, action, previous_level, next_level, severity, exposure, control_state, reason, source, rule_version, updated_by, changed_at')
        .order('changed_at', { ascending: false })
        .limit(Math.min(Math.max(filters.limit || 500, 1), 5000));
    if (filters.monthKey) query = query.eq('month_key', filters.monthKey);
    if (filters.trade) query = query.eq('trade', filters.trade);
    const result = await query;

    if (result.error) {
        if (isHistoryFallbackError(result.error)) return { available: false, items: [] };
        throw new Error(result.error.message || '관리자 위험 기준 변경 이력 조회 실패');
    }
    return {
        available: true,
        items: (result.data || []).map(mapHistoryRow),
    };
}

async function appendHistoryRows(supabase: any, rows: any[]): Promise<boolean> {
    if (rows.length === 0) return true;
    const result = await supabase.from(HISTORY_TABLE_NAME).insert(rows);
    if (result.error) {
        if (isHistoryFallbackError(result.error)) return false;
        throw new Error(result.error.message || '관리자 위험 기준 변경 이력 저장 실패');
    }
    return true;
}

async function loadPreviousLevel(supabase: any, monthKey: string, trade: string) {
    const result = await supabase
        .from(TABLE_NAME)
        .select('level')
        .eq('month_key', monthKey)
        .eq('trade', trade)
        .maybeSingle();
    if (result.error && !isFallbackError(result.error)) {
        throw new Error(result.error.message || '기존 관리자 위험 기준 조회 실패');
    }
    return normalizeLevel(result.data?.level);
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

    const history = await loadHistoryRows(supabase, { limit: 5000 });
    const latestBasisByKey = new Map<string, any>();
    history.items.forEach((item: any) => {
        const key = `${item.monthKey}::${item.trade}`;
        if (!latestBasisByKey.has(key) && item.nextLevel) {
            latestBasisByKey.set(key, item.basis);
        }
    });

    return res.status(200).json({
        ok: true,
        action: 'list',
        items: (result.data || []).map((row: any) => {
            const trade = String(row?.trade || '');
            const monthKey = String(row?.month_key || '');
            return {
                trade,
                monthKey,
                level: String(row?.level || ''),
                updatedAt: row?.updated_at || null,
                basis: latestBasisByKey.get(`${monthKey}::${trade}`),
            };
        }),
        historyAvailable: history.available,
    });
}

async function handleListHistory(supabase: any, payload: any, res: any) {
    const monthKey = payload?.monthKey ? normalizeMonthKey(payload.monthKey) : '';
    const trade = payload?.trade ? normalizeTrade(payload.trade) : '';
    if (payload?.monthKey && !monthKey) {
        return sendJsonError(res, 400, 'monthKey는 YYYY-MM 형식이어야 합니다.');
    }

    const history = await loadHistoryRows(supabase, {
        monthKey: monthKey || undefined,
        trade: trade || undefined,
        limit: Number(payload?.limit) || 100,
    });
    return res.status(200).json({
        ok: true,
        action: 'list-history',
        items: history.items,
        historyAvailable: history.available,
    });
}

async function handleUpsert(supabase: any, payload: any, res: any) {
    const monthKey = normalizeMonthKey(payload?.monthKey);
    const trade = normalizeTrade(payload?.trade);
    const level = normalizeLevel(payload?.level);
    const updatedBy = String(payload?.updatedBy || '').trim().slice(0, 80) || '관리자';
    const basis = normalizeBasis(payload?.basis, updatedBy);

    if (!monthKey) return sendJsonError(res, 400, 'monthKey는 YYYY-MM 형식이어야 합니다.');
    if (!trade) return sendJsonError(res, 400, '공종이 필요합니다.');
    if (!level) return sendJsonError(res, 400, '위험등급은 상·중·하 중 하나여야 합니다.');

    const previousLevel = await loadPreviousLevel(supabase, monthKey, trade);
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

    const historyAvailable = await appendHistoryRows(supabase, [{
        month_key: monthKey,
        trade,
        action: basis.source === 'previous-month' ? 'copy' : 'upsert',
        previous_level: previousLevel,
        next_level: level,
        severity: basis.severity,
        exposure: basis.exposure,
        control_state: basis.control,
        reason: basis.reason,
        source: basis.source,
        rule_version: basis.ruleVersion,
        updated_by: basis.updatedBy,
    }]);

    return res.status(200).json({
        ok: true,
        action: 'upsert',
        item: {
            trade: String(result.data?.trade || trade),
            monthKey: String(result.data?.month_key || monthKey),
            level: String(result.data?.level || level),
            updatedAt: result.data?.updated_at || null,
            basis,
        },
        historyAvailable,
    });
}

async function handleUpsertMany(supabase: any, payload: any, res: any) {
    const rawItems = Array.isArray(payload?.items) ? payload.items : [];
    if (rawItems.length > 100) {
        return sendJsonError(res, 400, '한 번에 저장할 수 있는 관리자 위험 기준은 최대 100건입니다.');
    }

    const updatedBy = String(payload?.updatedBy || '').trim().slice(0, 80) || '관리자';
    const normalizedItems = rawItems.map((item: any) => ({
        monthKey: normalizeMonthKey(item?.monthKey),
        trade: normalizeTrade(item?.trade),
        level: normalizeLevel(item?.level),
        basis: normalizeBasis(item?.basis, updatedBy),
    }));

    if (normalizedItems.length === 0) {
        return sendJsonError(res, 400, '저장할 관리자 위험 기준이 없습니다.');
    }
    if (normalizedItems.some((item) => !item.monthKey || !item.trade || !item.level)) {
        return sendJsonError(res, 400, '월·공종·위험등급 형식을 확인해 주세요.');
    }
    const uniqueKeys = new Set(normalizedItems.map((item) => `${item.monthKey}::${item.trade}`));
    if (uniqueKeys.size !== normalizedItems.length) {
        return sendJsonError(res, 400, '같은 월과 공종의 관리자 위험 기준이 중복되어 있습니다.');
    }

    const updatedAt = new Date().toISOString();
    const monthKeys = [...new Set(normalizedItems.map((item) => item.monthKey))];
    const previousResult = await supabase
        .from(TABLE_NAME)
        .select('month_key, trade, level')
        .in('month_key', monthKeys);
    if (previousResult.error && !isFallbackError(previousResult.error)) {
        throw new Error(previousResult.error.message || '기존 관리자 위험 기준 일괄 조회 실패');
    }
    const previousLevels = new Map<string, SurveyRiskLevel | null>(
        (previousResult.data || []).map((row: any) => ([
            `${String(row?.month_key || '')}::${String(row?.trade || '')}`,
            normalizeLevel(row?.level),
        ])),
    );

    const rows = normalizedItems.map((item) => ({
        month_key: item.monthKey,
        trade: item.trade,
        level: item.level,
        updated_by: updatedBy,
        updated_at: updatedAt,
    }));
    const result = await supabase
        .from(TABLE_NAME)
        .upsert(rows, {
            onConflict: 'month_key,trade',
            ignoreDuplicates: false,
        })
        .select('trade, month_key, level, updated_at');

    if (result.error) {
        if (isFallbackError(result.error)) return fallbackResponse(res, 'upsert-many');
        throw new Error(result.error.message || '관리자 위험 기준 일괄 저장 실패');
    }

    const historyAvailable = await appendHistoryRows(supabase, normalizedItems.map((item) => ({
        month_key: item.monthKey,
        trade: item.trade,
        action: item.basis.source === 'previous-month' ? 'copy' : 'upsert',
        previous_level: previousLevels.get(`${item.monthKey}::${item.trade}`) || null,
        next_level: item.level,
        severity: item.basis.severity,
        exposure: item.basis.exposure,
        control_state: item.basis.control,
        reason: item.basis.reason,
        source: item.basis.source,
        rule_version: item.basis.ruleVersion,
        updated_by: item.basis.updatedBy,
        changed_at: updatedAt,
    })));

    return res.status(200).json({
        ok: true,
        action: 'upsert-many',
        items: (result.data || []).map((row: any) => {
            const trade = String(row?.trade || '');
            const monthKey = String(row?.month_key || '');
            const input = normalizedItems.find((item) => (
                item.monthKey === monthKey && item.trade === trade
            ));
            return {
                trade,
                monthKey,
                level: String(row?.level || ''),
                updatedAt: row?.updated_at || updatedAt,
                basis: input?.basis,
            };
        }),
        historyAvailable,
    });
}

async function handleDelete(supabase: any, payload: any, res: any) {
    const monthKey = normalizeMonthKey(payload?.monthKey);
    const trade = normalizeTrade(payload?.trade);
    const updatedBy = String(payload?.updatedBy || '').trim().slice(0, 80) || '관리자';
    const basis = normalizeBasis(payload?.basis, updatedBy);

    if (!monthKey) return sendJsonError(res, 400, 'monthKey는 YYYY-MM 형식이어야 합니다.');
    if (!trade) return sendJsonError(res, 400, '공종이 필요합니다.');

    const previousLevel = await loadPreviousLevel(supabase, monthKey, trade);
    const result = await supabase
        .from(TABLE_NAME)
        .delete()
        .eq('month_key', monthKey)
        .eq('trade', trade);

    if (result.error) {
        if (isFallbackError(result.error)) return fallbackResponse(res, 'delete');
        throw new Error(result.error.message || '관리자 위험 기준 삭제 실패');
    }

    const historyAvailable = await appendHistoryRows(supabase, [{
        month_key: monthKey,
        trade,
        action: 'delete',
        previous_level: previousLevel,
        next_level: null,
        severity: basis.severity,
        exposure: basis.exposure,
        control_state: basis.control,
        reason: basis.reason || '관리자 기준 삭제',
        source: basis.source,
        rule_version: basis.ruleVersion,
        updated_by: basis.updatedBy,
    }]);

    return res.status(200).json({
        ok: true,
        action: 'delete',
        deleted: true,
        historyAvailable,
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

        if (!supabase) return fallbackResponse(res, action || 'unknown');
        if (action === 'list') return await handleList(supabase, res);
        if (action === 'list-history') return await handleListHistory(supabase, payload, res);
        if (action === 'upsert') return await handleUpsert(supabase, payload, res);
        if (action === 'upsert-many') return await handleUpsertMany(supabase, payload, res);
        if (action === 'delete') return await handleDelete(supabase, payload, res);

        return sendJsonError(res, 400, '지원하지 않는 action입니다.');
    } catch (error: any) {
        return sendJsonError(res, 500, error?.message || '관리자 위험 기준 처리 실패');
    }
}
