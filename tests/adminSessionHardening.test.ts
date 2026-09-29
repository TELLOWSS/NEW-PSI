import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminSessionToken, isValidAdminAuthRequest, isAdminAuthConfigured } from '../lib/server/adminAuthGuard';

const secret = 'test-only-private-session-secret-20260929';
const request = (token: string) => ({ headers: { cookie: `psi_admin_session=${token}` } });
const signed = (payload: unknown) => {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`;
};
beforeEach(() => {
    vi.stubEnv('ADMIN_SESSION_SECRET', secret);
    vi.stubEnv('ADMIN_LOGIN_PASSWORD', 'test-password');
    vi.stubEnv('ADMIN_API_AUTH_TOKEN', '');
});
afterEach(() => vi.unstubAllEnvs());
describe('administrator session boundary', () => {
    it('never signs sessions with public secrets or a bearer token', () => {
        vi.stubEnv('ADMIN_SESSION_SECRET', '');
        vi.stubEnv('VITE_PSI_ADMIN_SECRET', secret);
        vi.stubEnv('PSI_ADMIN_SECRET', secret);
        vi.stubEnv('ADMIN_API_AUTH_TOKEN', secret);
        expect(isAdminAuthConfigured()).toBe(false);
        expect(() => createAdminSessionToken()).toThrow();
        expect(isValidAdminAuthRequest(request(signed({ iat: 1, exp: 9999999999 })))).toBe(false);
    });
    it('rejects malformed cookies without a server error', () => {
        expect(isValidAdminAuthRequest(request('%E0%A4%A'))).toBe(false);
        expect(isValidAdminAuthRequest(request(`${createAdminSessionToken()}.extra`))).toBe(false);
    });
    it('rejects expired, future, oversized lifetime and nonnumeric claims', () => {
        const now = Math.floor(Date.now() / 1000);
        for (const payload of [
            { iat: now - 20, exp: now - 1 },
            { iat: now + 120, exp: now + 1000 },
            { iat: now, exp: now + 86400 },
            { iat: String(now), exp: now + 100 },
            { iat: now, exp: now - 1 },
        ]) expect(isValidAdminAuthRequest(request(signed(payload)))).toBe(false);
    });
    it('accepts a valid session and invalidates it after key rotation', () => {
        const req = request(createAdminSessionToken());
        expect(isValidAdminAuthRequest(req)).toBe(true);
        vi.stubEnv('ADMIN_SESSION_SECRET', 'rotated-private-session-secret');
        expect(isValidAdminAuthRequest(req)).toBe(false);
    });
    it('disables existing shared administrator sessions in SaaS mode', () => {
        const req = request(createAdminSessionToken());
        vi.stubEnv('PSI_DEPLOYMENT_MODEL', 'shared-saas');
        vi.stubEnv('ADMIN_API_AUTH_TOKEN', 'legacy-token');
        expect(isValidAdminAuthRequest(req)).toBe(false);
        expect(isValidAdminAuthRequest({ headers: { 'x-admin-auth': 'legacy-token' } })).toBe(false);
        expect(isAdminAuthConfigured()).toBe(false);
        expect(() => createAdminSessionToken()).toThrow();
    });
});
