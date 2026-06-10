import { createHmac, timingSafeEqual } from 'crypto';

const ADMIN_SESSION_COOKIE = 'psi_admin_session';
const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;
const ADMIN_LOGIN_PASSWORD = 'psi1234';

type AdminSessionPayload = {
    exp: number;
    iat: number;
};

const readSecret = (name: string): string => String(process.env[name] || '').trim();

const getSessionSecret = (): string => {
    return (
        readSecret('ADMIN_SESSION_SECRET') ||
        readSecret('ADMIN_API_AUTH_TOKEN') ||
        readSecret('PSI_ADMIN_SECRET') ||
        readSecret('VITE_PSI_ADMIN_SECRET')
    );
};

const getLoginPassword = (): string => {
    return ADMIN_LOGIN_PASSWORD;
};

const signValue = (value: string, secret: string): string => {
    return createHmac('sha256', secret).update(value).digest('base64url');
};

const safeEqual = (left: string, right: string): boolean => {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const parseCookies = (req: any): Record<string, string> => {
    const rawCookie = String(req?.headers?.cookie || '');
    return rawCookie.split(';').reduce<Record<string, string>>((cookies, item) => {
        const separatorIndex = item.indexOf('=');
        if (separatorIndex < 0) return cookies;
        const key = item.slice(0, separatorIndex).trim();
        const value = item.slice(separatorIndex + 1).trim();
        if (key) cookies[key] = decodeURIComponent(value);
        return cookies;
    }, {});
};

export const isAdminAuthConfigured = (): boolean => {
    return Boolean(getLoginPassword() && getSessionSecret());
};

export const verifyAdminLoginPassword = (providedPassword: unknown): boolean => {
    const expectedPassword = getLoginPassword();
    const provided = String(providedPassword || '').trim();
    if (!expectedPassword || !provided) return false;
    return safeEqual(provided, expectedPassword);
};

export const createAdminSessionToken = (): string => {
    const secret = getSessionSecret();
    if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured.');

    const now = Math.floor(Date.now() / 1000);
    const payload: AdminSessionPayload = { iat: now, exp: now + ADMIN_SESSION_TTL_SECONDS };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${encodedPayload}.${signValue(encodedPayload, secret)}`;
};

const isValidSessionToken = (token: string): boolean => {
    const secret = getSessionSecret();
    if (!secret || !token) return false;

    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature || !safeEqual(signature, signValue(encodedPayload, secret))) {
        return false;
    }

    try {
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as AdminSessionPayload;
        const now = Math.floor(Date.now() / 1000);
        return Number.isFinite(payload.exp) && payload.exp > now && payload.iat <= now + 60;
    } catch {
        return false;
    }
};

export const buildAdminSessionCookie = (token: string, secure: boolean): string => {
    const attributes = [
        `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'Path=/',
        'SameSite=Strict',
        `Max-Age=${ADMIN_SESSION_TTL_SECONDS}`,
    ];
    if (secure) attributes.push('Secure');
    return attributes.join('; ');
};

export const buildClearedAdminSessionCookie = (secure: boolean): string => {
    const attributes = [
        `${ADMIN_SESSION_COOKIE}=`,
        'HttpOnly',
        'Path=/',
        'SameSite=Strict',
        'Max-Age=0',
    ];
    if (secure) attributes.push('Secure');
    return attributes.join('; ');
};

export const isSecureRequest = (req: any): boolean => {
    const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').toLowerCase();
    return forwardedProto === 'https' || Boolean(process.env.VERCEL);
};

export const isValidAdminAuthRequest = (req: any): boolean => {
    const cookieToken = parseCookies(req)[ADMIN_SESSION_COOKIE] || '';
    if (isValidSessionToken(cookieToken)) return true;

    const legacyToken = readSecret('ADMIN_API_AUTH_TOKEN');
    const headerToken = String(req?.headers?.['x-admin-auth'] || '').trim();
    return Boolean(legacyToken && headerToken && safeEqual(headerToken, legacyToken));
};

export const sendUnauthorizedAdminResponse = (res: any) => {
    return res.status(401).json({
        ok: false,
        error: 'Unauthorized',
        message: '관리자 로그인이 필요합니다.',
    });
};
