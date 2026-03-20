import { createClient } from '@supabase/supabase-js';
import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../shared/adminAuthGuard.js';

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
        let removedFileCount = 0;

        const listRes = await supabase.storage
            .from('training_audio')
            .list(sessionId, { limit: 1000 });

        if (!listRes.error && Array.isArray(listRes.data) && listRes.data.length > 0) {
            const paths = listRes.data
                .map((file) => file?.name)
                .filter((name): name is string => typeof name === 'string' && name.length > 0)
                .map((name) => `${sessionId}/${name}`);

            if (paths.length > 0) {
                const removeRes = await supabase.storage.from('training_audio').remove(paths);
                if (!removeRes.error) {
                    removedFileCount = paths.length;
                }
            }
        }

        const deleteRes = await supabase
            .from('training_sessions')
            .delete()
            .eq('id', sessionId);

        if (deleteRes.error) {
            throw new Error(deleteRes.error.message);
        }

        return res.status(200).json({
            ok: true,
            sessionId,
            removedFileCount,
        });
    } catch (error: any) {
        return sendJsonError(res, 500, error?.message || '세션 삭제 실패');
    }
}
