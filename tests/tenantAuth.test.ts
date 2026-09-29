import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn(), from: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), limit: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
import { authenticateTenantUser, requireTenantContext } from '../lib/server/tenantAuth';
import handler from '../api/saas/access';

const user = 'a7290000-0000-4000-8000-000000000001';
const tenant = 'b7290000-0000-4000-8000-000000000001';
const other = 'b7290000-0000-4000-8000-000000000002';
const request = (tenantId = tenant) => ({ method: 'GET', headers: { authorization: 'Bearer verified-user-token', 'x-psi-tenant-id': tenantId } });
const member = (changes = {}) => ({ tenant_id: tenant, user_id: user, role: 'admin', status: 'active', ...changes });

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'sb_publishable_test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'must-never-use-service-key');
    const chain = { select: vi.fn().mockReturnThis(), eq: mocks.eq, maybeSingle: mocks.maybeSingle, order: vi.fn().mockReturnThis(), limit: mocks.limit };
    mocks.eq.mockReturnValue(chain);
    mocks.from.mockReturnValue(chain);
    mocks.getUser.mockResolvedValue({ data: { user: { id: user } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: member(), error: null });
    mocks.limit.mockResolvedValue({ data: [], error: null });
    mocks.createClient.mockReturnValue({ auth: { getUser: mocks.getUser }, from: mocks.from });
});
afterEach(() => vi.unstubAllEnvs());

describe('SaaS verified identity boundary', () => {
    it('verifies the user remotely and uses their token for RLS, never the service key', async () => {
        const context = await requireTenantContext(request(), ['owner', 'admin']);
        expect(context).toMatchObject({ userId: user, tenantId: tenant, role: 'admin' });
        expect(mocks.getUser).toHaveBeenCalledWith('verified-user-token');
        expect(mocks.createClient).toHaveBeenCalledWith('https://test.supabase.co', 'sb_publishable_test', expect.objectContaining({ global: { headers: { Authorization: 'Bearer verified-user-token' } } }));
        expect(mocks.eq).toHaveBeenCalledWith('tenant_id', tenant);
        expect(mocks.eq).toHaveBeenCalledWith('user_id', user);
        expect(mocks.eq).toHaveBeenCalledWith('status', 'active');
    });
    it('does not accept legacy administrator cookies or header tokens', async () => {
        await expect(authenticateTenantUser({ headers: { cookie: 'psi_admin_session=legacy', 'x-admin-auth': 'legacy' } })).rejects.toMatchObject({ status: 401 });
        expect(mocks.createClient).not.toHaveBeenCalled();
    });
    it('rejects invalid tokens and provider failures before querying memberships', async () => {
        mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'invalid' } });
        await expect(requireTenantContext(request())).rejects.toMatchObject({ status: 401 });
        mocks.getUser.mockRejectedValueOnce(new Error('secret provider diagnostics'));
        await expect(requireTenantContext(request())).rejects.toMatchObject({ status: 503 });
        expect(mocks.from).not.toHaveBeenCalled();
    });
    it('rejects missing, foreign, suspended and unrecognized memberships', async () => {
        for (const membership of [null, member({ tenant_id: other }), member({ user_id: other }), member({ status: 'suspended' }), member({ role: 'superuser' })]) {
            mocks.maybeSingle.mockResolvedValueOnce({ data: membership, error: null });
            await expect(requireTenantContext(request())).rejects.toMatchObject({ status: 403 });
        }
    });
    it('enforces server-side roles and rechecks revocation on the next request', async () => {
        mocks.maybeSingle.mockResolvedValueOnce({ data: member({ role: 'viewer' }), error: null });
        await expect(requireTenantContext(request(), ['admin', 'owner'])).rejects.toMatchObject({ code: 'ROLE_FORBIDDEN' });
        await expect(requireTenantContext(request())).resolves.toMatchObject({ role: 'admin' });
        mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
        await expect(requireTenantContext(request())).rejects.toMatchObject({ code: 'TENANT_FORBIDDEN' });
        expect(mocks.getUser).toHaveBeenCalledTimes(3);
    });
    it('fails closed on storage errors and malformed tenant identifiers', async () => {
        mocks.maybeSingle.mockResolvedValueOnce({ data: member(), error: { message: 'internal database detail' } });
        await expect(requireTenantContext(request())).rejects.toMatchObject({ status: 503 });
        await expect(requireTenantContext(request('tenant-a,tenant-b'))).rejects.toMatchObject({ status: 400 });
    });
    it('rejects service credentials accidentally assigned to the public key setting', async () => {
        for (const key of ['sb_secret_test', `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`]) {
            vi.stubEnv('SUPABASE_ANON_KEY', key);
            await expect(authenticateTenantUser(request())).rejects.toMatchObject({ status: 503 });
        }
        expect(mocks.createClient).not.toHaveBeenCalled();
    });
    it('returns only confirmed identity without caches, cookies or provider details', async () => {
        const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
        await handler(request(), res);
        expect(res.json).toHaveBeenCalledWith({ ok: true, userId: user, tenantId: tenant, role: 'admin' });
        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
        mocks.getUser.mockRejectedValue(new Error('private-key-and-query'));
        await handler(request(), res);
        expect(JSON.stringify(res.json.mock.calls)).not.toContain('private-key-and-query');
    });
});
