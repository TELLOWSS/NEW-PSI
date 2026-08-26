import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeApiQuota, recordApiUsageEvent, resolveRequestFingerprint } from '../lib/server/apiSecurity';

describe('api security quota utilities', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('produces a stable, non-plain request fingerprint', () => {
        const request = {
            headers: {
                'x-forwarded-for': '203.0.113.10, 10.0.0.1',
                'user-agent': 'PSI security test',
            },
        };
        const first = resolveRequestFingerprint(request);
        const second = resolveRequestFingerprint(request);

        expect(first).toBe(second);
        expect(first).toHaveLength(64);
        expect(first).not.toContain('203.0.113.10');
    });

    it('maps the database quota response', async () => {
        const supabase = {
            rpc: async () => ({
                data: [{ allowed: false, current_count: 5, retry_after_seconds: 42 }],
                error: null,
            }),
        };

        await expect(consumeApiQuota(supabase, {
            scope: 'test',
            clientKeyHash: 'hash',
            maxRequests: 5,
            windowSeconds: 60,
        })).resolves.toEqual({
            allowed: false,
            count: 5,
            retryAfterSeconds: 42,
            mode: 'database',
        });
    });

    it('keeps public and unauthenticated scopes fail-closed in production', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        const supabase = {
            rpc: async () => ({
                data: null,
                error: { code: 'PGRST202', message: 'psi_consume_api_quota was not found' },
            }),
        };

        await expect(consumeApiQuota(supabase, {
            scope: 'worker.authenticate',
            clientKeyHash: 'public-fingerprint',
            maxRequests: 5,
            windowSeconds: 60,
        })).rejects.toMatchObject({
            statusCode: 503,
            code: 'SECURITY_QUOTA_UNAVAILABLE',
        });
    });

    it('uses a bounded memory limiter only when an authenticated fallback is explicit', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const supabase = {
            rpc: async () => ({
                data: null,
                error: { code: 'PGRST202', message: 'psi_consume_api_quota was not found' },
            }),
        };
        const options = {
            scope: 'ocr.retry.minute',
            clientKeyHash: 'authenticated-fallback-test',
            maxRequests: 1,
            windowSeconds: 60,
            allowAuthenticatedMemoryFallback: true,
        };

        await expect(consumeApiQuota(supabase, options)).resolves.toMatchObject({
            allowed: true,
            count: 1,
            mode: 'authenticated-memory',
        });
        await expect(consumeApiQuota(supabase, options)).resolves.toMatchObject({
            allowed: false,
            count: 1,
            mode: 'authenticated-memory',
        });
    });

    it('falls back after a quota transport exception for authenticated OCR', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const supabase = {
            rpc: async () => {
                throw new Error('fetch failed');
            },
        };

        await expect(consumeApiQuota(supabase, {
            scope: 'ocr.retry.daily',
            clientKeyHash: 'authenticated-transport-test',
            maxRequests: 100,
            windowSeconds: 86_400,
            allowAuthenticatedMemoryFallback: true,
        })).resolves.toMatchObject({
            allowed: true,
            mode: 'authenticated-memory',
        });
    });

    it('does not turn an audit transport outage into an OCR failure', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const supabase = {
            from: () => ({
                insert: async () => {
                    throw new Error('fetch failed');
                },
            }),
        };

        await expect(recordApiUsageEvent(supabase, {
            scope: 'ocr.retry',
            clientKeyHash: 'audit-outage-test',
            outcome: 'success',
        })).resolves.toBeUndefined();
    });
});
