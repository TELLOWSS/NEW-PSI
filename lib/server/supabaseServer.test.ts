import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({
    createClient: createClientMock,
}));

import { createSupabaseServerClient } from './supabaseServer';

const SUPABASE_ENV_KEYS = [
    'VITE_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
    'SERVICE_ROLE_KEY',
    'VITE_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;

describe('createSupabaseServerClient', () => {
    beforeEach(() => {
        createClientMock.mockReset();
        for (const key of SUPABASE_ENV_KEYS) {
            vi.stubEnv(key, '');
        }
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('fails fast instead of falling back to an anon key', () => {
        vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

        expect(() => createSupabaseServerClient()).toThrow('SUPABASE_SERVICE_ROLE_KEY');
        expect(createClientMock).not.toHaveBeenCalled();
    });

    it('creates the server client with the service-role key when configured', () => {
        const client = { from: vi.fn() };
        createClientMock.mockReturnValue(client);
        vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

        expect(createSupabaseServerClient({ includeAdminSecret: false })).toBe(client);
        expect(createClientMock).toHaveBeenCalledWith(
            'https://example.supabase.co',
            'service-role-key',
            { global: { headers: {} } },
        );
    });

    it('preserves a caller-provided configuration error message', () => {
        expect(() => createSupabaseServerClient({ errorMessage: 'custom configuration error' }))
            .toThrow('custom configuration error');
        expect(createClientMock).not.toHaveBeenCalled();
    });
});
