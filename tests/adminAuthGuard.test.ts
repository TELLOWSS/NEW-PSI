import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    buildAdminSessionCookie,
    createAdminSessionToken,
    isAdminAuthConfigured,
    isValidAdminAuthRequest,
    verifyAdminLoginPassword,
} from '../lib/server/adminAuthGuard';

const originalEnv = { ...process.env };

describe('adminAuthGuard', () => {
    beforeEach(() => {
        process.env.ADMIN_SESSION_SECRET = 'test-session-secret-with-enough-entropy';
        process.env.ADMIN_LOGIN_PASSWORD = 'test-admin-password';
        delete process.env.ADMIN_API_AUTH_TOKEN;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('fails closed when the session signing secret is missing', () => {
        delete process.env.ADMIN_SESSION_SECRET;
        expect(isAdminAuthConfigured()).toBe(false);
        expect(verifyAdminLoginPassword('test-password')).toBe(false);
        expect(isValidAdminAuthRequest({ headers: {} })).toBe(false);
    });

    it('validates a signed HttpOnly session cookie', () => {
        expect(isAdminAuthConfigured()).toBe(true);
        expect(verifyAdminLoginPassword('test-admin-password')).toBe(true);
        expect(verifyAdminLoginPassword('wrong-password')).toBe(false);

        const token = createAdminSessionToken();
        const cookie = buildAdminSessionCookie(token, true).split(';')[0];
        expect(isValidAdminAuthRequest({ headers: { cookie } })).toBe(true);
        expect(isValidAdminAuthRequest({ headers: { cookie: `${cookie}tampered` } })).toBe(false);
    });
});
