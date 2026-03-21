import { createClient } from '@supabase/supabase-js';
import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../lib/server/adminAuthGuard.js';

type TargetMode = 'submitted_only' | 'attendance_only';
type TrainingCategory = 'monthly_risk' | 'special_safety';

function getSupabaseClient() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SERVICE_ROLE_KEY ||
        '';
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const psiAdminSecret = process.env.VITE_PSI_ADMIN_SECRET || process.env.PSI_ADMIN_SECRET || '';
    const keyToUse = supabaseServiceRoleKey || supabaseAnonKey;

    if (!supabaseUrl || !keyToUse) {
        throw new Error('Supabase 환경변수가 누락되었습니다.');
    }

    return createClient(supabaseUrl, keyToUse, {
        global: {
            headers: psiAdminSecret ? { 'x-psi-admin-secret': psiAdminSecret } : {},
        },
    });
}

function normalizeTargetWorkerNames(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const names: string[] = [];

    for (const item of value) {
        const name = String(item || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(name);
        if (names.length >= 5000) break;
    }

    return names;
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    if (!isValidAdminAuthRequest(req)) {
        return sendUnauthorizedAdminResponse(res);
    }

    try {
        const { sessionId, trainingTitle, trainingCategory, targetMode, targetWorkerNames } = req.body || {};

        const normalizedSessionId = String(sessionId || '').trim();
        if (!normalizedSessionId) {
            return res.status(400).json({ ok: false, message: 'sessionId가 필요합니다.' });
        }

        const normalizedCategory: TrainingCategory =
            trainingCategory === 'special_safety' ? 'special_safety' : 'monthly_risk';
        const normalizedMode: TargetMode =
            targetMode === 'attendance_only' ? 'attendance_only' : 'submitted_only';
        const normalizedTitle = String(trainingTitle || '').trim();
        const normalizedTargetNames = normalizeTargetWorkerNames(targetWorkerNames);

        const supabase = getSupabaseClient();

        const { data, error } = await supabase
            .from('training_sessions')
            .update({
                training_title: normalizedTitle || null,
                training_category: normalizedCategory,
                target_mode: normalizedMode,
                target_worker_names: normalizedTargetNames,
            })
            .eq('id', normalizedSessionId)
            .select('id, training_title, training_category, target_mode, target_worker_names')
            .single();

        if (error) {
            throw new Error(error.message || '세션 대상자 설정 저장 실패');
        }

        return res.status(200).json({ ok: true, data });
    } catch (error: any) {
        return res.status(500).json({
            ok: false,
            message: error?.message || '세션 대상자 설정 저장 실패',
        });
    }
}
