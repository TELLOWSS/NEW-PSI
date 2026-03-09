import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    try {
        const { sessionId, workerName, nationality, selectedAudioUrl, signatureDataUrl } = req.body || {};

        if (!sessionId || !workerName || !nationality || !selectedAudioUrl || !signatureDataUrl) {
            return res.status(400).json({ ok: false, message: '필수값 누락' });
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
            audio_url: selectedAudioUrl,
            submitted_at: new Date().toISOString(),
        });

        if (insert.error) throw new Error(insert.error.message);

        return res.status(200).json({ ok: true, signatureUrl });
    } catch (error: any) {
        return res.status(500).json({ ok: false, message: error?.message || '서명 제출 실패' });
    }
}
