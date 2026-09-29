import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestTenantWorkspace } from '../utils/tenantWorkspaceRequest';

let generation = 1;
let getToken: () => Promise<string | null>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
    generation = 1; getToken = async () => 'memory-only-user-token';
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, items: [] }) });
    vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('memory-only tenant request lifecycle', () => {
    it('uses the user token and selected company, excludes legacy cookies, and disables caches', async () => {
        await requestTenantWorkspace(getToken, () => generation, 'company-a', { resource: 'actions', method: 'POST', body: { title: 'Guardrail' } });
        expect(fetchMock).toHaveBeenCalledWith('/api/saas/access?resource=actions', expect.objectContaining({
            method: 'POST', credentials: 'omit', cache: 'no-store', headers: {
                Authorization: 'Bearer memory-only-user-token', 'X-PSI-Tenant-ID': 'company-a', 'Content-Type': 'application/json',
            }, body: '{"title":"Guardrail"}',
        }));
    });
    it('does not send a pending old-company request after a company switch or logout', async () => {
        let resolveToken!: (token: string) => void;
        const pending = requestTenantWorkspace(() => new Promise(resolve => { resolveToken = resolve; }), () => generation, 'company-a');
        generation += 1; resolveToken('old-token');
        await expect(pending).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('does not deliver old-company records when a response finishes after a switch', async () => {
        let finish!: (result: any) => void;
        fetchMock.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const pending = requestTenantWorkspace(getToken, () => generation, 'company-a');
        await Promise.resolve(); generation += 1;
        finish({ ok: true, status: 200, json: async () => ({ ok: true, items: [{ secret: 'company-a record' }] }) });
        await expect(pending).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
    });
    it('refuses requests without a live individual session', async () => {
        await expect(requestTenantWorkspace(async () => null, () => generation, 'company-a')).rejects.toMatchObject({ status: 401 });
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('passes revocation and role errors to the UI without retrying', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ ok: false, code: 'TENANT_FORBIDDEN', message: '기업 이용 권한이 없습니다.' }) });
        await expect(requestTenantWorkspace(getToken, () => generation, 'company-a')).rejects.toMatchObject({ status: 403, code: 'TENANT_FORBIDDEN' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it('rejects an already cancelled workspace request before sending', async () => {
        const controller = new AbortController(); controller.abort();
        await expect(requestTenantWorkspace(getToken, () => generation, 'company-a', { signal: controller.signal })).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('encodes pagination arguments instead of interpolating them into URLs', async () => {
        await requestTenantWorkspace(getToken, () => generation, 'company-a', { resource: 'actions', query: { cursor: 'x&resource=other' } });
        expect(fetchMock.mock.calls[0][0]).toBe('/api/saas/access?cursor=x%26resource%3Dother&resource=actions');
    });
});
