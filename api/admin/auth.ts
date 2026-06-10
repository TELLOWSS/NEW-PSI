import {
    buildAdminSessionCookie,
    buildClearedAdminSessionCookie,
    createAdminSessionToken,
    isAdminAuthConfigured,
    isSecureRequest,
    isValidAdminAuthRequest,
    verifyAdminLoginPassword,
} from '../../lib/server/adminAuthGuard.js';

type LoginAttempt = {
    count: number;
    resetAt: number;
};

const attempts = new Map<string, LoginAttempt>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const getClientKey = (req: any): string => {
    return String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown')
        .split(',')[0]
        .trim();
};

const isRateLimited = (key: string): boolean => {
    const now = Date.now();
    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
        attempts.set(key, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
        return false;
    }
    return current.count >= MAX_LOGIN_ATTEMPTS;
};

const recordFailedAttempt = (key: string): void => {
    const now = Date.now();
    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
        attempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
        return;
    }
    current.count += 1;
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = String(body.action || 'status');
    const secure = isSecureRequest(req);

    if (action === 'status') {
        return res.status(200).json({ ok: true, authenticated: isValidAdminAuthRequest(req) });
    }

    if (action === 'logout') {
        res.setHeader('Set-Cookie', buildClearedAdminSessionCookie(secure));
        return res.status(200).json({ ok: true, authenticated: false });
    }

    if (action !== 'login') {
        return res.status(400).json({ ok: false, message: '지원하지 않는 인증 요청입니다.' });
    }

    if (!isAdminAuthConfigured()) {
        return res.status(503).json({
            ok: false,
            message: '관리자 인증 환경변수가 설정되지 않았습니다.',
        });
    }

    const clientKey = getClientKey(req);
    if (isRateLimited(clientKey)) {
        return res.status(429).json({
            ok: false,
            message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.',
        });
    }

    if (!verifyAdminLoginPassword(body.password)) {
        recordFailedAttempt(clientKey);
        return res.status(401).json({ ok: false, message: '비밀번호가 올바르지 않습니다.' });
    }

    attempts.delete(clientKey);
    res.setHeader('Set-Cookie', buildAdminSessionCookie(createAdminSessionToken(), secure));
    return res.status(200).json({ ok: true, authenticated: true });
}
