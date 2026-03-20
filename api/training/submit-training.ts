/**
 * POST /api/training/submit-training
 *
 * 훈련 서명 제출 통합 API
 *
 * Body 형식:
 *   단건: { type: 'single', sessionId, workerId, workerName, ... }
 *   그룹: { type: 'group', sessionId, signatures: [...], ... }
 *
 * 응답:
 *   { ok: true, type: string, data: { ... } }
 */

import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';

function buildSignatureStoragePath(sessionId: string, options?: { prefix?: string }) {
    const normalizedSessionId = String(sessionId || '').trim();
    const timestamp = Date.now();
    const uniqueId = randomUUID().replace(/-/g, '');
    const prefix = String(options?.prefix || '').trim().replace(/^\/|\/$/g, '');
    const fileName = `${timestamp}_${uniqueId}.png`;

    return prefix
        ? `${normalizedSessionId}/${prefix}/${fileName}`
        : `${normalizedSessionId}/${fileName}`;
}

// -----------------------------------------------------------------------
// Supabase 클라이언트 생성
// -----------------------------------------------------------------------
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

// -----------------------------------------------------------------------
// 액션 1: 개별 서명 제출 (단건)
// -----------------------------------------------------------------------
async function handleSingleSignature(payload: any): Promise<any> {
    const {
        sessionId,
        workerId,
        workerName,
        nationality,
        selectedLanguageCode,
        reviewedGuidance,
        audioPlayed,
        scrolledToEnd,
        acknowledgedRiskAssessment,
        checklist,
        selectedAudioUrl,
        signatureDataUrl,
        isManagerProxy,
    } = payload;

    // 필수값 검증
    if (!sessionId || !workerId || !workerName || !nationality || !signatureDataUrl) {
        throw new Error('필수값 누락');
    }

    const normalizedWorkerName = String(workerName).trim();
    if (!normalizedWorkerName) {
        throw new Error('근로자 이름이 필요합니다.');
    }

    const match = String(signatureDataUrl).match(/^data:image\/png;base64,(.+)$/);
    if (!match?.[1]) {
        throw new Error('서명 데이터 형식 오류');
    }

    const hasEngagementProof = Boolean(reviewedGuidance) || Boolean(audioPlayed) || Boolean(scrolledToEnd);
    if (!hasEngagementProof) {
        throw new Error('오디오 재생 또는 대본 끝까지 읽기 기록이 필요합니다.');
    }

    if (!acknowledgedRiskAssessment) {
        throw new Error('위험성평가 숙지 체크가 필요합니다.');
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );

    const fileBuffer = Buffer.from(match[1], 'base64');
    const path = buildSignatureStoragePath(sessionId);

    const { error: uploadError } = await supabase.storage.from('signatures').upload(path, fileBuffer, {
        contentType: 'image/png',
        upsert: false,
    });

    if (uploadError) throw new Error(`서명 업로드 실패: ${uploadError.message}`);

    const pub = supabase.storage.from('signatures').getPublicUrl(path);
    const signatureUrl = pub.data.publicUrl;

    const { error: logError } = await supabase.from('training_logs').insert({
        session_id: sessionId,
        worker_id: String(workerId).trim(),
        worker_name: normalizedWorkerName,
        nationality,
        signature_url: signatureUrl,
        audio_url: selectedAudioUrl || null,
        selected_language_code: selectedLanguageCode || null,
        is_manager_proxy: Boolean(isManagerProxy),
        signature_method: Boolean(isManagerProxy) ? 'manager_proxy' : 'worker_self',
        submitted_at: new Date().toISOString(),
    });

    if (logError) throw new Error(`training_logs 저장 실패: ${logError.message}`);

    const checklistPayload = (checklist && typeof checklist === 'object')
        ? {
            riskReview: Boolean((checklist as any).riskReview),
            ppeConfirm: Boolean((checklist as any).ppeConfirm),
            emergencyConfirm: Boolean((checklist as any).emergencyConfirm),
            audioPlayed: Boolean(audioPlayed),
            scrolledToEnd: Boolean(scrolledToEnd),
            acknowledgedRiskAssessment: Boolean(acknowledgedRiskAssessment),
        }
        : {
            riskReview: Boolean(acknowledgedRiskAssessment),
            ppeConfirm: Boolean(acknowledgedRiskAssessment),
            emergencyConfirm: Boolean(acknowledgedRiskAssessment),
            audioPlayed: Boolean(audioPlayed),
            scrolledToEnd: Boolean(scrolledToEnd),
            acknowledgedRiskAssessment: Boolean(acknowledgedRiskAssessment),
        };

    const comprehensionComplete = hasEngagementProof && Boolean(acknowledgedRiskAssessment);

    const { error: ackError } = await supabase.from('training_acknowledgements').upsert({
        session_id: sessionId,
        worker_name: normalizedWorkerName,
        selected_language_code: selectedLanguageCode || null,
        reviewed_guidance: Boolean(reviewedGuidance),
        checklist: checklistPayload,
        comprehension_complete: comprehensionComplete,
        submitted_at: new Date().toISOString(),
    }, {
        onConflict: 'session_id,worker_name',
    });

    if (ackError) {
        console.warn('[submit-training] training_acknowledgements insert skipped:', ackError.message);
    }

    return { signatureUrl, comprehensionComplete };
}

// -----------------------------------------------------------------------
// 액션 2: 그룹 서명 제출 (관리자 대리)
// -----------------------------------------------------------------------
async function handleGroupSignatures(payload: any): Promise<any> {
    const { sessionId, selectedLanguageCode, selectedAudioUrl, audioPlayed, isManagerProxy, checklist, signatures } = payload;

    if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('sessionId가 필요합니다.');
    }

    if (!Array.isArray(signatures) || signatures.length === 0) {
        throw new Error('서명 대상 근로자 목록이 필요합니다.');
    }

    // 서명 데이터 정규화
    const normalizedSignatures: Array<{ workerId: string; signatureDataUrl: string }> = signatures
        .filter((item: unknown) => item && typeof item === 'object')
        .map((item: any) => ({
            workerId: String(item.workerId || '').trim(),
            signatureDataUrl: String(item.signatureDataUrl || '').trim(),
        }))
        .filter((item) => item.workerId && item.signatureDataUrl);

    if (normalizedSignatures.length === 0) {
        throw new Error('유효한 서명 데이터가 없습니다.');
    }

    const supabase = getSupabaseClient();
    const workerIds = Array.from(new Set(normalizedSignatures.map((item) => item.workerId)));

    // 근로자 정보 조회
    const { data: workerRows, error: workerError } = await supabase
        .from('workers')
        .select('id, name, nationality')
        .in('id', workerIds);

    if (workerError) throw new Error(`workers 조회 실패: ${workerError.message}`);

    const workerMap = new Map<string, { id: string; name: string; nationality: string }>();
    for (const row of workerRows || []) {
        const id = String((row as any)?.id || '').trim();
        const name = String((row as any)?.name || '').trim();
        const nationality = String((row as any)?.nationality || '').trim();
        if (id && name) {
            workerMap.set(id, { id, name, nationality });
        }
    }

    const missingWorkerIds = workerIds.filter((id) => !workerMap.has(id));
    if (missingWorkerIds.length > 0) {
        throw new Error(`workers 테이블에 없는 근로자: ${missingWorkerIds.join(', ')}`);
    }

    // 체크리스트 정규화
    const checklistPayload = (checklist && typeof checklist === 'object')
        ? {
            riskReview: Boolean((checklist as any).riskReview),
            ppeConfirm: Boolean((checklist as any).ppeConfirm),
            emergencyConfirm: Boolean((checklist as any).emergencyConfirm),
            audioPlayed: Boolean(audioPlayed),
            scrolledToEnd: true,
            acknowledgedRiskAssessment: true,
        }
        : {
            riskReview: true,
            ppeConfirm: true,
            emergencyConfirm: true,
            audioPlayed: Boolean(audioPlayed),
            scrolledToEnd: true,
            acknowledgedRiskAssessment: true,
        };

    const insertedWorkerIds: string[] = [];

    for (const item of normalizedSignatures) {
        const worker = workerMap.get(item.workerId);
        if (!worker) continue;

        const match = item.signatureDataUrl.match(/^data:image\/png;base64,(.+)$/);
        if (!match?.[1]) {
            throw new Error(`서명 데이터 형식 오류: worker_id=${worker.id}`);
        }

        const binary = Buffer.from(match[1], 'base64');
        const path = buildSignatureStoragePath(sessionId, {
            prefix: `group_proxy/${worker.id}`,
        });

        const { error: uploadErr } = await supabase.storage.from('signatures').upload(path, binary, {
            contentType: 'image/png',
            upsert: false,
        });

        if (uploadErr) {
            throw new Error(`서명 업로드 실패(${worker.id}): ${uploadErr.message}`);
        }

        const publicUrl = supabase.storage.from('signatures').getPublicUrl(path).data.publicUrl;

        const { error: logErr } = await supabase.from('training_logs').insert({
            session_id: sessionId,
            worker_id: worker.id,
            worker_name: worker.name,
            nationality: worker.nationality || null,
            signature_url: publicUrl,
            audio_url: selectedAudioUrl || null,
            selected_language_code: selectedLanguageCode || null,
            is_manager_proxy: Boolean(isManagerProxy ?? true),
            signature_method: 'manager_group_proxy',
            submitted_at: new Date().toISOString(),
        });

        if (logErr) throw new Error(`training_logs 저장 실패(${worker.id}): ${logErr.message}`);

        const { error: ackErr } = await supabase.from('training_acknowledgements').upsert({
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

        if (ackErr) {
            console.warn('[submit-training] acknowledgement upsert skipped:', ackErr.message);
        }

        insertedWorkerIds.push(worker.id);
    }

    return { sessionId, insertedCount: insertedWorkerIds.length, workerIds: insertedWorkerIds, signatureMethod: 'manager_group_proxy' };
}

// -----------------------------------------------------------------------
// 메인 핸들러
// -----------------------------------------------------------------------
export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    try {
        const { type, payload } = req.body || {};

        if (!type) {
            return res.status(400).json({ ok: false, message: 'type 필드 필수 (single|group)' });
        }

        let data;

        switch (type) {
            case 'single':
                data = await handleSingleSignature(payload);
                break;

            case 'group':
                data = await handleGroupSignatures(payload);
                break;

            default:
                return res.status(400).json({ ok: false, message: `Unknown type: ${type}` });
        }

        return res.status(200).json({
            ok: true,
            type,
            data,
        });
    } catch (err: any) {
        console.error('[submit-training] error:', err);
        return res.status(500).json({ ok: false, message: err?.message || '서명 제출 실패' });
    }
}
