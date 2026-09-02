import {
    buildAdminSessionCookie,
    buildClearedAdminSessionCookie,
    createAdminSessionToken,
    isAdminAuthConfigured,
    isSecureRequest,
    isValidAdminAuthRequest,
    verifyAdminLoginPassword,
    isBypassAllowed,
} from '../../lib/server/adminAuthGuard.js';
import {
    consumeApiQuota,
    recordApiUsageEvent,
    resolveRequestFingerprint,
} from '../../lib/server/apiSecurity.js';
import { createSupabaseServerClient } from '../../lib/server/supabaseServer.js';

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_QUOTA_SCOPE = 'admin.auth.login';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    let body: Record<string, unknown>;
    try {
        const parsed = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        req.body = undefined;
        return res.status(400).json({ ok: false, message: '요청 본문 형식이 올바르지 않습니다.' });
    }
    const clearSensitiveBody = () => {
        body.password = undefined;
        req.body = undefined;
    };
    const action = String(body.action || 'status');
    const secure = isSecureRequest(req);

    if (action === 'status') {
        clearSensitiveBody();
        return res.status(200).json({ ok: true, authenticated: isValidAdminAuthRequest(req) });
    }

    if (action === 'logout') {
        clearSensitiveBody();
        res.setHeader('Set-Cookie', buildClearedAdminSessionCookie(secure));
        return res.status(200).json({ ok: true, authenticated: false });
    }

    if (action !== 'login') {
        clearSensitiveBody();
        return res.status(400).json({ ok: false, message: '지원하지 않는 인증 요청입니다.' });
    }

    if (!isAdminAuthConfigured()) {
        clearSensitiveBody();
        return res.status(503).json({
            ok: false,
            message: '관리자 인증 환경변수가 설정되지 않았습니다.',
        });
    }

    const isBypass = Boolean(body.bypass);
    if (isBypass) {
        clearSensitiveBody();
        if (!isBypassAllowed()) {
            return res.status(403).json({ ok: false, message: '이 환경에서는 우회 로그인을 사용할 수 없습니다.' });
        }
        res.setHeader('Set-Cookie', buildAdminSessionCookie(createAdminSessionToken(), secure));
        return res.status(200).json({ ok: true, authenticated: true });
    }

    const clientKeyHash = resolveRequestFingerprint(req);
    let supabase: any;
    try {
        supabase = createSupabaseServerClient({
            errorMessage: '관리자 로그인 보안 저장소가 설정되지 않았습니다.',
        });
    } catch {
        clearSensitiveBody();
        return res.status(503).json({
            ok: false,
            code: 'ADMIN_LOGIN_SECURITY_UNAVAILABLE',
            message: '관리자 로그인 보안 저장소를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        });
    }

    let quota;
    try {
        quota = await consumeApiQuota(supabase, {
            scope: LOGIN_QUOTA_SCOPE,
            clientKeyHash,
            maxRequests: MAX_LOGIN_ATTEMPTS,
            windowSeconds: LOGIN_WINDOW_SECONDS,
            metadata: { action: 'login' },
        });
    } catch {
        clearSensitiveBody();
        return res.status(503).json({
            ok: false,
            code: 'ADMIN_LOGIN_SECURITY_UNAVAILABLE',
            message: '로그인 시도 제한을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        });
    }

    if (typeof res.setHeader === 'function') {
        res.setHeader('X-PSI-Quota-Mode', quota.mode);
    }

    if (!quota.allowed) {
        clearSensitiveBody();
        const retryAfterSeconds = Math.max(1, quota.retryAfterSeconds || LOGIN_WINDOW_SECONDS);
        if (typeof res.setHeader === 'function') {
            res.setHeader('Retry-After', String(retryAfterSeconds));
        }
        await recordApiUsageEvent(supabase, {
            scope: LOGIN_QUOTA_SCOPE,
            clientKeyHash,
            outcome: 'blocked',
            metadata: { retryAfterSeconds },
        });
        return res.status(429).json({
            ok: false,
            message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        });
    }

    if (!verifyAdminLoginPassword(body.password)) {
        clearSensitiveBody();
        await recordApiUsageEvent(supabase, {
            scope: LOGIN_QUOTA_SCOPE,
            clientKeyHash,
            outcome: 'failure',
        });
        return res.status(401).json({ ok: false, message: '비밀번호가 올바르지 않습니다.' });
    }

    clearSensitiveBody();
    await supabase
        .from('api_security_events')
        .delete()
        .eq('scope', LOGIN_QUOTA_SCOPE)
        .eq('client_key_hash', clientKeyHash);
    await recordApiUsageEvent(supabase, {
        scope: LOGIN_QUOTA_SCOPE,
        clientKeyHash,
        outcome: 'success',
    });
    res.setHeader('Set-Cookie', buildAdminSessionCookie(createAdminSessionToken(), secure));
    return res.status(200).json({ ok: true, authenticated: true });
}
