import { createClient } from '@supabase/supabase-js';

const TRAINING_ACCESS_BLOCK_THRESHOLD = 2;

function getSupabaseClient() {
    const supabaseUrl =
        process.env.VITE_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        '';
    const serviceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SERVICE_ROLE_KEY ||
        '';
    const anonKey =
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        '';
    const psiAdminSecret =
        process.env.VITE_PSI_ADMIN_SECRET ||
        process.env.PSI_ADMIN_SECRET ||
        '';

    const keyToUse = serviceRoleKey || anonKey;
    if (!supabaseUrl || !keyToUse) {
        throw new Error('Supabase 환경변수 누락');
    }

    return createClient(supabaseUrl, keyToUse, {
        global: {
            headers: psiAdminSecret ? { 'x-psi-admin-secret': psiAdminSecret } : {},
        },
    });
}

const isMissingTableError = (error: any): boolean => {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return (
        code === '42P01' ||
        message.includes('training_access_attempts') ||
        message.includes('relation')
    );
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    try {
        const { sessionId, workerId, workerName } = req.body || {};
        const normalizedSessionId = String(sessionId || '').trim();
        const normalizedWorkerId = String(workerId || '').trim();
        const normalizedWorkerName = String(workerName || '').trim();

        if (!normalizedSessionId || !normalizedWorkerId) {
            return res.status(400).json({ ok: false, message: 'sessionId/workerId 필수' });
        }

        const supabase = getSupabaseClient();
        const nowIso = new Date().toISOString();

        const { error: insertError } = await supabase
            .from('training_access_attempts')
            .insert({
                session_id: normalizedSessionId,
                worker_id: normalizedWorkerId,
                worker_name: normalizedWorkerName || null,
                accessed_at: nowIso,
            });

        if (insertError) {
            if (isMissingTableError(insertError)) {
                return res.status(200).json({
                    ok: true,
                    data: {
                        blocked: false,
                        totalAccessCount: 0,
                        threshold: TRAINING_ACCESS_BLOCK_THRESHOLD,
                        mode: 'fallback-local',
                    },
                });
            }
            throw new Error(insertError.message || '접속 시도 기록 저장 실패');
        }

        const { count, error: countError } = await supabase
            .from('training_access_attempts')
            .select('id', { count: 'exact', head: true })
            .eq('session_id', normalizedSessionId)
            .eq('worker_id', normalizedWorkerId);

        if (countError) {
            if (isMissingTableError(countError)) {
                return res.status(200).json({
                    ok: true,
                    data: {
                        blocked: false,
                        totalAccessCount: 0,
                        threshold: TRAINING_ACCESS_BLOCK_THRESHOLD,
                        mode: 'fallback-local',
                    },
                });
            }
            throw new Error(countError.message || '접속 시도 횟수 조회 실패');
        }

        const totalAccessCount = Number(count || 0);
        const blocked = totalAccessCount >= TRAINING_ACCESS_BLOCK_THRESHOLD;

        return res.status(200).json({
            ok: true,
            data: {
                blocked,
                totalAccessCount,
                threshold: TRAINING_ACCESS_BLOCK_THRESHOLD,
                accessedAt: nowIso,
                mode: 'server-db',
            },
        });
    } catch (error: any) {
        return res.status(500).json({
            ok: false,
            message: error?.message || '접속 정책 확인 실패',
        });
    }
}
