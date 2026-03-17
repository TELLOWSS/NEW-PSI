import { createClient } from '@supabase/supabase-js';
import {
    TRAINING_AUDIO_LANGUAGE_CODES,
    TRAINING_AUDIO_LANGUAGE_SET,
    type TrainingAudioLanguageCode,
} from '../../utils/trainingLanguageUtils';

type UploadItem = {
    fileName: string;
    contentType: string;
    base64: string;
};

function getSupabaseClient() {
    const supabaseUrl =
        process.env.VITE_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        '';
    const supabaseAnonKey =
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        '';
    const psiAdminSecret =
        process.env.VITE_PSI_ADMIN_SECRET ||
        process.env.PSI_ADMIN_SECRET ||
        '';

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase 환경변수가 누락되었습니다.');
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: psiAdminSecret ? { 'x-psi-admin-secret': psiAdminSecret } : {},
        },
    });
}

function sendJsonError(res: any, statusCode: number, message: string) {
    return res.status(statusCode).json({ ok: false, error: message, message });
}

function normalizeBase64(raw: string) {
    return String(raw || '').replace(/^data:audio\/mpeg;base64,/i, '').trim();
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return sendJsonError(res, 405, 'Method Not Allowed');
    }

    try {
        const { sessionId, originalScript, files } = req.body || {};
        if (!sessionId || typeof sessionId !== 'string') {
            return sendJsonError(res, 400, 'sessionId가 필요합니다.');
        }

        const fileEntries = (files && typeof files === 'object') ? Object.entries(files as Record<string, UploadItem>) : [];
        const supabase = getSupabaseClient();
        const audioUrls = Object.fromEntries(
            TRAINING_AUDIO_LANGUAGE_CODES.map((code) => [code, null])
        ) as Record<TrainingAudioLanguageCode, string | null>;

        for (const [code, item] of fileEntries) {
            if (!TRAINING_AUDIO_LANGUAGE_SET.has(code)) continue;
            if (!item || typeof item !== 'object') continue;

            const contentType = String(item.contentType || '');
            const fileName = String(item.fileName || `${code}.mp3`);
            const base64 = normalizeBase64(item.base64);

            if (!base64) continue;
            if (!(contentType === 'audio/mpeg' || fileName.toLowerCase().endsWith('.mp3'))) {
                return sendJsonError(res, 400, `${code} 파일은 MP3만 허용됩니다.`);
            }

            const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `${sessionId}/${code}-${safeFileName}`;
            const binary = Buffer.from(base64, 'base64');

            const uploadRes = await supabase.storage.from('training_audio').upload(path, binary, {
                contentType: 'audio/mpeg',
                upsert: true,
            });

            if (uploadRes.error) {
                throw new Error(`${code} 업로드 실패: ${uploadRes.error.message}`);
            }

            const publicUrl = supabase.storage.from('training_audio').getPublicUrl(path).data.publicUrl;
            audioUrls[code as TrainingAudioLanguageCode] = `${publicUrl}?v=${Date.now()}`;
        }

        const updateRes = await supabase
            .from('training_sessions')
            .update({
                audio_urls: audioUrls,
                original_script: typeof originalScript === 'string' ? originalScript : null,
            })
            .eq('id', sessionId);

        if (updateRes.error) {
            throw new Error(updateRes.error.message);
        }

        const missingLanguages = TRAINING_AUDIO_LANGUAGE_CODES.filter((code) => !audioUrls[code]);
        return res.status(200).json({ ok: true, sessionId, audioUrls, missingLanguages });
    } catch (error: any) {
        return sendJsonError(res, 500, error?.message || 'training audio 업로드 실패');
    }
}
