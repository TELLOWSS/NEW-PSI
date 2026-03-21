import { createClient } from '@supabase/supabase-js';
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
            headers: psiAdminSecret ? { 'x-psi-admin-secret': psiAdminSecret } : {},
        },
    });
}

function sendJsonError(res: any, statusCode: number, message: string) {
    return res.status(statusCode).json({ ok: false, error: message, message });
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return sendJsonError(res, 405, 'Method Not Allowed');
    }

    if (!isValidAdminAuthRequest(req)) {
        return sendUnauthorizedAdminResponse(res);
    }

    try {
        const { sessionId, audioUrls, originalScript } = req.body || {};
        if (!sessionId || typeof sessionId !== 'string') {
            return sendJsonError(res, 400, 'sessionId가 필요합니다.');
        }

        const normalizedAudioUrls = (audioUrls && typeof audioUrls === 'object') ? audioUrls : {};
        const supabase = getSupabaseClient();

        const updateRes = await supabase
            .from('training_sessions')
            .update({
                audio_urls: normalizedAudioUrls,
                original_script: typeof originalScript === 'string' ? originalScript : null,
            })
            .eq('id', sessionId);

        if (updateRes.error) {
            throw new Error(updateRes.error.message);
        }

        return res.status(200).json({ ok: true, sessionId, audioUrls: normalizedAudioUrls });
    } catch (error: any) {
        return sendJsonError(res, 500, error?.message || 'training audio 업데이트 실패');
    }
}
