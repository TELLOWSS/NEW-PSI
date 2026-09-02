import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    consumeApiQuota: vi.fn(),
    recordApiUsageEvent: vi.fn(),
    resolveRequestFingerprint: vi.fn(() => 'hashed-client-key'),
    createSupabaseServerClient: vi.fn(),
    deleteSecondEq: vi.fn(async () => ({ error: null })),
    deleteFirstEq: vi.fn(),
}));

vi.mock('../lib/server/apiSecurity.js', () => ({
    consumeApiQuota: mocks.consumeApiQuota,
    recordApiUsageEvent: mocks.recordApiUsageEvent,
    resolveRequestFingerprint: mocks.resolveRequestFingerprint,
}));

vi.mock('../lib/server/supabaseServer.js', () => ({
    createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import handler from '../api/admin/auth';

const createResponse = () => {
    let statusCode = 0;
    let body: any = null;
    const headers: Record<string, string> = {};
    const response = {
        setHeader(name: string, value: string) {
            headers[name] = value;
            return this;
        },
        status(code: number) {
            statusCode = code;
            return this;
        },
        json(value: any) {
            body = value;
            return value;
        },
    };
    return { response, read: () => ({ statusCode, body, headers }) };
};

const createRequest = (body: unknown) => ({
    method: 'POST',
    body,
    headers: {
        'x-forwarded-for': '203.0.113.40',
        'user-agent': 'PSI auth handler test',
        'x-forwarded-proto': 'https',
    },
});

const originalEnv = {
    ADMIN_LOGIN_PASSWORD: process.env.ADMIN_LOGIN_PASSWORD,
    PSI_ADMIN_PASSWORD: process.env.PSI_ADMIN_PASSWORD,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
    ADMIN_API_AUTH_TOKEN: process.env.ADMIN_API_AUTH_TOKEN,
    PSI_ADMIN_SECRET: process.env.PSI_ADMIN_SECRET,
    VITE_PSI_ADMIN_SECRET: process.env.VITE_PSI_ADMIN_SECRET,
    NODE_ENV: process.env.NODE_ENV,
};

describe('admin auth durable login limiter', () => {
    beforeEach(() => {
        process.env.ADMIN_LOGIN_PASSWORD = 'test-admin-password';
        process.env.ADMIN_SESSION_SECRET = 'test-session-signing-secret';
        process.env.NODE_ENV = 'test';
        delete process.env.PSI_ADMIN_PASSWORD;
        delete process.env.ADMIN_API_AUTH_TOKEN;
        delete process.env.PSI_ADMIN_SECRET;
        delete process.env.VITE_PSI_ADMIN_SECRET;

        mocks.deleteFirstEq.mockImplementation(() => ({ eq: mocks.deleteSecondEq }));
        mocks.createSupabaseServerClient.mockReturnValue({
            from: vi.fn(() => ({
                delete: vi.fn(() => ({ eq: mocks.deleteFirstEq })),
            })),
        });
        mocks.consumeApiQuota.mockResolvedValue({
            allowed: true,
            count: 1,
            retryAfterSeconds: 0,
            mode: 'database',
        });
        mocks.recordApiUsageEvent.mockResolvedValue(undefined);
    });

    afterEach(() => {
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        vi.clearAllMocks();
    });

    it('records a failed password without retaining it in the request body', async () => {
        const req = createRequest({ action: 'login', password: 'wrong-password' });
        const res = createResponse();

        await handler(req, res.response);

        expect(res.read()).toMatchObject({
            statusCode: 401,
            headers: { 'X-PSI-Quota-Mode': 'database' },
            body: { ok: false },
        });
        expect(req.body).toBeUndefined();
        expect(mocks.recordApiUsageEvent).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ scope: 'admin.auth.login', outcome: 'failure' }),
        );
    });

    it('blocks a durable quota overflow before password verification', async () => {
        mocks.consumeApiQuota.mockResolvedValue({
            allowed: false,
            count: 5,
            retryAfterSeconds: 120,
            mode: 'database',
        });
        const req = createRequest({ action: 'login', password: 'test-admin-password' });
        const res = createResponse();

        await handler(req, res.response);

        expect(res.read()).toMatchObject({
            statusCode: 429,
            headers: { 'Retry-After': '120', 'X-PSI-Quota-Mode': 'database' },
        });
        expect(req.body).toBeUndefined();
        expect(mocks.recordApiUsageEvent).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ outcome: 'blocked' }),
        );
    });

    it('clears failed-attempt quota rows after a valid login', async () => {
        const req = createRequest({ action: 'login', password: 'test-admin-password' });
        const res = createResponse();

        await handler(req, res.response);

        expect(res.read().statusCode).toBe(200);
        expect(res.read().headers['Set-Cookie']).toContain('psi_admin_session=');
        expect(res.read().headers['Set-Cookie']).toContain('HttpOnly');
        expect(req.body).toBeUndefined();
        expect(mocks.deleteFirstEq).toHaveBeenCalledWith('scope', 'admin.auth.login');
        expect(mocks.deleteSecondEq).toHaveBeenCalledWith('client_key_hash', 'hashed-client-key');
        expect(mocks.recordApiUsageEvent).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ outcome: 'success' }),
        );
    });

    it('fails closed when the durable security store is unavailable', async () => {
        mocks.createSupabaseServerClient.mockImplementation(() => {
            throw new Error('missing service role');
        });
        const req = createRequest({ action: 'login', password: 'test-admin-password' });
        const res = createResponse();

        await handler(req, res.response);

        expect(res.read()).toMatchObject({
            statusCode: 503,
            body: { code: 'ADMIN_LOGIN_SECURITY_UNAVAILABLE' },
        });
        expect(req.body).toBeUndefined();
    });

    it('rejects malformed JSON without echoing sensitive input', async () => {
        const req = createRequest('{"action":"login","password":');
        const res = createResponse();

        await handler(req, res.response);

        expect(res.read()).toMatchObject({ statusCode: 400, body: { ok: false } });
        expect(req.body).toBeUndefined();
        expect(mocks.consumeApiQuota).not.toHaveBeenCalled();
    });

    it('scrubs a valid JSON string body after login verification', async () => {
        const req = createRequest(JSON.stringify({ action: 'login', password: 'test-admin-password' }));
        const res = createResponse();

        await handler(req, res.response);

        expect(res.read().statusCode).toBe(200);
        expect(req.body).toBeUndefined();
    });

    it('scrubs the password when authentication configuration is missing', async () => {
        delete process.env.ADMIN_LOGIN_PASSWORD;
        const req = createRequest({ action: 'login', password: 'must-not-remain' });
        const res = createResponse();

        await handler(req, res.response);

        expect(res.read().statusCode).toBe(503);
        expect(req.body).toBeUndefined();
        expect(mocks.consumeApiQuota).not.toHaveBeenCalled();
    });
});
