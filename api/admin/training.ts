import { createClient } from '@supabase/supabase-js';
import { buildSignedTrainingMobileUrl, resolveLinkTtlMinutes } from '../../lib/server/trainingLinkToken.js';
import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../../lib/server/adminAuthGuard.js';

type TrainingAudioLanguageCode =
    | 'ko-KR'
    | 'cmn-CN'
    | 'vi-VN'
    | 'km-KH'
    | 'id-ID'
    | 'ms-MY'
    | 'mn-MN'
    | 'my-MM'
    | 'ru-RU'
    | 'uz-UZ'
    | 'th-TH'
    | 'kk-KZ';

const TRAINING_AUDIO_LANGUAGE_CODES: TrainingAudioLanguageCode[] = [
    'ko-KR',
    'cmn-CN',
    'vi-VN',
    'km-KH',
    'id-ID',
    'ms-MY',
    'mn-MN',
    'my-MM',
    'ru-RU',
    'uz-UZ',
    'th-TH',
    'kk-KZ',
];

const TRAINING_AUDIO_LANGUAGE_LABELS: Record<TrainingAudioLanguageCode, string> = {
    'ko-KR': '한국어',
    'cmn-CN': '중국어',
    'vi-VN': '베트남어',
    'km-KH': '크메르어',
    'id-ID': '인도네시아어',
    'ms-MY': '말레이시아어',
    'mn-MN': '몽골어',
    'my-MM': '미얀마어',
    'ru-RU': '러시아어',
    'uz-UZ': '우즈베크어',
    'th-TH': '태국어',
    'kk-KZ': '카자흐어',
};

const TRAINING_AUDIO_LANGUAGE_SET = new Set<string>(TRAINING_AUDIO_LANGUAGE_CODES);

type UploadItem = {
    fileName: string;
    contentType: string;
    base64: string;
};

type TrainingAction =
    | 'create'
    | 'reissue-link'
    | 'list-sessions'
    | 'dashboard-summary'
    | 'awareness-stats'
    | 'upload-audio'
    | 'delete-session';

function safeGetEnv() {
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
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || '';

    const supabaseKey = supabaseServiceRoleKey || supabaseAnonKey;
    const authMode = supabaseServiceRoleKey ? 'service_role' : 'anon_with_admin_header';
    const envError = !supabaseUrl || !supabaseKey
        ? `환경변수 누락: VITE_SUPABASE_URL=${!!supabaseUrl}, SUPABASE_KEY=${!!supabaseKey}`
        : null;

    return { supabaseUrl, supabaseKey, authMode, psiAdminSecret, geminiApiKey, appBaseUrl, envError };
}

function getSupabaseClient() {
    const env = safeGetEnv();
    if (env.envError) {
        throw new Error(env.envError);
    }

    return createClient(env.supabaseUrl, env.supabaseKey, {
        global: {
            headers: env.psiAdminSecret ? { 'x-psi-admin-secret': env.psiAdminSecret } : {},
        },
    });
}

function sendJsonError(res: any, statusCode: number, message: string) {
    return res.status(statusCode).json({
        ok: false,
        error: message,
        message,
    });
}

async function handleListSessions(res: any) {
    const supabase = getSupabaseClient();
    const result = await supabase
        .from('training_sessions')
        .select('id, source_text_ko, audio_urls, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

    if (result.error) {
        return sendJsonError(res, 500, formatSupabaseError(result.error));
    }

    return res.status(200).json({ ok: true, sessions: result.data || [] });
}

async function handleDashboardSummary(res: any) {
    const supabase = getSupabaseClient();
    const [sessionsResult, submissionsResult] = await Promise.all([
        supabase.from('training_sessions').select('id', { count: 'exact', head: true }),
        supabase.from('training_logs').select('id', { count: 'exact', head: true }),
    ]);

    if (sessionsResult.error) {
        return sendJsonError(res, 500, formatSupabaseError(sessionsResult.error));
    }

    return res.status(200).json({
        ok: true,
        summary: {
            trainingSessions: sessionsResult.count || 0,
            trainingSubmissions: submissionsResult.error ? null : (submissionsResult.count || 0),
        },
    });
}

function createUuidV4(): string {
    try {
        if (typeof globalThis.crypto?.randomUUID === 'function') {
            return globalThis.crypto.randomUUID();
        }
    } catch {
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

function normalizeBase64(raw: string) {
    return String(raw || '').replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, '').trim();
}

function resolveChecklistComplete(checklist: unknown): boolean {
    if (!checklist || typeof checklist !== 'object') return false;
    const value = checklist as Record<string, unknown>;
    return Boolean(value.riskReview) && Boolean(value.ppeConfirm) && Boolean(value.emergencyConfirm);
}

async function translateSingleLanguageSafe(
    apiKey: string,
    sourceTextKo: string,
    languageCode: TrainingAudioLanguageCode,
): Promise<[TrainingAudioLanguageCode, string | null]> {
    try {
        const languageLabel = TRAINING_AUDIO_LANGUAGE_LABELS[languageCode] || languageCode;

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

async function translateParallelSafe(
    sourceTextKo: string,
    apiKey: string,
    langs: TrainingAudioLanguageCode[],
): Promise<Record<string, string>> {
    let timerId: ReturnType<typeof setTimeout> | null = null;

    try {
        const workPromise = Promise.all(
            langs.map((code) => translateSingleLanguageSafe(apiKey, sourceTextKo, code))
        );

        const timerPromise = new Promise<'TIMEOUT'>((resolve) => {
            timerId = setTimeout(() => resolve('TIMEOUT'), 7000);
        });

        const raceResult = await Promise.race([workPromise, timerPromise]);

        if (raceResult === 'TIMEOUT') {
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

async function handleCreate(req: any, res: any, body: Record<string, unknown>) {
    const env = safeGetEnv();
    if (env.envError) {
        return res.status(500).json({
            ok: false,
            error: '환경변수 누락',
            message: env.envError,
            details: 'Supabase URL/KEY 환경변수를 Vercel 대시보드에서 설정해 주세요.',
        });
    }

    const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
        global: {
            headers: env.psiAdminSecret ? { 'x-psi-admin-secret': env.psiAdminSecret } : {},
        },
    });

    const sourceTextKo = body.sourceTextKo;
    const selectedLanguages = body.selectedLanguages;
    const trainingTitle = body.trainingTitle;
    const trainingCategory = body.trainingCategory;
    const targetMode = body.targetMode;
    const targetWorkerNames = body.targetWorkerNames;

    const normalizedSourceText = typeof sourceTextKo === 'string' ? sourceTextKo.trim() : '';
    const normalizedTrainingTitle = typeof trainingTitle === 'string' ? trainingTitle.trim() : '';
    const normalizedTrainingCategory = trainingCategory === 'special_safety' ? 'special_safety' : 'monthly_risk';
    const normalizedTargetMode = targetMode === 'attendance_only' ? 'attendance_only' : 'submitted_only';
    const normalizedTargetWorkerNames = Array.isArray(targetWorkerNames)
        ? Array.from(
            new Set(
                targetWorkerNames
                    .map((item: unknown) => String(item || '').trim())
                    .filter((item: string) => item.length > 0)
            )
        ).slice(0, 5000)
        : [];

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

    const generatedId = createUuidV4();
    const insertCandidates: Array<Record<string, unknown>> = [
        {
            id: generatedId,
            source_text_ko: normalizedSourceText,
            original_script: normalizedSourceText,
            audio_urls: {},
            translated_texts: translatedTexts,
            training_title: normalizedTrainingTitle || null,
            training_category: normalizedTrainingCategory,
            target_mode: normalizedTargetMode,
            target_worker_names: normalizedTargetWorkerNames,
        },
        {
            id: generatedId,
            source_text_ko: normalizedSourceText,
            original_script: normalizedSourceText,
            audio_urls: {},
            translated_texts: translatedTexts,
            training_title: normalizedTrainingTitle || null,
            training_category: normalizedTrainingCategory,
            target_mode: normalizedTargetMode,
        },
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
        } catch (insertErr: any) {
            lastInsertError = insertErr?.message || 'insert exception';
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

    const baseUrl = env.appBaseUrl || req.headers?.origin || 'http://localhost:5173';
    let mobileUrl = '';
    let linkExpiresAt = 0;
    let ttlMinutes = 0;

    try {
        const linkResult = buildSignedTrainingMobileUrl(baseUrl, insertedSessionId, resolveLinkTtlMinutes());
        mobileUrl = linkResult.mobileUrl;
        linkExpiresAt = linkResult.linkExpiresAt;
        ttlMinutes = linkResult.ttlMinutes;
    } catch {
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
}

async function handleReissue(req: any, res: any, body: Record<string, unknown>) {
    const sessionId = String(body.sessionId || '');
    if (!sessionId) {
        return sendJsonError(res, 400, 'sessionId가 필요합니다.');
    }

    const supabase = getSupabaseClient();
    const sessionQuery = await supabase
        .from('training_sessions')
        .select('id')
        .eq('id', sessionId)
        .single();

    if (sessionQuery.error || !sessionQuery.data?.id) {
        return sendJsonError(res, 404, '세션을 찾을 수 없습니다.');
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || req.headers.origin || 'http://localhost:5173';
    const { mobileUrl, linkExpiresAt, ttlMinutes } = buildSignedTrainingMobileUrl(baseUrl, sessionId, resolveLinkTtlMinutes());

    return res.status(200).json({
        ok: true,
        sessionId,
        mobileUrl,
        linkExpiresAt,
        ttlMinutes,
    });
}

async function handleAwarenessStats(res: any, body: Record<string, unknown>) {
    const sessionId = String(body.sessionId || '');
    if (!sessionId) {
        return sendJsonError(res, 400, 'sessionId가 필요합니다.');
    }

    const supabase = getSupabaseClient();

    const logsResult = await supabase
        .from('training_logs')
        .select('worker_name, nationality')
        .eq('session_id', sessionId)
        .limit(5000);

    if (logsResult.error) {
        throw new Error(logsResult.error.message);
    }

    const workerSet = new Set<string>();
    const nationalitySet = new Set<string>();

    for (const row of logsResult.data || []) {
        const workerName = String((row as any)?.worker_name || '').trim().toLowerCase();
        const nationality = String((row as any)?.nationality || '').trim();
        if (workerName) workerSet.add(workerName);
        if (nationality) nationalitySet.add(nationality);
    }

    let confirmedWorkers = workerSet.size;
    let ackDataSource: 'training_acknowledgements' | 'submission_gate' = 'submission_gate';

    const ackResult = await supabase
        .from('training_acknowledgements')
        .select('worker_name, reviewed_guidance, checklist, comprehension_complete')
        .eq('session_id', sessionId)
        .limit(5000);

    if (!ackResult.error && Array.isArray(ackResult.data)) {
        const confirmedSet = new Set<string>();

        for (const row of ackResult.data) {
            const workerName = String((row as any)?.worker_name || '').trim().toLowerCase();
            if (!workerName) continue;

            const reviewedGuidance = Boolean((row as any)?.reviewed_guidance);
            const checklistComplete = resolveChecklistComplete((row as any)?.checklist);
            const comprehensionComplete = Boolean((row as any)?.comprehension_complete) || (reviewedGuidance && checklistComplete);

            if (comprehensionComplete) {
                confirmedSet.add(workerName);
            }
        }

        confirmedWorkers = confirmedSet.size;
        ackDataSource = 'training_acknowledgements';
    }

    const submittedWorkers = workerSet.size;
    const confirmationRate = submittedWorkers > 0
        ? Math.round((confirmedWorkers / submittedWorkers) * 100)
        : 0;

    return res.status(200).json({
        ok: true,
        sessionId,
        submittedWorkers,
        confirmedWorkers,
        unconfirmedWorkers: Math.max(0, submittedWorkers - confirmedWorkers),
        confirmationRate,
        nationalityCount: nationalitySet.size,
        ackDataSource,
    });
}

async function handleUploadAudio(res: any, body: Record<string, unknown>) {
    const sessionId = String(body.sessionId || '');
    if (!sessionId) {
        return sendJsonError(res, 400, 'sessionId가 필요합니다.');
    }

    const originalScript = body.originalScript;
    const files = body.files;
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

        const lowerFileName = fileName.toLowerCase();
        const isSupportedAudio =
            contentType === 'audio/mpeg' ||
            contentType === 'audio/mp4' ||
            contentType === 'audio/x-m4a' ||
            lowerFileName.endsWith('.mp3') ||
            lowerFileName.endsWith('.m4a');

        if (!isSupportedAudio) {
            return sendJsonError(res, 400, `${code} 파일은 MP3 또는 M4A만 허용됩니다.`);
        }

        const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${sessionId}/${code}-${safeFileName}`;
        const binary = Buffer.from(base64, 'base64');

        const uploadRes = await supabase.storage.from('training_audio').upload(path, binary, {
            contentType: lowerFileName.endsWith('.m4a')
                ? 'audio/mp4'
                : (contentType || 'audio/mpeg'),
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
            original_script: typeof originalScript === 'string' ? originalScript : '',
        })
        .eq('id', sessionId);

    if (updateRes.error) {
        throw new Error(updateRes.error.message);
    }

    const missingLanguages = TRAINING_AUDIO_LANGUAGE_CODES.filter((code) => !audioUrls[code]);
    return res.status(200).json({ ok: true, sessionId, audioUrls, missingLanguages });
}

async function handleDeleteSession(res: any, body: Record<string, unknown>) {
    const sessionId = String(body.sessionId || '');
    if (!sessionId) {
        return sendJsonError(res, 400, 'sessionId가 필요합니다.');
    }

    const supabase = getSupabaseClient();
    let removedFileCount = 0;

    const listRes = await supabase.storage
        .from('training_audio')
        .list(sessionId, { limit: 1000 });

    if (!listRes.error && Array.isArray(listRes.data) && listRes.data.length > 0) {
        const paths = listRes.data
            .map((file) => file?.name)
            .filter((name): name is string => typeof name === 'string' && name.length > 0)
            .map((name) => `${sessionId}/${name}`);

        if (paths.length > 0) {
            const removeRes = await supabase.storage.from('training_audio').remove(paths);
            if (!removeRes.error) {
                removedFileCount = paths.length;
            }
        }
    }

    const deleteRes = await supabase
        .from('training_sessions')
        .delete()
        .eq('id', sessionId);

    if (deleteRes.error) {
        throw new Error(deleteRes.error.message);
    }

    return res.status(200).json({
        ok: true,
        sessionId,
        removedFileCount,
    });
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return sendJsonError(res, 405, 'Method Not Allowed');
    }

    try {
        const body = (typeof req.body === 'string'
            ? JSON.parse(req.body || '{}')
            : (req.body || {})) as Record<string, unknown>;
        const action = String(body.action || '') as TrainingAction;

        if (!action) {
            return sendJsonError(res, 400, 'action이 필요합니다.');
        }

        const allowWithoutAuth = action === 'awareness-stats';
        if (!allowWithoutAuth && !isValidAdminAuthRequest(req)) {
            return sendUnauthorizedAdminResponse(res);
        }

        switch (action) {
            case 'create':
                return await handleCreate(req, res, body);
            case 'reissue-link':
                return await handleReissue(req, res, body);
            case 'list-sessions':
                return await handleListSessions(res);
            case 'dashboard-summary':
                return await handleDashboardSummary(res);
            case 'awareness-stats':
                return await handleAwarenessStats(res, body);
            case 'upload-audio':
                return await handleUploadAudio(res, body);
            case 'delete-session':
                return await handleDeleteSession(res, body);
            default:
                return sendJsonError(res, 400, `지원하지 않는 action입니다: ${action}`);
        }
    } catch (error: any) {
        return sendJsonError(res, 500, error?.message || 'training admin 처리 실패');
    }
}
