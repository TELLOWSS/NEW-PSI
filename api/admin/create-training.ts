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

    if (!supabaseUrl || (!supabaseServiceRoleKey && !supabaseAnonKey)) {
        throw new Error('Supabase 환경변수가 누락되었습니다. SUPABASE_SERVICE_ROLE_KEY 또는 VITE_SUPABASE_ANON_KEY를 확인해 주세요.');
    }

    const keyToUse = supabaseServiceRoleKey || supabaseAnonKey;
    const authMode = supabaseServiceRoleKey ? 'service_role' : 'anon_with_admin_header';

    const client = createClient(supabaseUrl, keyToUse, {
        global: {
            headers: psiAdminSecret
                ? { 'x-psi-admin-secret': psiAdminSecret }
                : {},
        },
    });

    return { client, authMode };
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

function createUuidV4() {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const rand = Math.floor(Math.random() * 16);
        const value = char === 'x' ? rand : ((rand & 0x3) | 0x8);
        return value.toString(16);
    });
}

function formatSupabaseError(error: any) {
    if (!error) return 'unknown';
    const parts = [error.message, error.details, error.hint, error.code]
        .filter((item) => typeof item === 'string' && item.trim().length > 0)
        .map((item) => String(item).trim());
    return parts.length > 0 ? parts.join(' | ') : JSON.stringify(error);
}

const TRANSLATION_TIMEOUT_MS = 7000;
const REQUEST_TIMEOUT_MS = 8000;

type CreateTrainingSuccessPayload = {
    ok: true;
    sessionId: string;
    mobileUrl: string;
    linkExpiresAt: number;
    ttlMinutes: number;
    audioUrls: Record<string, never>;
    translatedTexts: Record<string, string>;
    translationSkipped: boolean;
};

async function translateSingleLanguage(
    apiKey: string,
    sourceTextKo: string,
    languageCode: TrainingAudioLanguageCode,
): Promise<[TrainingAudioLanguageCode, string | null]> {
    const languageLabel = TRAINING_AUDIO_LANGUAGES.find((item) => item.code === languageCode)?.label || languageCode;

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
                                    '다음 한국어 위험성평가 교육 대본을 지정 언어로만 번역하세요.',
                                    '반드시 JSON 객체만 반환하고 키는 "translated"만 사용하세요.',
                                    '',
                                    `[대상 언어] ${languageCode} (${languageLabel})`,
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
        return [languageCode, null];
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const translated = typeof parsed?.translated === 'string' ? parsed.translated.trim() : '';

    return [languageCode, translated || null];
}

async function translateScriptsParallelWithTimeout(
    sourceTextKo: string,
    targetLanguages: TrainingAudioLanguageCode[],
): Promise<Record<string, string>> {
    const apiKey = resolveGeminiApiKey();
    if (!sourceTextKo.trim() || !apiKey) {
        return {};
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
        const translationTask = Promise.all(
            targetLanguages.map((languageCode) => translateSingleLanguage(apiKey, sourceTextKo, languageCode))
        );

        const timeoutTask = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('TRANSLATION_TIMEOUT')), TRANSLATION_TIMEOUT_MS);
        });

        const entries = await Promise.race([translationTask, timeoutTask]);
        const translatedTexts: Record<string, string> = {};

        for (const [code, value] of entries) {
            if (value) translatedTexts[code] = value;
        }

        if (sourceTextKo.trim()) {
            translatedTexts['ko-KR'] = sourceTextKo;
        }

        return translatedTexts;
    } catch (error: any) {
        console.error('[create-training] translation failed or timed out', {
            message: error?.message || 'unknown',
        });
        return {};
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

async function executeCreateTraining(req: any): Promise<CreateTrainingSuccessPayload> {
    const { client: supabase, authMode } = getSupabaseClient();
    const requestBody = typeof req.body === 'string'
        ? (() => {
            try {
                return JSON.parse(req.body || '{}');
            } catch {
                return {};
            }
        })()
        : (req.body || {});

    const { sourceTextKo, selectedLanguages } = requestBody;

    const normalizedSourceText = typeof sourceTextKo === 'string' ? sourceTextKo.trim() : '';
    const shouldSkipTranslation = !normalizedSourceText;

    const requestedLanguages = Array.isArray(selectedLanguages)
        ? selectedLanguages.filter((code: string): code is TrainingAudioLanguageCode => TRAINING_AUDIO_LANGUAGE_SET.has(code))
        : [];

    const langs = requestedLanguages.length > 0
        ? requestedLanguages
        : [...TRAINING_AUDIO_LANGUAGE_CODES];

    const translatedTexts = shouldSkipTranslation
        ? {}
        : await translateScriptsParallelWithTimeout(normalizedSourceText, langs);

    if (shouldSkipTranslation) {
        console.info('[create-training] translation skipped', {
            reason: 'empty_source_text',
        });
    }

    const emptyAudioUrls: Record<string, never> = {};
    const generatedId = createUuidV4();
    const insertCandidates: Array<Record<string, unknown>> = [
        {
            id: generatedId,
            source_text_ko: normalizedSourceText,
            original_script: normalizedSourceText,
            audio_urls: emptyAudioUrls,
            translated_texts: translatedTexts,
        },
        {
            id: generatedId,
            source_text_ko: normalizedSourceText,
            original_script: normalizedSourceText,
            audio_urls: emptyAudioUrls,
        },
        {
            id: generatedId,
            source_text_ko: normalizedSourceText,
            audio_urls: emptyAudioUrls,
        },
        {
            id: generatedId,
            source_text_ko: normalizedSourceText,
        },
        {},
    ];

    let insertedSessionId = '';
    let lastInsertErrorMessage = '';

    for (let index = 0; index < insertCandidates.length; index += 1) {
        const candidate = insertCandidates[index];
        const insertRes = await supabase
            .from('training_sessions')
            .insert(candidate)
            .select('id')
            .single();

        if (!insertRes.error && insertRes.data?.id) {
            insertedSessionId = String(insertRes.data.id);
            break;
        }

        lastInsertErrorMessage = formatSupabaseError(insertRes.error);
        console.error('[create-training] insert attempt failed', {
            attempt: index + 1,
            candidateKeys: Object.keys(candidate),
            authMode,
            error: insertRes.error,
        });
    }

    if (!insertedSessionId) {
        throw new Error(`training_sessions insert 실패 | auth=${authMode} | ${lastInsertErrorMessage || 'unknown error'}`);
    }

    const sessionId = insertedSessionId;
    const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || req.headers.origin || 'http://localhost:5173';
    const { mobileUrl, linkExpiresAt, ttlMinutes } = buildSignedTrainingMobileUrl(baseUrl, sessionId, resolveLinkTtlMinutes());

    return {
        ok: true,
        sessionId,
        mobileUrl,
        linkExpiresAt,
        ttlMinutes,
        audioUrls: {},
        translatedTexts,
        translationSkipped: shouldSkipTranslation,
    };
}

export default async function handler(req: any, res: any) {
    try {
        if (req.method !== 'POST') {
            return sendJsonError(res, 405, 'Method Not Allowed');
        }

        const result = await Promise.race([
            executeCreateTraining(req),
            new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), REQUEST_TIMEOUT_MS);
            }),
        ]);

        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Create Training Error:', error);

        if (error?.message === 'REQUEST_TIMEOUT') {
            return sendJsonError(res, 504, '요청 시간 초과', `8초 제한을 초과하여 요청을 중단했습니다. (${REQUEST_TIMEOUT_MS}ms)`);
        }

        return res.status(500).json({
            ok: false,
            error: '서버 내부 오류',
            message: '서버 내부 오류',
            details: error?.message || 'Unknown error',
        });
    }
}
