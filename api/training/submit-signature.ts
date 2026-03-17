import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

async function insertTrainingLogWithFallback(
    sessionId: string,
    workerName: string,
    nationality: unknown,
    signatureUrl: string,
    selectedAudioUrl: unknown,
) {
    const basePayload = {
        worker_name: workerName,
        nationality,
        signature_url: signatureUrl,
        audio_url: selectedAudioUrl || null,
        submitted_at: new Date().toISOString(),
    };

    const bySessionId = await supabase.from('training_logs').insert({
        session_id: sessionId,
        ...basePayload,
    });

    if (!bySessionId.error) {
        return { ok: true as const, key: 'session_id' as const };
    }

    const errorMessage = String(bySessionId.error?.message || '').toLowerCase();
    const needsTrainingIdFallback = errorMessage.includes('session_id') && errorMessage.includes('does not exist');
    if (!needsTrainingIdFallback) {
        throw new Error(bySessionId.error.message);
    }

    const byTrainingId = await supabase.from('training_logs').insert({
        training_id: sessionId,
        ...basePayload,
    });

    if (byTrainingId.error) {
        throw new Error(byTrainingId.error.message);
    }

    return { ok: true as const, key: 'training_id' as const };
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    try {
        const {
            sessionId,
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
            linkExpiresAt,
            linkToken,
        } = req.body || {};

        if (!sessionId || !workerName || !nationality || !signatureDataUrl) {
            return res.status(400).json({ ok: false, message: '필수값 누락' });
        }

        const normalizedWorkerName = String(workerName).trim();
        if (!normalizedWorkerName) {
            return res.status(400).json({ ok: false, message: '근로자 이름이 필요합니다.' });
        }

        const match = String(signatureDataUrl).match(/^data:image\/png;base64,(.+)$/);
        if (!match?.[1]) {
            return res.status(400).json({ ok: false, message: '서명 데이터 형식 오류' });
        }

        const hasEngagementProof = Boolean(reviewedGuidance) || Boolean(audioPlayed) || Boolean(scrolledToEnd);
        if (!hasEngagementProof) {
            return res.status(400).json({ ok: false, message: '오디오 재생 또는 대본 끝까지 읽기 기록이 필요합니다.' });
        }

        if (!acknowledgedRiskAssessment) {
            return res.status(400).json({ ok: false, message: '위험성평가 숙지 체크가 필요합니다.' });
        }

        const fileBuffer = Buffer.from(match[1], 'base64');
        const safeName = normalizedWorkerName.replace(/[^\w가-힣-]/g, '_');
        const path = `${sessionId}/${Date.now()}_${safeName}.png`;

        const upload = await supabase.storage.from('signatures').upload(path, fileBuffer, {
            contentType: 'image/png',
            upsert: false,
        });

        if (upload.error) throw new Error(upload.error.message);

        const pub = supabase.storage.from('signatures').getPublicUrl(path);
        const signatureUrl = pub.data.publicUrl;

        const logInsertResult = await insertTrainingLogWithFallback(
            sessionId,
            normalizedWorkerName,
            nationality,
            signatureUrl,
            selectedAudioUrl,
        );

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

        const ackInsert = await supabase.from('training_acknowledgements').upsert({
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

        if (ackInsert.error) {
            console.warn('[submit-signature] training_acknowledgements insert skipped:', ackInsert.error.message);
        }

        return res.status(200).json({
            ok: true,
            signatureUrl,
            comprehensionComplete,
            trainingLogsKey: logInsertResult.key,
        });
    } catch (error: any) {
        return res.status(500).json({ ok: false, message: error?.message || '서명 제출 실패' });
    }
}
