import { describe, expect, it } from 'vitest';
import { consumeApiQuota, resolveRequestFingerprint } from '../lib/server/apiSecurity';

describe('api security quota utilities', () => {
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
});
