import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../lib/server/adminAuthGuard.js';
import { createSupabaseServerClient } from '../../lib/server/supabaseServer.js';

export type RecordMasterAction =
    | 'list'
    | 'create-template'
    | 'delete-template'
    | 'create-group'
    | 'delete-group'
    | 'upsert-assignment'
    | 'delete-assignment'
    | 'set-assignment-status';

type AssignmentStatus = 'active' | 'inactive';

type RecordMasterTemplateRow = {
    id?: unknown;
    name?: unknown;
    version?: unknown;
    field_schema?: unknown;
    updated_at?: unknown;
};

type RecordMasterGroupRow = {
    id?: unknown;
    name?: unknown;
    updated_at?: unknown;
};

type RecordMasterAssignmentRow = {
    id?: unknown;
    group_id?: unknown;
    company_id?: unknown;
    template_id?: unknown;
    status?: unknown;
    effective_date?: unknown;
    updated_at?: unknown;
};

type SupabaseErrorLike = {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
};

class RecordMasterHttpError extends Error {
    statusCode: number;
    code: string;

    constructor(message: string, statusCode: number, code: string) {
        super(message);
        this.name = 'RecordMasterHttpError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const ACTIONS = new Set<RecordMasterAction>([
    'list',
    'create-template',
    'delete-template',
    'create-group',
    'delete-group',
    'upsert-assignment',
    'delete-assignment',
    'set-assignment-status',
]);

const toObject = (value: unknown): Record<string, unknown> => (
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
);

const normalizeBoundedText = (
    value: unknown,
    label: string,
    maxLength: number,
): string => {
    const normalized = String(value || '').trim().replace(/\s+/g, ' ');
    if (!normalized) {
        throw new RecordMasterHttpError(`${label}을(를) 입력해 주세요.`, 400, 'INVALID_INPUT');
    }
    if (normalized.length > maxLength) {
        throw new RecordMasterHttpError(`${label}은(는) ${maxLength}자 이하여야 합니다.`, 400, 'INVALID_INPUT');
    }
    return normalized;
};

const normalizeFieldSchema = (value: unknown): string => {
    const normalized = String(value || '').trim();
    if (!normalized) {
        throw new RecordMasterHttpError('필드 구성을 입력해 주세요.', 400, 'INVALID_INPUT');
    }
    if (normalized.length > 100_000) {
        throw new RecordMasterHttpError('필드 구성은 100,000자 이하여야 합니다.', 400, 'INVALID_INPUT');
    }
    return normalized;
};

const normalizeUuid = (value: unknown, label: string): string => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(normalized)) {
        throw new RecordMasterHttpError(`${label} 형식이 올바르지 않습니다.`, 400, 'INVALID_INPUT');
    }
    return normalized;
};

const normalizeDate = (value: unknown): string => {
    const normalized = String(value || '').trim();
    if (!DATE_PATTERN.test(normalized)) {
        throw new RecordMasterHttpError('적용일은 YYYY-MM-DD 형식이어야 합니다.', 400, 'INVALID_INPUT');
    }

    const [year, month, day] = normalized.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day
    ) {
        throw new RecordMasterHttpError('적용일이 실제 달력 날짜와 일치하지 않습니다.', 400, 'INVALID_INPUT');
    }
    return normalized;
};

const normalizeStatus = (value: unknown): AssignmentStatus => {
    if (value !== 'active' && value !== 'inactive') {
        throw new RecordMasterHttpError('배정 상태가 올바르지 않습니다.', 400, 'INVALID_INPUT');
    }
    return value;
};

const isMissingRelationError = (error: SupabaseErrorLike | null | undefined): boolean => {
    if (!error) return false;
    const code = String(error.code || '').toUpperCase();
    const message = String(error.message || '').toLowerCase();
    return (
        code === '42P01'
        || code === 'PGRST205'
        || message.includes('could not find the table')
        || message.includes('relation') && message.includes('does not exist')
    );
};

const isMissingGroupColumnError = (error: SupabaseErrorLike | null | undefined): boolean => {
    if (!error) return false;
    const code = String(error.code || '').toUpperCase();
    const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
    return (
        code === '42703'
        || code === 'PGRST204'
        || code === '42P10'
        || message.includes('group_id') && (
            message.includes('does not exist')
            || message.includes('schema cache')
            || message.includes('unique or exclusion constraint')
        )
    );
};

const throwDatabaseError = (error: SupabaseErrorLike | null | undefined, fallbackMessage: string): never => {
    const code = String(error?.code || '').toUpperCase();
    if (code === '23505') {
        throw new RecordMasterHttpError('동일한 항목이 이미 등록되어 있습니다.', 409, 'DUPLICATE_RECORD');
    }
    if (code === '23503') {
        throw new RecordMasterHttpError('연결된 자료가 있어 요청을 처리할 수 없습니다.', 409, 'RELATED_RECORD_CONFLICT');
    }
    if (code === 'PGRST116') {
        throw new RecordMasterHttpError('대상 자료를 찾을 수 없습니다.', 404, 'RECORD_NOT_FOUND');
    }
    if (isMissingRelationError(error)) {
        throw new RecordMasterHttpError('기록 마스터 데이터베이스 구성이 준비되지 않았습니다.', 503, 'RECORD_MASTER_SCHEMA_MISSING');
    }
    throw new RecordMasterHttpError(fallbackMessage, 500, 'RECORD_MASTER_DATABASE_ERROR');
};

const mapTemplate = (row: RecordMasterTemplateRow) => ({
    id: String(row.id || ''),
    name: String(row.name || ''),
    version: String(row.version || ''),
    fieldSchema: String(row.field_schema || ''),
    updatedAt: String(row.updated_at || ''),
});

const mapGroup = (row: RecordMasterGroupRow) => ({
    id: String(row.id || ''),
    name: String(row.name || ''),
    updatedAt: String(row.updated_at || ''),
});

const mapAssignment = (row: RecordMasterAssignmentRow) => ({
    id: String(row.id || ''),
    groupId: String(row.group_id || row.company_id || ''),
    templateId: String(row.template_id || ''),
    status: row.status === 'inactive' ? 'inactive' as const : 'active' as const,
    effectiveDate: String(row.effective_date || ''),
    updatedAt: String(row.updated_at || ''),
});

const fetchGroups = async (supabase: any) => {
    const primary = await supabase
        .from('record_master_groups')
        .select('id, name, updated_at')
        .order('updated_at', { ascending: false });
    if (!primary.error) return primary;
    if (!isMissingRelationError(primary.error)) return primary;

    return supabase
        .from('record_master_companies')
        .select('id, name, updated_at')
        .order('updated_at', { ascending: false });
};

const fetchAssignments = async (supabase: any) => {
    const primary = await supabase
        .from('record_master_assignment_groups')
        .select('id, group_id, template_id, status, effective_date, updated_at')
        .order('updated_at', { ascending: false });
    if (!primary.error) return primary;
    if (!isMissingRelationError(primary.error)) return primary;

    const groupColumn = await supabase
        .from('record_master_assignments')
        .select('id, group_id, template_id, status, effective_date, updated_at')
        .order('updated_at', { ascending: false });
    if (!groupColumn.error) return groupColumn;
    if (!isMissingRelationError(groupColumn.error) && String(groupColumn.error?.code || '') !== '42703') {
        return groupColumn;
    }

    return supabase
        .from('record_master_assignments')
        .select('id, company_id, template_id, status, effective_date, updated_at')
        .order('updated_at', { ascending: false });
};

const handleList = async (supabase: any) => {
    const [templatesResult, groupsResult, assignmentsResult] = await Promise.all([
        supabase
            .from('record_master_templates')
            .select('id, name, version, field_schema, updated_at')
            .order('updated_at', { ascending: false }),
        fetchGroups(supabase),
        fetchAssignments(supabase),
    ]);

    if (templatesResult.error) throwDatabaseError(templatesResult.error, '템플릿 목록을 불러오지 못했습니다.');
    if (groupsResult.error) throwDatabaseError(groupsResult.error, '그룹 목록을 불러오지 못했습니다.');
    if (assignmentsResult.error) throwDatabaseError(assignmentsResult.error, '배정 목록을 불러오지 못했습니다.');

    return {
        templates: (templatesResult.data || []).map(mapTemplate),
        groups: (groupsResult.data || []).map(mapGroup),
        assignments: (assignmentsResult.data || []).map(mapAssignment),
    };
};

const insertGroup = async (supabase: any, name: string) => {
    const primary = await supabase
        .from('record_master_groups')
        .insert({ name })
        .select('id, name, updated_at')
        .single();
    if (!primary.error) return primary;
    if (!isMissingRelationError(primary.error)) return primary;

    return supabase
        .from('record_master_companies')
        .insert({ name })
        .select('id, name, updated_at')
        .single();
};

const deleteGroup = async (supabase: any, groupId: string) => {
    const primary = await supabase
        .from('record_master_groups')
        .delete()
        .eq('id', groupId)
        .select('id')
        .maybeSingle();
    if (!primary.error) return primary;
    if (!isMissingRelationError(primary.error)) return primary;

    return supabase
        .from('record_master_companies')
        .delete()
        .eq('id', groupId)
        .select('id')
        .maybeSingle();
};

export const executeRecordMasterAction = async (
    supabase: any,
    action: RecordMasterAction,
    rawPayload: unknown,
): Promise<unknown> => {
    const payload = toObject(rawPayload);

    if (action === 'list') {
        return handleList(supabase);
    }

    if (action === 'create-template') {
        const name = normalizeBoundedText(payload.name, '템플릿명', 120);
        const version = normalizeBoundedText(payload.version, '버전', 40);
        const fieldSchema = normalizeFieldSchema(payload.fieldSchema);
        const result = await supabase
            .from('record_master_templates')
            .insert({ name, version, field_schema: fieldSchema })
            .select('id, name, version, field_schema, updated_at')
            .single();
        if (result.error) throwDatabaseError(result.error, '템플릿을 생성하지 못했습니다.');
        return { template: mapTemplate(result.data || {}) };
    }

    if (action === 'delete-template') {
        const templateId = normalizeUuid(payload.templateId, '템플릿 ID');
        const result = await supabase
            .from('record_master_templates')
            .delete()
            .eq('id', templateId)
            .select('id')
            .maybeSingle();
        if (result.error) throwDatabaseError(result.error, '템플릿을 삭제하지 못했습니다.');
        if (!result.data) throw new RecordMasterHttpError('대상 템플릿을 찾을 수 없습니다.', 404, 'RECORD_NOT_FOUND');
        return { templateId };
    }

    if (action === 'create-group') {
        const name = normalizeBoundedText(payload.name, '그룹명', 120);
        const result = await insertGroup(supabase, name);
        if (result.error) throwDatabaseError(result.error, '그룹을 생성하지 못했습니다.');
        return { group: mapGroup(result.data || {}) };
    }

    if (action === 'delete-group') {
        const groupId = normalizeUuid(payload.groupId, '그룹 ID');
        const result = await deleteGroup(supabase, groupId);
        if (result.error) throwDatabaseError(result.error, '그룹을 삭제하지 못했습니다.');
        if (!result.data) throw new RecordMasterHttpError('대상 그룹을 찾을 수 없습니다.', 404, 'RECORD_NOT_FOUND');
        return { groupId };
    }

    if (action === 'upsert-assignment') {
        const groupId = normalizeUuid(payload.groupId, '그룹 ID');
        const templateId = normalizeUuid(payload.templateId, '템플릿 ID');
        const effectiveDate = normalizeDate(payload.effectiveDate);
        const primaryResult = await supabase
            .from('record_master_assignments')
            .upsert(
                {
                    group_id: groupId,
                    template_id: templateId,
                    status: 'active',
                    effective_date: effectiveDate,
                },
                { onConflict: 'group_id,template_id' },
            )
            .select('id, group_id, template_id, status, effective_date, updated_at')
            .single();
        const result = primaryResult.error && isMissingGroupColumnError(primaryResult.error)
            ? await supabase
                .from('record_master_assignments')
                .upsert(
                    {
                        company_id: groupId,
                        template_id: templateId,
                        status: 'active',
                        effective_date: effectiveDate,
                    },
                    { onConflict: 'company_id,template_id' },
                )
                .select('id, company_id, template_id, status, effective_date, updated_at')
                .single()
            : primaryResult;
        if (result.error) throwDatabaseError(result.error, '배정을 저장하지 못했습니다.');
        return { assignment: mapAssignment(result.data || {}) };
    }

    if (action === 'delete-assignment') {
        const assignmentId = normalizeUuid(payload.assignmentId, '배정 ID');
        const result = await supabase
            .from('record_master_assignments')
            .delete()
            .eq('id', assignmentId)
            .select('id')
            .maybeSingle();
        if (result.error) throwDatabaseError(result.error, '배정을 삭제하지 못했습니다.');
        if (!result.data) throw new RecordMasterHttpError('대상 배정을 찾을 수 없습니다.', 404, 'RECORD_NOT_FOUND');
        return { assignmentId };
    }

    const assignmentId = normalizeUuid(payload.assignmentId, '배정 ID');
    const status = normalizeStatus(payload.status);
    const primaryResult = await supabase
        .from('record_master_assignments')
        .update({ status })
        .eq('id', assignmentId)
        .select('id, group_id, template_id, status, effective_date, updated_at')
        .maybeSingle();
    const result = primaryResult.error && isMissingGroupColumnError(primaryResult.error)
        ? await supabase
            .from('record_master_assignments')
            .update({ status })
            .eq('id', assignmentId)
            .select('id, company_id, template_id, status, effective_date, updated_at')
            .maybeSingle()
        : primaryResult;
    if (result.error) throwDatabaseError(result.error, '배정 상태를 변경하지 못했습니다.');
    if (!result.data) throw new RecordMasterHttpError('대상 배정을 찾을 수 없습니다.', 404, 'RECORD_NOT_FOUND');
    return { assignment: mapAssignment(result.data) };
};

const parseRequestBody = (body: unknown): Record<string, unknown> => {
    if (typeof body === 'string') {
        try {
            return toObject(JSON.parse(body || '{}'));
        } catch {
            throw new RecordMasterHttpError('요청 본문 형식이 올바르지 않습니다.', 400, 'INVALID_JSON');
        }
    }
    return toObject(body);
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' });
    }
    if (!isValidAdminAuthRequest(req)) {
        return sendUnauthorizedAdminResponse(res);
    }

    let action = '';
    try {
        const body = parseRequestBody(req.body);
        action = String(body.action || '').trim();
        if (!ACTIONS.has(action as RecordMasterAction)) {
            throw new RecordMasterHttpError('지원하지 않는 기록 마스터 요청입니다.', 400, 'INVALID_ACTION');
        }

        const supabase = createSupabaseServerClient({
            includeAdminSecret: false,
            errorMessage: '기록 마스터 서버 연결값이 누락되었습니다. SUPABASE_SERVICE_ROLE_KEY를 확인해 주세요.',
        });
        const data = await executeRecordMasterAction(
            supabase,
            action as RecordMasterAction,
            body.payload,
        );
        return res.status(200).json({ ok: true, action, data });
    } catch (error: any) {
        const statusCode = error instanceof RecordMasterHttpError
            ? error.statusCode
            : 500;
        const code = error instanceof RecordMasterHttpError
            ? error.code
            : 'RECORD_MASTER_UNEXPECTED_ERROR';
        const message = error instanceof RecordMasterHttpError
            ? error.message
            : '기록 마스터 요청을 처리하지 못했습니다.';
        const logFailure = statusCode >= 500 ? console.error : console.warn;
        logFailure('[record-master] request failed', {
            action: action || 'unknown',
            statusCode,
            code,
        });
        return res.status(statusCode).json({ ok: false, code, message });
    }
}
