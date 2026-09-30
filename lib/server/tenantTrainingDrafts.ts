import { requireTenantContext, sendTenantError, TenantAccessError, type TenantContext } from './tenantAuth.js';
import type { TenantTrainingDraft } from '../../types/tenantTrainingDrafts.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const columns = 'tenant_id,id,title,site_name,source_text_ko,revision,created_at,updated_at';
const pageSize = 25;
const maxBodyBytes = 65536;
const writeRoles = ['owner', 'admin', 'reviewer'] as const;

function inputError(): never {
    throw new TenantAccessError(400, 'INVALID_TRAINING_DRAFT_INPUT', '입력 내용을 확인해 주세요.');
}

function parseBody(req: any): Record<string, unknown> {
    try {
        const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        if (!raw || Buffer.byteLength(raw, 'utf8') > maxBodyBytes) {
            throw new TenantAccessError(413, 'TRAINING_DRAFT_INPUT_TOO_LARGE', '입력 내용이 너무 큽니다. 내용을 줄여 주세요.');
        }
        const body = JSON.parse(raw);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return inputError();
        return body;
    } catch (error) {
        if (error instanceof TenantAccessError) throw error;
        return inputError();
    }
}

function text(value: unknown, max: number, min = 1): string {
    if (typeof value !== 'string' || value.length > max || value.trim().length < min) return inputError();
    return value.trim();
}

function databaseError(error: any): never {
    if (error?.code === '42501') throw new TenantAccessError(403, 'ROLE_FORBIDDEN', '이 작업을 수행할 권한이 없습니다.');
    throw new TenantAccessError(503, 'TRAINING_DRAFT_STORAGE_UNAVAILABLE', '기업별 교육 초안 보관을 사용할 수 없습니다. 운영 관리자에게 문의해 주세요.');
}

function toDraft(row: any, tenantId: string): TenantTrainingDraft {
    if (!row || row.tenant_id !== tenantId || typeof row.id !== 'string' || !uuid.test(row.id)
        || !Number.isSafeInteger(row.revision) || row.revision < 1) {
        throw new TenantAccessError(503, 'TRAINING_DRAFT_STORAGE_UNAVAILABLE', '교육 초안 기록을 확인할 수 없습니다.');
    }
    return { id: row.id, title: row.title, siteName: row.site_name, sourceTextKo: row.source_text_ko,
        revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at };
}

function parseCursor(value: unknown): { createdAt: string; id: string } | null {
    if (value === undefined) return null;
    if (typeof value !== 'string' || value.length > 300 || !/^[A-Za-z0-9_-]+$/.test(value)) return inputError();
    try {
        const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
        // Keep PostgreSQL microseconds intact for stable keyset pagination; never interpolate arbitrary filters.
        if (typeof cursor.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(cursor.createdAt)
            || !Number.isFinite(Date.parse(cursor.createdAt)) || typeof cursor.id !== 'string' || !uuid.test(cursor.id)) return inputError();
        return cursor;
    } catch { return inputError(); }
}

async function list(context: TenantContext, req: any) {
    const cursor = parseCursor(req.query?.cursor);
    let query = context.client.from('psi_tenant_training_drafts').select(columns).eq('tenant_id', context.tenantId)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize + 1);
    if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    const { data, error } = await query;
    if (error) databaseError(error);
    const items = (data || []).slice(0, pageSize).map(row => toDraft(row, context.tenantId));
    const last = items[items.length - 1];
    const nextCursor = (data || []).length > pageSize && last
        ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString('base64url') : null;
    return { ok: true, items, nextCursor };
}

async function detail(context: TenantContext, id: unknown) {
    if (typeof id !== 'string' || !uuid.test(id)) return inputError();
    const { data, error } = await context.client.from('psi_tenant_training_drafts').select(columns)
        .eq('tenant_id', context.tenantId).eq('id', id).maybeSingle();
    if (error) databaseError(error);
    if (!data) throw new TenantAccessError(404, 'TRAINING_DRAFT_NOT_FOUND', '교육 초안 기록을 찾을 수 없습니다.');
    const item = toDraft(data, context.tenantId);
    const { data: events, error: eventError } = await context.client.from('psi_tenant_training_draft_events')
        .select('tenant_id,draft_id,draft_revision,title,site_name,source_text_ko,occurred_at')
        .eq('tenant_id', context.tenantId).eq('draft_id', id).order('draft_revision', { ascending: false }).limit(101);
    if (eventError) databaseError(eventError);
    if ((events || []).some(event => event.tenant_id !== context.tenantId || event.draft_id !== id)) databaseError(null);
    return { ok: true, item, historyLimited: (events || []).length > 100, events: (events || []).slice(0, 100).map(event => ({
        revision: event.draft_revision, title: event.title, siteName: event.site_name, sourceTextKo: event.source_text_ko, occurredAt: event.occurred_at,
    })) };
}

async function create(context: TenantContext, body: Record<string, unknown>) {
    if (Object.keys(body).some(key => !['requestId', 'title', 'siteName', 'sourceTextKo'].includes(key))) return inputError();
    if (typeof body.requestId !== 'string' || !uuid.test(body.requestId)) return inputError();
    const values = { tenant_id: context.tenantId, request_id: body.requestId,
        title: text(body.title, 200), site_name: text(body.siteName, 200), source_text_ko: text(body.sourceTextKo, 10000) };
    const { data, error } = await context.client.from('psi_tenant_training_drafts').insert(values).select(columns).single();
    if (!error) return { item: toDraft(data, context.tenantId), replayed: false };
    if (error.code !== '23505') databaseError(error);
    // A retry can only recover this user's own request and exactly the original submitted content.
    const existing = await context.client.from('psi_tenant_training_drafts').select(columns)
        .eq('tenant_id', context.tenantId).eq('request_id', body.requestId).eq('created_by', context.userId).maybeSingle();
    if (existing.error) databaseError(existing.error);
    if (!existing.data || ['title', 'site_name', 'source_text_ko'].some(key => existing.data[key] !== values[key])) {
        throw new TenantAccessError(409, 'TRAINING_DRAFT_REQUEST_CONFLICT', '등록 결과가 변경되었습니다. 목록에서 기존 기록을 확인해 주세요.');
    }
    return { item: toDraft(existing.data, context.tenantId), replayed: true };
}

async function update(context: TenantContext, body: Record<string, unknown>) {
    if (Object.keys(body).some(key => !['id', 'expectedRevision', 'title', 'siteName', 'sourceTextKo'].includes(key))) return inputError();
    if (typeof body.id !== 'string' || !uuid.test(body.id) || !Number.isSafeInteger(body.expectedRevision)
        || Number(body.expectedRevision) < 1 || Number(body.expectedRevision) > 2147483646) return inputError();
    const patch: Record<string, unknown> = {};
    if ('title' in body) patch.title = text(body.title, 200);
    if ('siteName' in body) patch.site_name = text(body.siteName, 200);
    if ('sourceTextKo' in body) patch.source_text_ko = text(body.sourceTextKo, 10000);
    if (!Object.keys(patch).length) return inputError();
    const { data, error } = await context.client.from('psi_tenant_training_drafts').update(patch)
        .eq('tenant_id', context.tenantId).eq('id', body.id).eq('revision', body.expectedRevision).select(columns).maybeSingle();
    if (error) databaseError(error);
    if (!data) throw new TenantAccessError(409, 'TRAINING_DRAFT_REVISION_CONFLICT', '다른 사용자가 변경했거나 접근 권한이 바뀌었습니다. 목록을 다시 확인해 주세요.');
    return toDraft(data, context.tenantId);
}

export default async function tenantTrainingDrafts(req: any, res: any) {
    if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST, PATCH');
        return res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' });
    }
    try {
        const context = await requireTenantContext(req, req.method === 'GET' ? undefined : writeRoles);
        if (req.method === 'GET') return res.status(200).json(req.query?.id !== undefined
            ? await detail(context, req.query.id) : await list(context, req));
        const body = parseBody(req);
        if (req.method === 'POST') {
            const result = await create(context, body);
            return res.status(result.replayed ? 200 : 201).json({ ok: true, ...result });
        }
        return res.status(200).json({ ok: true, item: await update(context, body) });
    } catch (error) { return sendTenantError(res, error); }
}
