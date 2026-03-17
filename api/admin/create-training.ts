import { createClient } from '@supabase/supabase-js';
import { buildSignedTrainingMobileUrl, resolveLinkTtlMinutes } from '../shared/trainingLinkToken';
import {
    TRAINING_AUDIO_LANGUAGE_CODES,
    TRAINING_AUDIO_LANGUAGES,
    TRAINING_AUDIO_LANGUAGE_SET,
    type TrainingAudioLanguageCode,
} from '../../utils/trainingLanguageUtils';

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

function resolveGeminiApiKey() {
    return (
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        ''
    );
}

async function translateScripts(
    sourceTextKo: string,
    targetLanguages: TrainingAudioLanguageCode[],
): Promise<Record<string, string>> {
    const fallback = Object.fromEntries(
        targetLanguages.map((code) => [code, sourceTextKo])
    ) as Record<string, string>;

    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
        return {
            ...fallback,
            'ko-KR': sourceTextKo,
        };
    }

    const languageGuide = TRAINING_AUDIO_LANGUAGES
        .map((item) => `- ${item.code}: ${item.label}`)
        .join('\n');

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: [
                                        '다음 한국어 위험성평가 교육 대본을 각 언어로 자연스럽고 현장 안전교육 문체로 번역하세요.',
                                        '반드시 JSON 객체만 반환하고, 키는 언어코드 그대로 유지하세요.',
                                        '값은 번역 문자열만 넣으세요.',
                                        '',
                                        '[언어 목록]',
                                        languageGuide,
                                        '',
                                        '[원문]',
                                        sourceTextKo,
                                    ].join('\n'),
                                },
                            ],
                        },
                    ],
                    generationConfig: {
                        temperature: 0.2,
                        responseMimeType: 'application/json',
                    },
                }),
            }
        );

        if (!response.ok) {
            return {
                ...fallback,
                'ko-KR': sourceTextKo,
            };
        }

        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        const translated: Record<string, string> = {};

        targetLanguages.forEach((code) => {
            const value = parsed[code];
            translated[code] = typeof value === 'string' && value.trim()
                ? value.trim()
                : fallback[code];
        });

        translated['ko-KR'] = sourceTextKo;
        return translated;
    } catch {
        return {
            ...fallback,
            'ko-KR': sourceTextKo,
        };
    }
}

export default async function handler(req: any, res: any) {
    try {
        if (req.method !== 'POST') {
            return sendJsonError(res, 405, 'Method Not Allowed');
        }

        const supabase = getSupabaseClient();
        const { sourceTextKo, selectedLanguages } = req.body || {};

        const normalizedSourceText = typeof sourceTextKo === 'string' ? sourceTextKo.trim() : '';
        if (!normalizedSourceText) {
            return sendJsonError(res, 400, 'sourceTextKo가 필요합니다.');
        }

        const requestedLanguages = Array.isArray(selectedLanguages)
            ? selectedLanguages.filter((code: string): code is TrainingAudioLanguageCode => TRAINING_AUDIO_LANGUAGE_SET.has(code))
            : [];

        const langs = requestedLanguages.length > 0
            ? requestedLanguages
            : [...TRAINING_AUDIO_LANGUAGE_CODES];

        const translatedTexts = await translateScripts(normalizedSourceText, langs);
        const emptyAudioUrls = {} as Record<string, never>;

        let insertRes = await supabase
            .from('training_sessions')
            .insert({
                source_text_ko: normalizedSourceText,
                original_script: normalizedSourceText,
                audio_urls: emptyAudioUrls,
                translated_texts: translatedTexts,
            })
            .select('id')
            .single();

        if (insertRes.error) {
            // 하위 스키마 호환: optional 컬럼이 없는 DB에서도 세션 생성 시도
            insertRes = await supabase
                .from('training_sessions')
                .insert({
                    source_text_ko: normalizedSourceText,
                    audio_urls: {},
                })
                .select('id')
                .single();
        }

        if (insertRes.error || !insertRes.data?.id) {
            throw new Error(insertRes.error?.message || 'training_sessions insert 실패');
        }

        const sessionId = String(insertRes.data.id);
        const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || req.headers.origin || 'http://localhost:5173';
        const { mobileUrl, linkExpiresAt, ttlMinutes } = buildSignedTrainingMobileUrl(baseUrl, sessionId, resolveLinkTtlMinutes());

        return res.status(200).json({
            ok: true,
            sessionId,
            mobileUrl,
            linkExpiresAt,
            ttlMinutes,
            audioUrls: {},
            translatedTexts,
        });
    } catch (error: any) {
        console.error('Create Training Error:', error);
        return res.status(500).json({
            error: '서버 내부 오류',
            details: error?.message || 'Unknown error',
        });
    }
}
