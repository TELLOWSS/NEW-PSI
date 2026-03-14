import crypto from 'crypto';

const DEFAULT_LINK_TTL_MINUTES = 12 * 60;

const resolveTokenSecret = () => {
    return (
        process.env.TRAINING_LINK_SECRET ||
        process.env.PSI_ADMIN_SECRET ||
        process.env.VITE_PSI_ADMIN_SECRET ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        'psi-training-link-dev-secret'
    );
};

const buildPayload = (sessionId: string, expiresAt: number) => `${sessionId}.${expiresAt}`;

const signPayload = (payload: string) => {
    const secret = resolveTokenSecret();
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
};

export const resolveLinkTtlMinutes = () => {
    const raw = Number(process.env.TRAINING_LINK_TTL_MINUTES || DEFAULT_LINK_TTL_MINUTES);
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LINK_TTL_MINUTES;
    return Math.floor(raw);
};

export const generateTrainingLinkToken = (sessionId: string, expiresAt: number) => {
    const payload = buildPayload(sessionId, expiresAt);
    return signPayload(payload);
};

export const verifyTrainingLinkToken = (sessionId: string, expiresAtRaw: unknown, tokenRaw: unknown) => {
    const expiresAt = Number(expiresAtRaw);
    const token = typeof tokenRaw === 'string' ? tokenRaw.trim() : '';

    if (!sessionId || !Number.isFinite(expiresAt) || !token) {
        return { ok: false as const, reason: 'missing' as const };
    }

    if (Date.now() > expiresAt) {
        return { ok: false as const, reason: 'expired' as const };
    }

    const expected = generateTrainingLinkToken(sessionId, expiresAt);

    try {
        const expectedBuffer = Buffer.from(expected, 'utf8');
        const tokenBuffer = Buffer.from(token, 'utf8');
        if (expectedBuffer.length !== tokenBuffer.length) {
            return { ok: false as const, reason: 'invalid' as const };
        }
        const match = crypto.timingSafeEqual(expectedBuffer, tokenBuffer);
        return match
            ? { ok: true as const }
            : { ok: false as const, reason: 'invalid' as const };
    } catch {
        return { ok: false as const, reason: 'invalid' as const };
    }
};

export const buildSignedTrainingMobileUrl = (baseUrl: string, sessionId: string, ttlMinutes = resolveLinkTtlMinutes()) => {
    const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
    const token = generateTrainingLinkToken(sessionId, expiresAt);
    const mobileUrl = `${baseUrl}/?mode=worker-training&sessionId=${encodeURIComponent(sessionId)}&exp=${expiresAt}&sig=${encodeURIComponent(token)}`;

    return {
        mobileUrl,
        linkExpiresAt: expiresAt,
        linkToken: token,
        ttlMinutes,
    };
};
