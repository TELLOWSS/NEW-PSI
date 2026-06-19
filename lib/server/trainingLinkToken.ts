import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_LINK_TTL_MINUTES = 12 * 60;
export const WORKER_AUTH_TTL_MINUTES = 10;

const resolveTokenSecret = () => {
    const secret = String(process.env.TRAINING_LINK_SECRET || '').trim();
    if (!secret) {
        throw new Error('TRAINING_LINK_SECRET 환경변수가 필요합니다.');
    }
    return secret;
};

const buildPayload = (sessionId: string, expiresAt: number) => `${sessionId}.${expiresAt}`;
const buildWorkerAuthPayload = (workerId: string, expiresAt: number) => `worker-auth.${workerId}.${expiresAt}`;

const signPayload = (payload: string) => {
    const secret = resolveTokenSecret();
    return createHmac('sha256', secret).update(payload).digest('hex');
};

const verifySignedPayload = (payload: string, token: string) => {
    const expected = signPayload(payload);

    try {
        const expectedBuffer = Buffer.from(expected, 'utf8');
        const tokenBuffer = Buffer.from(token, 'utf8');
        if (expectedBuffer.length !== tokenBuffer.length) {
            return false;
        }
        return timingSafeEqual(expectedBuffer, tokenBuffer);
    } catch {
        return false;
    }
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

    return verifySignedPayload(buildPayload(sessionId, expiresAt), token)
        ? { ok: true as const }
        : { ok: false as const, reason: 'invalid' as const };
};

export const generateWorkerAuthenticationToken = (workerId: string, expiresAt: number) => {
    const normalizedWorkerId = String(workerId || '').trim();
    if (!normalizedWorkerId || !Number.isFinite(expiresAt)) {
        throw new Error('근로자 인증 토큰 입력값이 올바르지 않습니다.');
    }
    return signPayload(buildWorkerAuthPayload(normalizedWorkerId, expiresAt));
};

export const verifyWorkerAuthenticationToken = (
    workerId: string,
    expiresAtRaw: unknown,
    tokenRaw: unknown,
) => {
    const normalizedWorkerId = String(workerId || '').trim();
    const expiresAt = Number(expiresAtRaw);
    const token = typeof tokenRaw === 'string' ? tokenRaw.trim() : '';

    if (!normalizedWorkerId || !Number.isFinite(expiresAt) || !token) {
        return { ok: false as const, reason: 'missing' as const };
    }

    if (Date.now() > expiresAt) {
        return { ok: false as const, reason: 'expired' as const };
    }

    return verifySignedPayload(buildWorkerAuthPayload(normalizedWorkerId, expiresAt), token)
        ? { ok: true as const }
        : { ok: false as const, reason: 'invalid' as const };
};

export const buildWorkerAuthenticationProof = (
    workerId: string,
    ttlMinutes = WORKER_AUTH_TTL_MINUTES,
) => {
    const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
    return {
        workerAuthToken: generateWorkerAuthenticationToken(workerId, expiresAt),
        workerAuthExpiresAt: expiresAt,
    };
};

export const buildSignedTrainingMobileUrl = (baseUrl: string, sessionId: string, ttlMinutes = resolveLinkTtlMinutes()) => {
    const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
    const token = generateTrainingLinkToken(sessionId, expiresAt);
    const mobileUrl = `${baseUrl}/?mode=worker-kiosk&sessionId=${encodeURIComponent(sessionId)}&exp=${expiresAt}&sig=${encodeURIComponent(token)}`;

    return {
        mobileUrl,
        linkExpiresAt: expiresAt,
        linkToken: token,
        ttlMinutes,
    };
};
