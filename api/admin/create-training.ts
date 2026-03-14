import { createClient } from '@supabase/supabase-js';

type LangCode =
    | 'ko-KR'
    | 'en-US'
    | 'vi-VN'
    | 'cmn-CN'
    | 'zh-CN'
    | 'th-TH'
    | 'id-ID'
    | 'uz-UZ'
    | 'mn-MN'
    | 'km-KH'
    | 'ru-RU'
    | 'ne-NP'
    | 'my-MM'
    | 'fil-PH'
    | 'hi-IN'
    | 'bn-BD'
    | 'ur-PK'
    | 'si-LK'
    | 'kk-KZ';

const ALL_LANGS: LangCode[] = [
    'ko-KR',
    'en-US',
    'vi-VN',
    'cmn-CN',
    'zh-CN',
    'th-TH',
    'id-ID',
    'uz-UZ',
    'mn-MN',
    'km-KH',
    'ru-RU',
    'ne-NP',
    'my-MM',
    'fil-PH',
    'hi-IN',
    'bn-BD',
    'ur-PK',
    'si-LK',
    'kk-KZ',
];

const LANGUAGE_CODE_ALIAS: Record<string, LangCode> = {
    'zh-CN': 'cmn-CN',
};

const TTS_LANGUAGE_CODE_CANDIDATES: Record<string, string[]> = {
    'vi-VN': ['vi-VN', 'vi'],
    'mn-MN': ['mn-MN', 'mn'],
    'ru-RU': ['ru-RU', 'ru'],
    'cmn-CN': ['cmn-CN', 'zh-CN', 'zh'],
    'zh-CN': ['cmn-CN', 'zh-CN', 'zh'],
    'km-KH': ['km-KH', 'km'],
    'id-ID': ['id-ID', 'id'],
};

class TtsSynthesisError extends Error {
    attempts: string[];

    constructor(message: string, attempts: string[]) {
        super(message);
        this.name = 'TtsSynthesisError';
        this.attempts = attempts;
    }
}

function normalizeLangCode(input: string): string {
    return LANGUAGE_CODE_ALIAS[input] || input;
}

function resolveGoogleTTSLanguageCode(inputLangCode: string): string {
    const normalized = normalizeLangCode(inputLangCode);

    if (normalized === 'vi-VN') return 'vi-VN';

    if (/^[a-z]{2,3}-[A-Z]{2}$/.test(normalized)) {
        return normalized;
    }

    return 'en-US';
}

function resolveGoogleTTSLanguageCandidates(inputLangCode: string): string[] {
    const normalized = resolveGoogleTTSLanguageCode(inputLangCode);
    const mapped = TTS_LANGUAGE_CODE_CANDIDATES[normalized] || [];
    const candidates = [normalized, ...mapped, 'en-US'];
    return Array.from(new Set(candidates.filter(Boolean)));
}

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
        throw new Error('Supabase 환경변수가 누락되었습니다. VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 확인해 주세요.');
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: psiAdminSecret
                ? { 'x-psi-admin-secret': psiAdminSecret }
                : {},
        },
    });
}

function sendJsonError(res: any, statusCode: number, message: string, details?: string) {
    const payload: { ok: false; error: string; message: string; details?: string } = {
        ok: false,
        error: message,
        message,
    };

    if (details) payload.details = details;
    return res.status(statusCode).json(payload);
}

function translateDummy(koText: string, lang: LangCode): string {
    if (lang === 'ko-KR') return koText;
    if (lang === 'en-US') return `[EN] ${koText}`;
    if (lang === 'vi-VN') return `[VI] ${koText}`;
    if (lang === 'cmn-CN') return `[ZH] ${koText}`;
    if (lang === 'zh-CN') return `[ZH] ${koText}`;
    if (lang === 'th-TH') return `[TH] ${koText}`;
    if (lang === 'id-ID') return `[ID] ${koText}`;
    if (lang === 'uz-UZ') return `[UZ] ${koText}`;
    if (lang === 'mn-MN') return `[MN] ${koText}`;
    if (lang === 'km-KH') return `[KM] ${koText}`;
    if (lang === 'ru-RU') return `[RU] ${koText}`;
    if (lang === 'ne-NP') return `[NE] ${koText}`;
    if (lang === 'my-MM') return `[MY] ${koText}`;
    if (lang === 'fil-PH') return `[FIL] ${koText}`;
    if (lang === 'hi-IN') return `[HI] ${koText}`;
    if (lang === 'bn-BD') return `[BN] ${koText}`;
    if (lang === 'ur-PK') return `[UR] ${koText}`;
    if (lang === 'si-LK') return `[SI] ${koText}`;
    if (lang === 'kk-KZ') return `[KK] ${koText}`;
    return koText;
}

async function synthesizeGoogleTTS(text: string, lang: LangCode): Promise<Buffer> {
    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_TTS_API_KEY가 없습니다.');

    const candidates = resolveGoogleTTSLanguageCandidates(lang);
    let lastError = '알 수 없는 오류';
    const failedAttempts: string[] = [];

    for (const languageCode of candidates) {
        const body = {
            input: { text },
            voice: {
                languageCode,
            },
            audioConfig: { audioEncoding: 'MP3' },
        };

        const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errText = await response.text();
            lastError = `${languageCode}: ${errText}`;
            failedAttempts.push(languageCode);
            continue;
        }

        const raw = await response.text();
        let data: any = null;

        try {
            data = raw ? JSON.parse(raw) : null;
        } catch {
            lastError = `${languageCode}: Google TTS 응답 JSON 파싱 실패`;
            failedAttempts.push(languageCode);
            continue;
        }

        if (!data?.audioContent) {
            lastError = `${languageCode}: TTS 응답에 audioContent가 없습니다.`;
            failedAttempts.push(languageCode);
            continue;
        }

        return Buffer.from(data.audioContent, 'base64');
    }

    throw new TtsSynthesisError(
        `Google TTS 실패(모든 languageCode 시도 실패, 시도값: ${failedAttempts.join(', ')}): ${lastError}`,
        failedAttempts
    );
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return sendJsonError(res, 405, 'Method Not Allowed');
    }

    try {
        const supabase = getSupabaseClient();
        const { sourceTextKo, selectedLanguages } = req.body || {};
        if (!sourceTextKo || typeof sourceTextKo !== 'string') {
            return sendJsonError(res, 400, 'sourceTextKo가 필요합니다.');
        }

        const requestedLanguages = Array.isArray(selectedLanguages)
            ? selectedLanguages
                .map((code: string) => normalizeLangCode(code))
                .filter((code): code is LangCode => ALL_LANGS.includes(code as LangCode))
            : [];

        const langs: LangCode[] = requestedLanguages.length > 0
            ? requestedLanguages
            : ['ko-KR', 'en-US', 'vi-VN', 'cmn-CN'];

        const insertRes = await supabase
            .from('training_sessions')
            .insert({
                source_text_ko: sourceTextKo,
                audio_urls: {},
            })
            .select('id')
            .single();

        if (insertRes.error || !insertRes.data?.id) {
            throw new Error(insertRes.error?.message || 'training_sessions insert 실패');
        }

        const sessionId = String(insertRes.data.id);
        const audioUrls: Record<string, string | null> = {};
        const translatedTexts: Record<string, string> = {};
        const failedLanguages: LangCode[] = [];
        const failedLanguageAttempts: Record<string, string[]> = {};

        for (const lang of langs) {
            const translated = translateDummy(sourceTextKo, lang);
            translatedTexts[lang] = translated;

            try {
                const mp3 = await synthesizeGoogleTTS(translated, lang);
                const path = `${sessionId}/${lang}.mp3`;

                const uploadRes = await supabase.storage.from('training_audio').upload(path, mp3, {
                    contentType: 'audio/mpeg',
                    upsert: true,
                });

                if (uploadRes.error) {
                    throw new Error(`training_audio 업로드 실패(${lang}): ${uploadRes.error.message}`);
                }

                const pub = supabase.storage.from('training_audio').getPublicUrl(path);
                audioUrls[lang] = pub.data.publicUrl;
            } catch (ttsError: any) {
                audioUrls[lang] = null;
                failedLanguages.push(lang);
                failedLanguageAttempts[lang] = ttsError instanceof TtsSynthesisError
                    ? ttsError.attempts
                    : resolveGoogleTTSLanguageCandidates(lang);
                console.warn(`[TTS 경고] ${lang} 언어 음성 생성 실패`, ttsError?.message || ttsError);
                continue;
            }
        }

        const updateRes = await supabase
            .from('training_sessions')
            .update({
                audio_urls: audioUrls,
                translated_texts: translatedTexts,
            })
            .eq('id', sessionId);

        if (updateRes.error) throw new Error(updateRes.error.message);

        const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || req.headers.origin || 'http://localhost:5173';
        const mobileUrl = `${baseUrl}/?mode=worker-training&sessionId=${encodeURIComponent(sessionId)}`;

        return res.status(200).json({
            ok: true,
            sessionId,
            mobileUrl,
            audioUrls,
            failedLanguages,
            failedLanguageAttempts,
        });
    } catch (error: any) {
        const message = error?.message || '서버 오류';
        return sendJsonError(res, 500, message);
    }
}
