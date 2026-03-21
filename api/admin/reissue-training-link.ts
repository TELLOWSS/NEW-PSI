import { createClient } from '@supabase/supabase-js';
import { buildSignedTrainingMobileUrl, resolveLinkTtlMinutes } from '../../lib/server/trainingLinkToken.js';
import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../lib/server/adminAuthGuard.js';

function getSupabaseClient() {
    const supabaseUrl =
        process.env.VITE_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        '';
    const supabaseServiceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SERVICE_ROLE_KEY ||
        '';
    const supabaseAnonKey =
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        '';
    const psiAdminSecret =
        process.env.VITE_PSI_ADMIN_SECRET ||
        process.env.PSI_ADMIN_SECRET ||
        '';
    const keyToUse = supabaseServiceRoleKey || supabaseAnonKey;

    if (!supabaseUrl || !keyToUse) {
        throw new Error('Supabase 환경변수가 누락되었습니다. SUPABASE_SERVICE_ROLE_KEY 또는 VITE_SUPABASE_ANON_KEY를 확인해 주세요.');
    }

    return createClient(supabaseUrl, keyToUse, {
        global: {
            headers: psiAdminSecret
                ? { 'x-psi-admin-secret': psiAdminSecret }
                : {},
        },
    });
}

function sendJsonError(res: any, statusCode: number, message: string) {
    return res.status(statusCode).json({
        ok: false,
        error: message,
        message,
    });
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return sendJsonError(res, 405, 'Method Not Allowed');
    }

    if (!isValidAdminAuthRequest(req)) {
        return sendUnauthorizedAdminResponse(res);
    }

    try {
        const { sessionId } = req.body || {};
        if (!sessionId || typeof sessionId !== 'string') {
            return sendJsonError(res, 400, 'sessionId가 필요합니다.');
        }

        const supabase = getSupabaseClient();
        const sessionQuery = await supabase
            .from('training_sessions')
            .select('id')
            .eq('id', sessionId)
            .single();

        if (sessionQuery.error || !sessionQuery.data?.id) {
            return sendJsonError(res, 404, '세션을 찾을 수 없습니다.');
        }

        const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || req.headers.origin || 'http://localhost:5173';
        const { mobileUrl, linkExpiresAt, ttlMinutes } = buildSignedTrainingMobileUrl(baseUrl, sessionId, resolveLinkTtlMinutes());

        return res.status(200).json({
            ok: true,
            sessionId,
            mobileUrl,
            linkExpiresAt,
            ttlMinutes,
        });
    } catch (error: any) {
        return sendJsonError(res, 500, error?.message || '링크 재발급 실패');
    }
}
