import { createClient } from '@supabase/supabase-js';

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

function resolveChecklistComplete(checklist: unknown): boolean {
    if (!checklist || typeof checklist !== 'object') return false;
    const value = checklist as Record<string, unknown>;
    return Boolean(value.riskReview) && Boolean(value.ppeConfirm) && Boolean(value.emergencyConfirm);
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return sendJsonError(res, 405, 'Method Not Allowed');
    }

    try {
        const { sessionId } = req.body || {};
        if (!sessionId || typeof sessionId !== 'string') {
            return sendJsonError(res, 400, 'sessionId가 필요합니다.');
        }

        const supabase = getSupabaseClient();

        const logsResult = await supabase
            .from('training_logs')
            .select('worker_name, nationality')
            .eq('session_id', sessionId)
            .limit(5000);

        if (logsResult.error) {
            throw new Error(logsResult.error.message);
        }

        const workerSet = new Set<string>();
        const nationalitySet = new Set<string>();

        for (const row of logsResult.data || []) {
            const workerName = String((row as any)?.worker_name || '').trim().toLowerCase();
            const nationality = String((row as any)?.nationality || '').trim();
            if (workerName) workerSet.add(workerName);
            if (nationality) nationalitySet.add(nationality);
        }

        let confirmedWorkers = workerSet.size;
        let ackDataSource: 'training_acknowledgements' | 'submission_gate' = 'submission_gate';

        const ackResult = await supabase
            .from('training_acknowledgements')
            .select('worker_name, reviewed_guidance, checklist, comprehension_complete')
            .eq('session_id', sessionId)
            .limit(5000);

        if (!ackResult.error && Array.isArray(ackResult.data)) {
            const confirmedSet = new Set<string>();

            for (const row of ackResult.data) {
                const workerName = String((row as any)?.worker_name || '').trim().toLowerCase();
                if (!workerName) continue;

                const reviewedGuidance = Boolean((row as any)?.reviewed_guidance);
                const checklistComplete = resolveChecklistComplete((row as any)?.checklist);
                const comprehensionComplete = Boolean((row as any)?.comprehension_complete) || (reviewedGuidance && checklistComplete);

                if (comprehensionComplete) {
                    confirmedSet.add(workerName);
                }
            }

            confirmedWorkers = confirmedSet.size;
            ackDataSource = 'training_acknowledgements';
        }

        const submittedWorkers = workerSet.size;
        const confirmationRate = submittedWorkers > 0
            ? Math.round((confirmedWorkers / submittedWorkers) * 100)
            : 0;

        return res.status(200).json({
            ok: true,
            sessionId,
            submittedWorkers,
            confirmedWorkers,
            unconfirmedWorkers: Math.max(0, submittedWorkers - confirmedWorkers),
            confirmationRate,
            nationalityCount: nationalitySet.size,
            ackDataSource,
        });
    } catch (error: any) {
        return sendJsonError(res, 500, error?.message || '통계 조회 실패');
    }
}
