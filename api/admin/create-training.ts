import { createClient } from '@supabase/supabase-js';
import { buildSignedTrainingMobileUrl, resolveLinkTtlMinutes } from '../shared/trainingLinkToken';
import {
    TRAINING_AUDIO_LANGUAGE_CODES,
    TRAINING_AUDIO_LANGUAGES,
    TRAINING_AUDIO_LANGUAGE_SET,
    type TrainingAudioLanguageCode,
} from '../../utils/trainingLanguageUtils';

// ─── 순수 유틸 (throw 없음) ─────────────────────────────────────────────────

function safeGetEnv(): {
    supabaseUrl: string;
    supabaseKey: string;
    authMode: string;
    psiAdminSecret: string;
    geminiApiKey: string;
    appBaseUrl: string;
    envError: string | null;
} {
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
    const geminiApiKey =
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        '';
    const appBaseUrl =
        process.env.NEXT_PUBLIC_APP_BASE_URL || '';

    const supabaseKey = supabaseServiceRoleKey || supabaseAnonKey;
    const authMode = supabaseServiceRoleKey ? 'service_role' : 'anon_with_admin_header';
    const envError = !supabaseUrl || !supabaseKey
        ? `환경변수 누락: VITE_SUPABASE_URL=${!!supabaseUrl}, SUPABASE_KEY=${!!supabaseKey}`
        : null;

    return { supabaseUrl, supabaseKey, authMode, psiAdminSecret, geminiApiKey, appBaseUrl, envError };
}

function createUuidV4(): string {
    try {
        if (typeof globalThis.crypto?.randomUUID === 'function') {
            return globalThis.crypto.randomUUID();
        }
    } catch {
        // 폴백
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const rand = Math.floor(Math.random() * 16);
        const value = char === 'x' ? rand : ((rand & 0x3) | 0x8);
        return value.toString(16);
    });
}

function formatSupabaseError(error: any): string {
    if (!error) return 'unknown';
    const parts = [error.message, error.details, error.hint, error.code]
        .filter((item) => typeof item === 'string' && String(item).trim().length > 0)
        .map((item) => String(item).trim());
    return parts.length > 0 ? parts.join(' | ') : JSON.stringify(error);
}

// ─── 번역: 언어 1개 (절대 throw 안 함) ────────────────────────────────────

async function translateSingleLanguageSafe(
    apiKey: string,
    sourceTextKo: string,
    languageCode: TrainingAudioLanguageCode,
): Promise<[TrainingAudioLanguageCode, string | null]> {
    try {
        const languageLabel =
            TRAINING_AUDIO_LANGUAGES.find((item) => item.code === languageCode)?.label || languageCode;

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
                    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
                }),
            }
        );

        if (!response.ok) return [languageCode, null];

        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        const translated = typeof parsed?.translated === 'string' ? parsed.translated.trim() : '';
        return [languageCode, translated || null];
    } catch {
        return [languageCode, null];
    }
}

// ─── 번역 전체: 병렬 + 7초 강제 타임아웃 (절대 throw 안 함) ─────────────────

async function translateParallelSafe(
    sourceTextKo: string,
    apiKey: string,
    langs: TrainingAudioLanguageCode[],
): Promise<Record<string, string>> {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    try {
        const workPromise = Promise.all(
            langs.map((code) => translateSingleLanguageSafe(apiKey, sourceTextKo, code))
        // Promise.all 내부 개별 항목은 이미 절대 throw 안 하므로 추가 .catch 불필요
        );

        const timerPromise = new Promise<'TIMEOUT'>((resolve) => {
            timerId = setTimeout(() => resolve('TIMEOUT'), 7000);
        });

        const raceResult = await Promise.race([workPromise, timerPromise]);

        if (raceResult === 'TIMEOUT') {
            console.warn('[create-training] translation timed out after 7s, skipping');
            // race 패자(workPromise)가 나중에 resolve/reject돼도 프로세스가 죽지 않도록
            // 명시적으로 빈 catch 연결
            workPromise.catch(() => {});
            return {};
        }

        const texts: Record<string, string> = {};
        for (const [code, value] of raceResult) {
            if (value) texts[code] = value;
        }
        texts['ko-KR'] = sourceTextKo;
        return texts;
    } catch {
        return {};
    } finally {
        if (timerId) clearTimeout(timerId);
    }
}

// ─── 핸들러 (단일 try-catch, 절대 죽지 않는 구조) ────────────────────────────

export default async function handler(req: any, res: any) {
    try {
        // 1) METHOD 체크
        if (req.method !== 'POST') {
            return res.status(405).json({ ok: false, error: 'Method Not Allowed', message: 'Method Not Allowed' });
        }

        // 2) 환경변수 사전 검사 (throw 없이 즉시 응답)
        const env = safeGetEnv();
        if (env.envError) {
            console.error('[create-training] env missing:', env.envError);
            return res.status(500).json({
                ok: false,
                error: '환경변수 누락',
                message: env.envError,
                details: 'Supabase URL/KEY 환경변수를 Vercel 대시보드에서 설정해 주세요.',
            });
        }

        // 3) Supabase 클라이언트 지연 초기화 (here, inside handler)
        const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
            global: {
                headers: env.psiAdminSecret ? { 'x-psi-admin-secret': env.psiAdminSecret } : {},
            },
        });

        // 4) 요청 본문 파싱
        let requestBody: Record<string, unknown> = {};
        try {
            requestBody = typeof req.body === 'string'
                ? JSON.parse(req.body || '{}')
                : (req.body || {});
        } catch {
            requestBody = {};
        }

        const { sourceTextKo, selectedLanguages } = requestBody as {
            sourceTextKo?: unknown;
            selectedLanguages?: unknown;
        };

        const normalizedSourceText = typeof sourceTextKo === 'string' ? sourceTextKo.trim() : '';

        // 5) 번역 (빈 텍스트면 즉시 스킵, 아니면 병렬+7초 타임아웃)
        let translatedTexts: Record<string, string> = {};
        const shouldSkipTranslation = !normalizedSourceText || !env.geminiApiKey;

        if (!shouldSkipTranslation) {
            const requestedLanguages = Array.isArray(selectedLanguages)
                ? (selectedLanguages as string[]).filter(
                      (code): code is TrainingAudioLanguageCode => TRAINING_AUDIO_LANGUAGE_SET.has(code)
                  )
                : [];
            const langs = requestedLanguages.length > 0 ? requestedLanguages : [...TRAINING_AUDIO_LANGUAGE_CODES];
            translatedTexts = await translateParallelSafe(normalizedSourceText, env.geminiApiKey, langs);
        }

        // 6) DB Insert (다단계 fallback)
        const generatedId = createUuidV4();
        const insertCandidates: Array<Record<string, unknown>> = [
            { id: generatedId, source_text_ko: normalizedSourceText, original_script: normalizedSourceText, audio_urls: {}, translated_texts: translatedTexts },
            { id: generatedId, source_text_ko: normalizedSourceText, original_script: normalizedSourceText, audio_urls: {} },
            { id: generatedId, source_text_ko: normalizedSourceText, audio_urls: {} },
            { id: generatedId, source_text_ko: normalizedSourceText },
            {},
        ];

        let insertedSessionId = '';
        let lastInsertError = '';

        for (let i = 0; i < insertCandidates.length; i += 1) {
            try {
                const insertRes = await supabase
                    .from('training_sessions')
                    .insert(insertCandidates[i])
                    .select('id')
                    .single();

                if (!insertRes.error && insertRes.data?.id) {
                    insertedSessionId = String(insertRes.data.id);
                    break;
                }
                lastInsertError = formatSupabaseError(insertRes.error);
                console.error('[create-training] insert attempt', i + 1, 'failed:', lastInsertError);
            } catch (insertErr: any) {
                lastInsertError = insertErr?.message || 'insert exception';
                console.error('[create-training] insert attempt', i + 1, 'exception:', lastInsertError);
            }
        }

        if (!insertedSessionId) {
            return res.status(500).json({
                ok: false,
                error: 'DB Insert 실패',
                message: `training_sessions insert 실패 | auth=${env.authMode}`,
                details: lastInsertError || 'unknown',
            });
        }

        // 7) 링크 생성
        const baseUrl = env.appBaseUrl || req.headers?.origin || 'http://localhost:5173';
        let mobileUrl = '';
        let linkExpiresAt = 0;
        let ttlMinutes = 0;
        try {
            const linkResult = buildSignedTrainingMobileUrl(baseUrl, insertedSessionId, resolveLinkTtlMinutes());
            mobileUrl = linkResult.mobileUrl;
            linkExpiresAt = linkResult.linkExpiresAt;
            ttlMinutes = linkResult.ttlMinutes;
        } catch (linkErr: any) {
            console.error('[create-training] link build failed:', linkErr?.message);
        }

        return res.status(200).json({
            ok: true,
            sessionId: insertedSessionId,
            mobileUrl,
            linkExpiresAt,
            ttlMinutes,
            audioUrls: {},
            translatedTexts,
            translationSkipped: shouldSkipTranslation,
        });

    } catch (error: any) {
        // 최종 방어망: 어떤 에러도 여기서 잡아 JSON으로 반환
        console.error('[create-training] unhandled error:', error);
        return res.status(500).json({
            ok: false,
            error: '서버 로직 에러',
            message: '서버 로직 에러',
            details: error?.message || 'Unknown error',
        });
    }
}
