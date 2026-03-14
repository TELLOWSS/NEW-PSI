import { createClient } from '@supabase/supabase-js';
import { verifyTrainingLinkToken } from '../shared/trainingLinkToken';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    try {
        const {
            sessionId,
            workerName,
            nationality,
            selectedAudioUrl,
            signatureDataUrl,
            linkExpiresAt,
            linkToken,
        } = req.body || {};

        if (!sessionId || !workerName || !nationality || !signatureDataUrl) {
            return res.status(400).json({ ok: false, message: '필수값 누락' });
        }

        const tokenVerification = verifyTrainingLinkToken(String(sessionId), linkExpiresAt, linkToken);
        if (!tokenVerification.ok) {
            const message = tokenVerification.reason === 'expired'
                ? '링크 유효기간이 만료되었습니다. 관리자에게 재발급을 요청해 주세요.'
                : '유효하지 않은 접속 링크입니다. 관리자에게 올바른 링크를 요청해 주세요.';
            return res.status(403).json({ ok: false, message });
        }

        const normalizedWorkerName = String(workerName).trim().toLowerCase();
        const duplicateCheck = await supabase
            .from('training_logs')
            .select('id, worker_name')
            .eq('session_id', sessionId)
            .limit(2000);

        if (duplicateCheck.error) {
            throw new Error(duplicateCheck.error.message);
        }

        const hasDuplicate = (duplicateCheck.data || []).some((row: any) => {
            const existingName = String(row?.worker_name || '').trim().toLowerCase();
            return existingName === normalizedWorkerName;
        });

        if (hasDuplicate) {
            return res.status(409).json({
                ok: false,
                message: '이미 제출된 이름입니다. 관리자에게 확인해 주세요.',
            });
        }

        const match = String(signatureDataUrl).match(/^data:image\/png;base64,(.+)$/);
        if (!match?.[1]) {
            return res.status(400).json({ ok: false, message: '서명 데이터 형식 오류' });
        }

        const fileBuffer = Buffer.from(match[1], 'base64');
        const safeName = String(workerName).replace(/[^\w가-힣-]/g, '_');
        const path = `${sessionId}/${Date.now()}_${safeName}.png`;

        const upload = await supabase.storage.from('signatures').upload(path, fileBuffer, {
            contentType: 'image/png',
            upsert: false,
        });

        if (upload.error) throw new Error(upload.error.message);

        const pub = supabase.storage.from('signatures').getPublicUrl(path);
        const signatureUrl = pub.data.publicUrl;

        const insert = await supabase.from('training_logs').insert({
            session_id: sessionId,
            worker_name: workerName,
            nationality,
            signature_url: signatureUrl,
            audio_url: selectedAudioUrl || null,
            submitted_at: new Date().toISOString(),
        });

        if (insert.error) throw new Error(insert.error.message);

        return res.status(200).json({ ok: true, signatureUrl });
    } catch (error: any) {
        return res.status(500).json({ ok: false, message: error?.message || '서명 제출 실패' });
    }
}
