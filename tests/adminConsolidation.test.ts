import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ create: vi.fn(() => { throw new Error('Unexpected database access'); }) }));
vi.mock('../lib/server/supabaseServer.js', () => ({ createSupabaseServerClient: database.create }));
vi.mock('@supabase/supabase-js', () => ({ createClient: database.create }));
import handler from '../api/admin';
import { createAdminSessionToken } from '../lib/server/adminAuthGuard';

const endpoints = ['archive-manifest', 'predictive-plan-status', 'record-master', 'safety-cases', 'safety-management', 'send-report-message', 'survey-risk-baselines', 'training', 'update-training-targets'];
const response = () => {
    const res = { statusCode: 0, body: null as any, headers: {} as Record<string, string>,
        setHeader(name: string, value: string) { this.headers[name] = value; },
        status(code: number) { this.statusCode = code; return this; },
        json(body: any) { this.body = body; return this; },
    };
    return res;
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ADMIN_SESSION_SECRET', 'test-only-consolidated-session-secret');
    vi.stubEnv('PSI_DEPLOYMENT_MODEL', 'single-site');
});
afterEach(() => vi.unstubAllEnvs());

describe('consolidated administrator security boundary', () => {
    it.each(endpoints)('rejects unauthenticated %s without touching storage', async endpoint => {
        const res = response();
        await handler({ method: 'POST', query: { endpoint }, body: { action: 'list' }, headers: {} }, res);
        expect(res.statusCode).toBe(401);
        expect(res.headers['Cache-Control']).toBe('no-store');
        expect(database.create).not.toHaveBeenCalled();
    });
    it.each([undefined, '', '../gateway', '__proto__', 'constructor', ['auth', 'training']])('rejects unknown or ambiguous endpoint %s', async endpoint => {
        const res = response();
        await handler({ method: 'POST', query: { endpoint }, body: { action: 'login' }, headers: {} }, res);
        expect(res.statusCode).toBe(404);
        expect(database.create).not.toHaveBeenCalled();
    });
    it('keeps auth body actions separate from the routing selector and preserves session cookies', async () => {
        const token = createAdminSessionToken();
        const res = response();
        await handler({ method: 'POST', query: { endpoint: 'auth', action: 'training' }, body: { action: 'status' }, headers: { cookie: `psi_admin_session=${token}` } }, res);
        expect(res.statusCode).toBe(200);
        expect(res.body.authenticated).toBe(true);
        expect(database.create).not.toHaveBeenCalled();
    });
    it('keeps logout cookie behavior on the consolidated route', async () => {
        const res = response();
        await handler({ method: 'POST', query: { endpoint: 'auth' }, body: { action: 'logout' }, headers: { 'x-forwarded-proto': 'https' } }, res);
        expect(res.statusCode).toBe(200);
        expect(res.headers['Set-Cookie']).toContain('Max-Age=0');
        expect(res.headers['Set-Cookie']).toContain('Secure');
    });
    it('preserves the deprecated training target route for raw JSON bodies', async () => {
        const res = response();
        await handler({ method: 'POST', query: { endpoint: 'update-training-targets' }, body: JSON.stringify({ sessionId: 'synthetic' }), headers: {} }, res);
        expect(res.statusCode).toBe(401);
        expect(res.headers.Deprecation).toBe('true');
        expect(database.create).not.toHaveBeenCalled();
    });
    it('keeps method enforcement within the handlers', async () => {
        const res = response();
        await handler({ method: 'GET', query: { endpoint: 'training' }, headers: {} }, res);
        expect(res.statusCode).toBe(405);
    });
    it('prevents shared-SaaS access through the legacy administrator dispatcher', async () => {
        const token = createAdminSessionToken();
        vi.stubEnv('PSI_DEPLOYMENT_MODEL', 'shared-saas');
        const res = response();
        await handler({ method: 'POST', query: { endpoint: 'record-master' }, body: { action: 'list' }, headers: { cookie: `psi_admin_session=${token}` } }, res);
        expect(res.statusCode).toBe(401);
        expect(database.create).not.toHaveBeenCalled();
    });
});

it('keeps four deployable functions with legacy rewrites and separate OCR duration', () => {
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)]);
    const entries = walk(resolve('api')).filter(path => /\.ts$/.test(path) && !/\.d\.ts$/.test(path));
    expect(entries).toHaveLength(4);
    const config = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8'));
    expect(config.rewrites[0]).toEqual({ source: '/api/admin/:endpoint', destination: '/api/admin?endpoint=:endpoint' });
    expect(config.functions['api/admin.ts'].maxDuration).toBe(10);
    expect(config.functions['api/gateway.ts'].maxDuration).toBe(240);
    for (const path of Object.keys(config.functions)) expect(entries).toContain(resolve(path));
});
