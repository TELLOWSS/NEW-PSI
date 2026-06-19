import { afterEach, describe, expect, it } from 'vitest';
import {
    generateTrainingLinkToken,
    generateWorkerAuthenticationToken,
    verifyTrainingLinkToken,
    verifyWorkerAuthenticationToken,
} from '../lib/server/trainingLinkToken';

const originalSecret = process.env.TRAINING_LINK_SECRET;
const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
    if (originalSecret === undefined) delete process.env.TRAINING_LINK_SECRET;
    else process.env.TRAINING_LINK_SECRET = originalSecret;

    if (originalAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
});

describe('training link token secret boundary', () => {
    it('fails when the dedicated server secret is missing even if an anon key exists', () => {
        delete process.env.TRAINING_LINK_SECRET;
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-key';

        expect(() => generateTrainingLinkToken('session-1', Date.now() + 60_000))
            .toThrow('TRAINING_LINK_SECRET');
    });

    it('verifies only the matching session token', () => {
        process.env.TRAINING_LINK_SECRET = 'test-only-training-secret';
        const expiresAt = Date.now() + 60_000;
        const token = generateTrainingLinkToken('session-1', expiresAt);

        expect(verifyTrainingLinkToken('session-1', expiresAt, token)).toEqual({ ok: true });
        expect(verifyTrainingLinkToken('session-2', expiresAt, token)).toEqual({
            ok: false,
            reason: 'invalid',
        });
    });

    it('binds worker authentication proof to the verified worker id', () => {
        process.env.TRAINING_LINK_SECRET = 'test-only-training-secret';
        const expiresAt = Date.now() + 60_000;
        const token = generateWorkerAuthenticationToken('worker-1', expiresAt);

        expect(verifyWorkerAuthenticationToken('worker-1', expiresAt, token)).toEqual({ ok: true });
        expect(verifyWorkerAuthenticationToken('worker-2', expiresAt, token)).toEqual({
            ok: false,
            reason: 'invalid',
        });
    });
});
