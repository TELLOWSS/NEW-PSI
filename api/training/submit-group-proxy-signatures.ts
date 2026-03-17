import { createClient } from '@supabase/supabase-js';

type GroupSignatureItem = {
    workerId: string;
    signatureDataUrl: string;
};

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
        throw new Error('Supabase 환경변수가 누락되었습니다. SUPABASE_SERVICE_ROLE_KEY 또는 VITE_SUPABASE_ANON_KEY를 확인해 주세요.');
    }

    return createClient(supabaseUrl, keyToUse, {
        global: {
            headers: psiAdminSecret ? { 'x-psi-admin-secret': psiAdminSecret } : {},
        },
    });
}

function toChecklistPayload(rawChecklist: unknown, audioPlayed: boolean) {
    if (rawChecklist && typeof rawChecklist === 'object') {
        const checklist = rawChecklist as Record<string, unknown>;
        return {
            riskReview: Boolean(checklist.riskReview),
            ppeConfirm: Boolean(checklist.ppeConfirm),
            emergencyConfirm: Boolean(checklist.emergencyConfirm),
            audioPlayed: Boolean(audioPlayed),
            scrolledToEnd: true,
            acknowledgedRiskAssessment: true,
        };
    }

    return {
        riskReview: true,
        ppeConfirm: true,
        emergencyConfirm: true,
        audioPlayed: Boolean(audioPlayed),
        scrolledToEnd: true,
        acknowledgedRiskAssessment: true,
    };
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    try {
        const {
            sessionId,
            selectedLanguageCode,
            selectedAudioUrl,
            audioPlayed,
            checklist,
            signatures,
        } = req.body || {};

        if (!sessionId || typeof sessionId !== 'string') {
            return res.status(400).json({ ok: false, message: 'sessionId가 필요합니다.' });
        }

        if (!Array.isArray(signatures) || signatures.length === 0) {
            return res.status(400).json({ ok: false, message: '서명 대상 근로자 목록이 필요합니다.' });
        }

        const normalizedSignatures: GroupSignatureItem[] = signatures
            .filter((item: unknown) => item && typeof item === 'object')
            .map((item: any) => ({
                workerId: String(item.workerId || '').trim(),
                signatureDataUrl: String(item.signatureDataUrl || '').trim(),
            }))
            .filter((item) => item.workerId && item.signatureDataUrl);

        if (normalizedSignatures.length === 0) {
            return res.status(400).json({ ok: false, message: '유효한 서명 데이터가 없습니다.' });
        }

        const workerIds = Array.from(new Set(normalizedSignatures.map((item) => item.workerId)));
        const supabase = getSupabaseClient();

        const workerRowsRes = await supabase
            .from('workers')
            .select('id, name, nationality')
            .in('id', workerIds);

        if (workerRowsRes.error) {
            throw new Error(`workers 조회 실패: ${workerRowsRes.error.message}`);
        }

        const workerMap = new Map<string, { id: string; name: string; nationality: string }>();
        for (const row of workerRowsRes.data || []) {
            const id = String((row as any)?.id || '').trim();
            const name = String((row as any)?.name || '').trim();
            const nationality = String((row as any)?.nationality || '').trim();
            if (id && name) {
                workerMap.set(id, { id, name, nationality });
            }
        }

        const missingWorkerIds = workerIds.filter((id) => !workerMap.has(id));
        if (missingWorkerIds.length > 0) {
            return res.status(400).json({
                ok: false,
                message: 'workers 테이블에 없는 근로자가 포함되어 있습니다. 명단에서 다시 선택해 주세요.',
                missingWorkerIds,
            });
        }

        const checklistPayload = toChecklistPayload(checklist, Boolean(audioPlayed));
        const insertedWorkerIds: string[] = [];

        for (const item of normalizedSignatures) {
            const worker = workerMap.get(item.workerId);
            if (!worker) continue;

            const match = item.signatureDataUrl.match(/^data:image\/png;base64,(.+)$/);
            if (!match?.[1]) {
                throw new Error(`서명 데이터 형식 오류: worker_id=${worker.id}`);
            }

            const binary = Buffer.from(match[1], 'base64');
            const safeName = worker.name.replace(/[^\w가-힣-]/g, '_');
            const path = `${sessionId}/group_proxy/${Date.now()}_${worker.id}_${safeName}.png`;

            const upload = await supabase.storage.from('signatures').upload(path, binary, {
                contentType: 'image/png',
                upsert: false,
            });

            if (upload.error) {
                throw new Error(`서명 업로드 실패(${worker.id}): ${upload.error.message}`);
            }

            const publicUrl = supabase.storage.from('signatures').getPublicUrl(path).data.publicUrl;

            const insertLog = await supabase.from('training_logs').insert({
                session_id: sessionId,
                worker_id: worker.id,
                worker_name: worker.name,
                nationality: worker.nationality || null,
                signature_url: publicUrl,
                audio_url: selectedAudioUrl || null,
                selected_language_code: selectedLanguageCode || null,
                signature_method: 'manager_group_proxy',
                submitted_at: new Date().toISOString(),
            });

            if (insertLog.error) {
                throw new Error(`training_logs 저장 실패(${worker.id}): ${insertLog.error.message}`);
            }

            const ackInsert = await supabase.from('training_acknowledgements').upsert({
                session_id: sessionId,
                worker_name: worker.name,
                selected_language_code: selectedLanguageCode || null,
                reviewed_guidance: true,
                checklist: checklistPayload,
                comprehension_complete: true,
                submitted_at: new Date().toISOString(),
            }, {
                onConflict: 'session_id,worker_name',
            });

            if (ackInsert.error) {
                console.warn('[submit-group-proxy-signatures] acknowledgement upsert skipped:', ackInsert.error.message);
            }

            insertedWorkerIds.push(worker.id);
        }

        return res.status(200).json({
            ok: true,
            sessionId,
            insertedCount: insertedWorkerIds.length,
            workerIds: insertedWorkerIds,
            signatureMethod: 'manager_group_proxy',
        });
    } catch (error: any) {
        return res.status(500).json({
            ok: false,
            message: error?.message || '그룹 대면 서명 저장 실패',
        });
    }
}
