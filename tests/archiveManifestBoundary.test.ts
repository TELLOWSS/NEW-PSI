import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    isValidAdminAuthRequest: vi.fn(() => true),
    createSupabaseServerClient: vi.fn(),
    postAdminJson: vi.fn(),
}));

vi.mock('../lib/server/adminAuthGuard.js', () => ({
    isValidAdminAuthRequest: mocks.isValidAdminAuthRequest,
    sendUnauthorizedAdminResponse: (res: any) => res.status(401).json({ ok: false, code: 'UNAUTHORIZED' }),
}));
vi.mock('../lib/server/supabaseServer.js', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock('../utils/adminApiClient', () => ({ postAdminJson: mocks.postAdminJson }));

import handler, {
    executeArchiveManifestAction,
    MAX_ARCHIVE_REQUEST_BYTES,
    MAX_WORKER_SUMMARIES,
    resolveArchiveScope,
} from '../api/admin/archive-manifest';
import {
    MONTHLY_ARCHIVE_RECEIPT_LIMITS,
    registerMonthlyArchiveReceipt,
} from '../services/archiveManifestService';

const scope = { organizationId: 'company-one', siteId: 'site-one' };
const hash = 'a'.repeat(64);
const makeManifest = (overrides: Record<string, unknown> = {}) => ({
    schemaVersion: 'psi-monthly-archive/v3' as const,
    archiveId: `2026-08-g001-${hash.slice(0, 16)}`,
    periodMonth: '2026-08', generation: 1,
    createdAt: '2026-09-01T00:00:00.000Z', verifiedAt: '2026-09-01T00:01:00.000Z',
    recordCount: 2, workerCount: 1, portableWorkerCount: 1, unresolvedWorkerCount: 0,
    minDate: '2026-08-01', maxDate: '2026-08-31', contentRootHash: hash,
    ...overrides,
});
const makeSummary = (overrides: Record<string, unknown> = {}) => ({
    workerUuid: 'WP-0123456789ABCDEF0123456789ABCDEF',
    assessmentCount: 2, firstAssessmentDate: '2026-08-01', lastAssessmentDate: '2026-08-31',
    averageScore: 80, minimumScore: 70, latestScore: 90, latestSafetyLevel: '고급' as const,
    attentionCount: 0, approvedCount: 2,
    ...overrides,
});
const makePayload = () => ({ manifest: makeManifest(), workerSummaries: [makeSummary()] });
const makeResponse = () => {
    const value = { statusCode: 0, body: null as any, headers: {} as Record<string, string> };
    const res = {
        setHeader(key: string, header: string) { value.headers[key] = header; return this; },
        status(code: number) { value.statusCode = code; return this; },
        json(body: unknown) { value.body = body; return body; },
    };
    return { res, value };
};
const makeRequest = (payload: unknown = makePayload()) => ({
    method: 'POST', headers: {} as Record<string, string>, body: { action: 'register', payload } as any,
});
const makeDatabase = () => {
    const query: any = {};
    for (const method of ['select', 'eq', 'order', 'limit']) query[method] = vi.fn(() => query);
    query.then = (done: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 3 }).then(done);
    const db = {
        rpc: vi.fn(async (_name: string, args: any) => ({
            error: null,
            data: [{ ...args.p_manifest, worker_summary_count: args.p_worker_summaries.length,
                continuity_is_current: true, received_at: '2026-09-01T00:01:01.000Z' }],
        })),
        from: vi.fn(() => query),
    };
    return { db, query };
};

describe('monthly archive server receipt boundary', () => {
    beforeEach(() => {
        vi.stubEnv('PSI_ORGANIZATION_ID', scope.organizationId);
        vi.stubEnv('PSI_SITE_ID', scope.siteId);
        mocks.isValidAdminAuthRequest.mockReturnValue(true);
        mocks.createSupabaseServerClient.mockReturnValue(makeDatabase().db);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });

    it('requires both trusted server scope values and never falls back to a shared tenant', async () => {
        expect(() => resolveArchiveScope({})).toThrowError(/PSI_ORGANIZATION_ID/);
        expect(() => resolveArchiveScope({ PSI_ORGANIZATION_ID: 'company-one' })).toThrowError(/PSI_SITE_ID/);
        expect(() => resolveArchiveScope({ PSI_ORGANIZATION_ID: '../company', PSI_SITE_ID: 'site' })).toThrow();
        await expect(executeArchiveManifestAction(null, 'health', {}, { ...scope, siteId: '' }))
            .rejects.toMatchObject({ statusCode: 503, code: 'ARCHIVE_SCOPE_MISSING' });
        vi.stubEnv('PSI_SITE_ID', '');
        const req = makeRequest(); const { res, value } = makeResponse();
        await handler(req, res);
        expect(value.statusCode).toBe(503);
        expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
        expect(req.body).toBeUndefined();
    });

    it('checks admin authentication before allocating a service-role client', async () => {
        mocks.isValidAdminAuthRequest.mockReturnValue(false);
        const req = makeRequest(); const { res, value } = makeResponse();
        await handler(req, res);
        expect(value.statusCode).toBe(401);
        expect(value.headers['Cache-Control']).toBe('no-store');
        expect(req.body).toBeUndefined();
        expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    });

    it('only accepts POST and clears the request body even on method rejection', async () => {
        const req = { ...makeRequest(), method: 'GET' }; const { res, value } = makeResponse();
        await handler(req, res);
        expect(value.statusCode).toBe(405);
        expect(req.body).toBeUndefined();
        expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    });

    it('registers only fixed aggregates under the server-owned organization and site', async () => {
        const { db } = makeDatabase();
        const result: any = await executeArchiveManifestAction(db, 'register', makePayload(), scope);
        expect(db.rpc).toHaveBeenCalledOnce();
        expect(db.rpc).toHaveBeenCalledWith('psi_register_monthly_archive', expect.objectContaining({
            p_organization_id: scope.organizationId, p_site_id: scope.siteId,
            p_manifest: expect.objectContaining({
                archive_id: makeManifest().archiveId,
                file_name: `PSI_${makeManifest().archiveId}.json`,
                byte_size: null,
            }),
        }));
        expect(result.receipt).toMatchObject({ workerSummaryCount: 1, continuityCurrent: true });
        expect(result.limits).toEqual(MONTHLY_ARCHIVE_RECEIPT_LIMITS);
    });

    it.each([
        ['raw records', { ...makePayload(), records: [{ name: 'private' }] }, 'SENSITIVE_FIELD_REJECTED'],
        ['client tenant', { ...makePayload(), organizationId: 'other-company' }, 'UNEXPECTED_FIELD'],
        ['local filename', { ...makePayload(), manifest: { ...makeManifest(), fileName: '홍길동_개인정보.json' } }, 'UNEXPECTED_FIELD'],
        ['manifest text', { ...makePayload(), manifest: { ...makeManifest(), documentText: 'secret text' } }, 'SENSITIVE_FIELD_REJECTED'],
        ['worker phone', { ...makePayload(), workerSummaries: [{ ...makeSummary(), phone_number: 'private' }] }, 'SENSITIVE_FIELD_REJECTED'],
        ['worker image', { ...makePayload(), workerSummaries: [{ ...makeSummary(), image: 'data:image/png;base64,secret' }] }, 'SENSITIVE_FIELD_REJECTED'],
    ])('rejects %s before the database can persist it', async (_label, payload, code) => {
        const { db } = makeDatabase();
        await expect(executeArchiveManifestAction(db, 'register', payload, scope)).rejects.toMatchObject({ statusCode: 400, code });
        expect(db.rpc).not.toHaveBeenCalled();
    });

    it.each([
        { archiveId: 'private-worker-name' }, { periodMonth: '2026-13' }, { minDate: '2026-08-32' },
        { verifiedAt: undefined }, { verifiedAt: '2026-08-31T00:00:00Z' },
        { generation: 1.1 }, { recordCount: '2' }, { contentRootHash: 'not-a-hash' },
        { portableWorkerCount: 0 },
    ])('rejects malformed or unverified manifest %j', async (overrides) => {
        const { db } = makeDatabase();
        await expect(executeArchiveManifestAction(db, 'register', {
            ...makePayload(), manifest: makeManifest(overrides),
        }, scope)).rejects.toMatchObject({ statusCode: 400 });
        expect(db.rpc).not.toHaveBeenCalled();
    });

    it.each([
        { workerUuid: 'WN-name-derived-id' }, { workerUuid: 'WU-EMP-display-only' },
        { workerUuid: 'WU-QR-display-only' }, { firstAssessmentDate: '2026-07-31' },
        { lastAssessmentDate: '2026-08-00' }, { minimumScore: 99 },
        { approvedCount: 3 }, { assessmentCount: 3 }, { averageScore: 80.5 },
        { latestSafetyLevel: 'arbitrary private text' },
    ])('rejects invalid worker aggregates %j', async (overrides) => {
        const { db } = makeDatabase();
        await expect(executeArchiveManifestAction(db, 'register', {
            ...makePayload(), workerSummaries: [makeSummary(overrides)],
        }, scope)).rejects.toMatchObject({ statusCode: 400 });
        expect(db.rpc).not.toHaveBeenCalled();
    });

    it('rejects dates outside the actual manifest range and case-insensitive duplicate IDs', async () => {
        await expect(executeArchiveManifestAction(null, 'register', {
            ...makePayload(), manifest: makeManifest({ minDate: '2026-08-02' }),
        }, scope)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(executeArchiveManifestAction(null, 'register', {
            manifest: makeManifest({ recordCount: 4, workerCount: 2, portableWorkerCount: 2 }),
            workerSummaries: [makeSummary(), makeSummary({ workerUuid: makeSummary().workerUuid.toLowerCase() })],
        }, scope)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('accepts zero portable identities without inventing a name-based identity', async () => {
        const { db } = makeDatabase();
        await executeArchiveManifestAction(db, 'register', {
            manifest: makeManifest({ portableWorkerCount: 0, unresolvedWorkerCount: 1 }), workerSummaries: [],
        }, scope);
        expect(db.rpc.mock.calls[0][1].p_worker_summaries).toEqual([]);
    });

    it('requires the summaries to cover every record when no identity is unresolved', async () => {
        await expect(executeArchiveManifestAction(null, 'register', {
            ...makePayload(), manifest: makeManifest({ recordCount: 10 }),
        }, scope)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(executeArchiveManifestAction(null, 'register', {
            ...makePayload(), manifest: makeManifest({ workerCount: 2, unresolvedWorkerCount: 1 }),
        }, scope)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('supports a 5,000-worker fixed summary receipt without exceeding the 2 MiB ceiling', async () => {
        const payload = {
            manifest: makeManifest({ recordCount: 10000, workerCount: 5000, portableWorkerCount: 5000 }),
            workerSummaries: Array.from({ length: MAX_WORKER_SUMMARIES }, (_, i) => makeSummary({
                workerUuid: `WP-${String(i).padStart(92, '0')}`,
            })),
        };
        const req = makeRequest(payload); const { res, value } = makeResponse();
        expect(Buffer.byteLength(JSON.stringify(req.body))).toBeLessThan(MAX_ARCHIVE_REQUEST_BYTES);
        await handler(req, res);
        expect(value.statusCode).toBe(200);
    });

    it('rejects the worker count ceiling with a local-backup-preserving message', async () => {
        const req = makeRequest({
            manifest: makeManifest({ recordCount: 10002, workerCount: 5001, portableWorkerCount: 5001 }),
            workerSummaries: Array.from({ length: 5001 }, (_, i) => makeSummary({ workerUuid: `WP-${i}` })),
        });
        const { res, value } = makeResponse();
        await handler(req, res);
        expect(value).toMatchObject({ statusCode: 413, body: { code: 'TOO_MANY_WORKER_SUMMARIES', limits: MONTHLY_ARCHIVE_RECEIPT_LIMITS } });
        expect(value.body.message).toContain('PC 백업은 유지');
    });

    it.each(['parsed', 'string', 'header'])('enforces actual UTF-8 byte size for a %s body', async (kind) => {
        const req = makeRequest();
        if (kind === 'header') req.headers['content-length'] = String(MAX_ARCHIVE_REQUEST_BYTES + 1);
        else {
            req.body = { action: 'register', payload: { fullText: '가'.repeat(Math.ceil(MAX_ARCHIVE_REQUEST_BYTES / 3)) } };
            if (kind === 'string') req.body = JSON.stringify(req.body);
        }
        const { res, value } = makeResponse();
        await handler(req, res);
        expect(value).toMatchObject({ statusCode: 413, body: { code: 'PAYLOAD_TOO_LARGE' } });
        expect(req.body).toBeUndefined();
        expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    });

    it('does not echo or log an untrusted action string', async () => {
        const req = makeRequest(); req.body.action = 'private-worker-name';
        const { res, value } = makeResponse(); await handler(req, res);
        expect(value.statusCode).toBe(400);
        expect(JSON.stringify(value)).not.toContain('private-worker-name');
        expect(console.warn).toHaveBeenCalledWith('[archive-manifest] request failed', expect.objectContaining({ action: 'unknown' }));
        expect(req.body).toBeUndefined();
    });

    it('handles invalid JSON and rejects unknown body keys', async () => {
        for (const body of ['{', { action: 'health', siteId: 'another-site' }]) {
            const req = makeRequest(); req.body = body;
            const { res, value } = makeResponse(); await handler(req, res);
            expect(value.statusCode).toBe(400); expect(req.body).toBeUndefined();
        }
    });

    it.each([
        [{ code: '23505', message: 'duplicate key violates risk_archive_manifests_generation_unique' }, 409, 'ARCHIVE_GENERATION_CONFLICT'],
        [{ code: 'PGRST202', message: 'missing function' }, 503, 'ARCHIVE_SCHEMA_MISSING'],
        [{ code: '42501', message: 'permission denied for risk_archive_manifests' }, 500, 'ARCHIVE_DATABASE_ERROR'],
        [{ code: '22007', message: 'invalid timestamp' }, 400, 'INVALID_INPUT'],
    ])('maps database failures accurately without treating all table errors as missing schema', async (error, statusCode, code) => {
        const db = { rpc: vi.fn(async () => ({ error, data: null })) };
        await expect(executeArchiveManifestAction(db, 'register', makePayload(), scope)).rejects.toMatchObject({ statusCode, code });
    });

    it('scopes list and health queries by both trusted dimensions and reports actual limits', async () => {
        const { db, query } = makeDatabase();
        const health: any = await executeArchiveManifestAction(db, 'health', {}, scope);
        expect(health).toMatchObject({ available: true, receiptCount: 3, limits: MONTHLY_ARCHIVE_RECEIPT_LIMITS });
        await executeArchiveManifestAction(db, 'list', { periodMonth: '2026-08', limit: 12 }, scope);
        expect(query.eq).toHaveBeenCalledWith('organization_id', scope.organizationId);
        expect(query.eq).toHaveBeenCalledWith('site_id', scope.siteId);
        expect(query.eq).toHaveBeenCalledWith('period_month', '2026-08');
        expect(query.limit).toHaveBeenCalledWith(12);
        await expect(executeArchiveManifestAction(null, 'unknown' as any, {}, scope)).rejects.toMatchObject({ code: 'INVALID_ACTION' });
    });
});

describe('monthly archive client serialization', () => {
    beforeEach(() => {
        mocks.postAdminJson.mockResolvedValue({ ok: true, data: { receipt: { archiveId: makeManifest().archiveId } } });
    });
    afterEach(() => vi.clearAllMocks());

    it('never sends local filenames, raw records, images, or extra identity details', async () => {
        await registerMonthlyArchiveReceipt({
            ...makeManifest(), fileName: '홍길동_주민번호_현장명.json', fullText: 'private OCR',
            records: [{ image: 'data:image/png;base64,private' }],
        } as any, [{ ...makeSummary(), name: '홍길동', phone: 'private' } as any]);
        const serialized = JSON.stringify(mocks.postAdminJson.mock.calls[0][1]);
        for (const forbidden of ['fileName', '홍길동', '주민번호', 'fullText', 'records', 'image', 'phone', 'private']) {
            expect(serialized).not.toContain(forbidden);
        }
        expect(mocks.postAdminJson.mock.calls[0][1].payload.manifest.verifiedAt).toBe(makeManifest().verifiedAt);
    });

    it('requires an explicit verification time instead of manufacturing one', async () => {
        await expect(registerMonthlyArchiveReceipt({ ...makeManifest(), verifiedAt: undefined, fileName: 'backup.json' } as any, [makeSummary()]))
            .rejects.toThrow(/다시 읽어 검증/);
        expect(mocks.postAdminJson).not.toHaveBeenCalled();
    });

    it('preflights both ceilings without making any request or changing local backups', async () => {
        const manifest = { ...makeManifest(), fileName: 'backup.json' };
        await expect(registerMonthlyArchiveReceipt(manifest, Array.from({ length: 5001 }, () => makeSummary())))
            .rejects.toThrow(/PC 백업과 로컬 검증은 그대로 유지/);
        await expect(registerMonthlyArchiveReceipt(manifest, [makeSummary({ workerUuid: 'x'.repeat(MAX_ARCHIVE_REQUEST_BYTES) })]))
            .rejects.toThrow(/2 MiB/);
        expect(mocks.postAdminJson).not.toHaveBeenCalled();
        expect(MONTHLY_ARCHIVE_RECEIPT_LIMITS).toEqual({ maxRequestBytes: MAX_ARCHIVE_REQUEST_BYTES, maxWorkerSummaries: MAX_WORKER_SUMMARIES });
    });
});

describe('monthly archive SQL concurrency and privacy contract', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260902000000_monthly_archive_continuity.sql'), 'utf8');
    it('permits only service-role RPC writes and has no full-record/PII columns', () => {
        expect(migration).toContain('from public, anon, authenticated');
        expect(migration).toContain('force row level security');
        expect(migration).toContain('grant execute on function public.psi_register_monthly_archive');
        expect(migration).not.toMatch(/\b(?:record_json|full_text|document_text|image_data|worker_name|phone|passport)\s+(?:text|jsonb)/i);
        expect(migration).toContain("file_name = 'PSI_' || archive_id || '.json'");
    });
    it('locks a collision-safe scope tuple before reading generations or replacing summaries', () => {
        const lock = migration.indexOf('perform pg_advisory_xact_lock');
        expect(migration).toContain("hashtext(jsonb_build_array(p_organization_id, p_site_id, p_manifest->>'period_month')::text)");
        expect(lock).toBeLessThan(migration.indexOf('into v_existing'));
        expect(lock).toBeLessThan(migration.indexOf('delete from public.worker_monthly_continuity'));
        expect(migration).toContain('unique (organization_id, site_id, period_month, generation)');
    });
    it('keeps immutable retry fingerprints and does not replace current summaries with an older generation', () => {
        expect(migration).toContain('v_existing.worker_summary_hash <> v_worker_summary_hash');
        expect(migration).toContain('jsonb_agg(');
        expect(migration).toContain("order by upper(value->>'worker_uuid')");
        expect(migration).toContain("message = 'archive generation conflict'");
        const gate = migration.indexOf("if (p_manifest->>'generation')::integer >= coalesce(v_previous_max_generation, 0) then");
        expect(gate).toBeGreaterThan(0);
        expect(gate).toBeLessThan(migration.indexOf('delete from public.worker_monthly_continuity'));
        expect(migration).toContain('continuity_is_current boolean');
        expect(migration).toContain('v_summary_count > 5000');
    });
});
