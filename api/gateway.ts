import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../lib/server/adminAuthGuard.js';
import handleHarnessAnalyze from '../lib/server/harness/handlers/analyze.js';
import handleHarnessApprove from '../lib/server/harness/handlers/approve.js';
import handleHarnessPersistenceHealth from '../lib/server/harness/handlers/persistenceHealth.js';
import handleHarnessReanalyze from '../lib/server/harness/handlers/reanalyze.js';
import handleHarnessWorkflowStatus from '../lib/server/harness/handlers/workflowStatus.js';

type GatewayAction =
    | 'training.check-access'
    | 'training.submit'
    | 'ocr.retry'
    | 'ocr.upsert-best-practice'
    | 'worker.authenticate'
    | 'harness.analyze'
    | 'harness.approve'
    | 'harness.persistence-health'
    | 'harness.reanalyze'
    | 'harness.workflow-status';

const TRAINING_ACCESS_BLOCK_THRESHOLD = 2;
const EMBEDDING_MODEL = 'text-embedding-004';
const OCR_RETRY_TIMEOUT_MS = 25_000;
const OCR_RETRY_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type GatewayHttpError = Error & {
    statusCode: number;
    code?: string;
};

type AuthKeyType = 'phone' | 'birthDate' | 'passport';

class DuplicateSubmissionError extends Error {
    statusCode: number;
    code: string;

    constructor(message: string) {
        super(message);
        this.name = 'DuplicateSubmissionError';
        this.statusCode = 409;
        this.code = 'DUPLICATE_SUBMISSION';
    }
}

const createGatewayHttpError = (message: string, statusCode: number, code?: string): GatewayHttpError => {
    const error = new Error(message) as GatewayHttpError;
    error.statusCode = statusCode;
    if (code) {
        error.code = code;
    }
    return error;
};

type RetryRequestBody = {
    recordId?: string;
    imageSource?: string;
    filenameHint?: string;
};

type UpsertRequestBody = {
    sourceRecordId?: string;
    safetyScore?: number;
    koreanText?: string;
    originalLanguage?: string;
    actionableCoaching?: string;
    jobField?: string;
    nationality?: string;
    approvedAt?: string;
};

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

const resolveGeminiApiKey = () => {
    return (
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.VITE_GEMINI_API_KEY_PAID ||
        process.env.VITE_GEMINI_API_KEY_FREE ||
        ''
    ).trim();
};

const normalizePhone = (raw: string) => raw.replace(/\D/g, '');
const normalizeBirthDate = (raw: string) => raw.replace(/\D/g, '');
const normalizePassport = (raw: string) => raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

const AUTH_FAIL_MESSAGE = '근로자 명부에 등록되지 않은 정보입니다. 관리자에게 문의하세요.';

const isMissingTableError = (error: any): boolean => {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return (
        code === '42P01' ||
        message.includes('training_access_attempts') ||
        message.includes('relation')
    );
};

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

async function insertTrainingLogWithSchemaFallback(supabase: any, row: Record<string, unknown>) {
    const { audio_url, ...safeRow } = row;

    const { data: insertedRows, error: insertError } = await supabase
        .from('training_logs')
        .insert(safeRow)
        .select('id')
        .limit(1);

    if (insertError) {
        if (String((insertError as any)?.code || '') === '23505') {
            throw new DuplicateSubmissionError('이미 해당 세션에 서명을 제출했습니다. 관리자에게 확인해 주세요.');
        }
        throw new Error(insertError.message || 'training_logs 저장 실패');
    }

    if (audio_url && insertedRows && insertedRows.length > 0) {
        const insertedId = (insertedRows[0] as any)?.id;
        if (insertedId) {
            try {
                await supabase
                    .from('training_logs')
                    .update({ audio_url })
                    .eq('id', insertedId);
            } catch {
                // noop
            }
        }
    }
}

async function hasExistingTrainingLog(
    supabase: any,
    options: { sessionId: string; workerId?: string; workerName?: string }
): Promise<boolean> {
    const sessionId = String(options.sessionId || '').trim();
    const workerId = String(options.workerId || '').trim();
    const workerName = String(options.workerName || '').trim();

    if (!sessionId) return false;

    const query = supabase
        .from('training_logs')
        .select('id')
        .eq('session_id', sessionId)
        .limit(1);

    const withWorkerFilter = workerId
        ? query.eq('worker_id', workerId)
        : query.eq('worker_name', workerName);

    const { data, error } = await withWorkerFilter;
    if (error) {
        throw new Error(`중복 확인 실패: ${error.message}`);
    }
    return Array.isArray(data) && data.length > 0;
}

async function handleTrainingCheckAccess(req: any, res: any) {
    const { sessionId, workerId, workerName } = req.body || {};
    const normalizedSessionId = String(sessionId || '').trim();
    const normalizedWorkerId = String(workerId || '').trim();
    const normalizedWorkerName = String(workerName || '').trim();

    if (!normalizedSessionId || !normalizedWorkerId) {
        return res.status(400).json({ ok: false, message: 'sessionId/workerId 필수' });
    }

    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();

    const { error: insertError } = await supabase
        .from('training_access_attempts')
        .insert({
            session_id: normalizedSessionId,
            worker_id: normalizedWorkerId,
            worker_name: normalizedWorkerName || null,
            accessed_at: nowIso,
        });

    if (insertError) {
        if (isMissingTableError(insertError)) {
            return res.status(200).json({
                ok: true,
                data: {
                    blocked: false,
                    totalAccessCount: 0,
                    threshold: TRAINING_ACCESS_BLOCK_THRESHOLD,
                    mode: 'fallback-local',
                },
            });
        }
        throw new Error(insertError.message || '접속 시도 기록 저장 실패');
    }

    const { count, error: countError } = await supabase
        .from('training_access_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', normalizedSessionId)
        .eq('worker_id', normalizedWorkerId);

    if (countError) {
        if (isMissingTableError(countError)) {
            return res.status(200).json({
                ok: true,
                data: {
                    blocked: false,
                    totalAccessCount: 0,
                    threshold: TRAINING_ACCESS_BLOCK_THRESHOLD,
                    mode: 'fallback-local',
                },
            });
        }
        throw new Error(countError.message || '접속 시도 횟수 조회 실패');
    }

    const totalAccessCount = Number(count || 0);
    const blocked = totalAccessCount >= TRAINING_ACCESS_BLOCK_THRESHOLD;

    return res.status(200).json({
        ok: true,
        data: {
            blocked,
            totalAccessCount,
            threshold: TRAINING_ACCESS_BLOCK_THRESHOLD,
            accessedAt: nowIso,
            mode: 'server-db',
        },
    });
}

async function handleWorkerAuthenticate(req: any, res: any) {
    const { keyType, keyValue } = req.body || {};
    const normalizedType = String(keyType || '').trim() as AuthKeyType;
    const rawValue = String(keyValue || '').trim();

    if (!normalizedType || !rawValue) {
        return res.status(400).json({ ok: false, message: '본인 확인 정보가 필요합니다.' });
    }

    const supabase = getSupabaseClient();

    const workerRowsRes = await supabase
        .from('workers')
        .select('id, name, nationality, phone_number, birth_date, passport_number')
        .limit(5000);

    if (workerRowsRes.error) throw new Error(workerRowsRes.error.message);
    const workerRows = workerRowsRes.data || [];

    if (normalizedType === 'phone') {
        const value = normalizePhone(rawValue);
        if (!value) {
            return res.status(400).json({ ok: false, message: '핸드폰 번호를 확인해 주세요.' });
        }
        const matched = workerRows.find((row: any) => normalizePhone(String(row?.phone_number || '')) === value);
        if (!matched) {
            return res.status(403).json({ ok: false, message: AUTH_FAIL_MESSAGE });
        }

        return res.status(200).json({
            ok: true,
            worker: {
                worker_id: String(matched.id || ''),
                name: String(matched.name || ''),
                nationality: String(matched.nationality || ''),
            },
        });
    }

    if (normalizedType === 'birthDate') {
        const value = normalizeBirthDate(rawValue);
        if (!(value.length === 6 || value.length === 8)) {
            return res.status(400).json({ ok: false, message: '생년월일은 6자리 또는 8자리로 입력해 주세요.' });
        }

        const matched = workerRows.find((row: any) => normalizeBirthDate(String(row?.birth_date || '')) === value);
        if (!matched) {
            return res.status(403).json({ ok: false, message: AUTH_FAIL_MESSAGE });
        }

        return res.status(200).json({
            ok: true,
            worker: {
                worker_id: String(matched.id || ''),
                name: String(matched.name || ''),
                nationality: String(matched.nationality || ''),
            },
        });
    }

    if (normalizedType === 'passport') {
        const value = normalizePassport(rawValue);
        if (!value) {
            return res.status(400).json({ ok: false, message: '여권번호를 확인해 주세요.' });
        }

        const matched = workerRows.find((row: any) => normalizePassport(String(row?.passport_number || '')) === value);
        if (!matched) {
            return res.status(403).json({ ok: false, message: AUTH_FAIL_MESSAGE });
        }

        return res.status(200).json({
            ok: true,
            worker: {
                worker_id: String(matched.id || ''),
                name: String(matched.name || ''),
                nationality: String(matched.nationality || ''),
            },
        });
    }

    return res.status(400).json({ ok: false, message: '지원하지 않는 본인 확인 방식입니다.' });
}

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

    const supabase = getSupabaseClient();

    const isDuplicate = await hasExistingTrainingLog(supabase, {
        sessionId,
        workerId: String(workerId).trim(),
        workerName: normalizedWorkerName,
    });
    if (isDuplicate) {
        throw new DuplicateSubmissionError('이미 해당 세션에 서명을 제출했습니다. 관리자에게 확인해 주세요.');
    }

    const fileBuffer = Buffer.from(match[1], 'base64');
    const path = buildSignatureStoragePath(sessionId);

    const { error: uploadError } = await supabase.storage.from('signatures').upload(path, fileBuffer, {
        contentType: 'image/png',
        upsert: false,
    });

    if (uploadError) throw new Error(`서명 업로드 실패: ${uploadError.message}`);

    const pub = supabase.storage.from('signatures').getPublicUrl(path);
    const signatureUrl = pub.data.publicUrl;

    await insertTrainingLogWithSchemaFallback(supabase, {
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

async function handleGroupSignatures(payload: any): Promise<any> {
    const { sessionId, selectedLanguageCode, selectedAudioUrl, audioPlayed, isManagerProxy, checklist, signatures } = payload;

    if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('sessionId가 필요합니다.');
    }

    if (!Array.isArray(signatures) || signatures.length === 0) {
        throw new Error('서명 대상 근로자 목록이 필요합니다.');
    }

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
    const skippedDuplicateWorkerIds: string[] = [];

    for (const item of normalizedSignatures) {
        const worker = workerMap.get(item.workerId);
        if (!worker) continue;

        const isDuplicate = await hasExistingTrainingLog(supabase, {
            sessionId,
            workerId: worker.id,
            workerName: worker.name,
        });
        if (isDuplicate) {
            skippedDuplicateWorkerIds.push(worker.id);
            continue;
        }

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

        await insertTrainingLogWithSchemaFallback(supabase, {
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

    return {
        sessionId,
        insertedCount: insertedWorkerIds.length,
        workerIds: insertedWorkerIds,
        skippedDuplicateCount: skippedDuplicateWorkerIds.length,
        skippedDuplicateWorkerIds,
        signatureMethod: 'manager_group_proxy',
    };
}

async function handleTrainingSubmit(req: any, res: any) {
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

    return res.status(200).json({ ok: true, type, data });
}

const normalizeNationality = (rawNationality: string): string => {
    if (!rawNationality) return '미상';

    const nation = rawNationality.trim().toLowerCase();
    if (nation.includes('한국') || nation.includes('korea') || nation.includes('rok') || nation.includes('south korea')) return '대한민국';
    if (nation.includes('베트남') || nation.includes('vietnam')) return '베트남';
    if (nation.includes('중국') || nation.includes('china')) return '중국';
    if (nation.includes('태국') || nation.includes('thailand')) return '태국';
    if (nation.includes('우즈벡') || nation.includes('uzbekistan') || nation.includes('ўзбек') || nation.includes('узбек')) return '우즈베키스탄';
    if (nation.includes('인도네시아') || nation.includes('indonesia')) return '인도네시아';
    if (nation.includes('캄보디아') || nation.includes('cambodia')) return '캄보디아';
    if (nation.includes('몽골') || nation.includes('mongolia') || nation.includes('монгол')) return '몽골';
    if (nation.includes('카자흐') || nation.includes('kazakhstan') || nation.includes('қазақ') || nation.includes('казахст')) return '카자흐스탄';
    if (nation.includes('러시아') || nation.includes('russia') || nation.includes('россия') || nation.includes('рф') || nation.includes('российск')) return '러시아';
    if (nation.includes('네팔') || nation.includes('nepal')) return '네팔';
    if (nation.includes('미얀마') || nation.includes('myanmar') || nation.includes('burma')) return '미얀마';

    return rawNationality.trim();
};

const normalizeImagePayload = (input: string) => {
    if (!input || typeof input !== 'string') {
        throw createGatewayHttpError('imageSource가 필요합니다.', 400, 'INVALID_IMAGE_SOURCE');
    }

    let cleanData = input.trim();
    if (cleanData.includes('base64,')) {
        const parts = cleanData.split('base64,');
        cleanData = parts[parts.length - 1] || '';
    }
    cleanData = cleanData.replace(/[\r\n\s]/g, '');

    if (cleanData.length < 100) {
        throw createGatewayHttpError('이미지 데이터가 너무 짧아 재분석할 수 없습니다.', 400, 'IMAGE_DATA_TOO_SHORT');
    }

    const normalizedBase64 = cleanData.replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/=]+$/.test(normalizedBase64)) {
        throw createGatewayHttpError('Base64 이미지 데이터 형식이 올바르지 않습니다.', 400, 'INVALID_BASE64');
    }

    const estimatedBytes = Math.floor((normalizedBase64.length * 3) / 4);
    if (estimatedBytes > OCR_RETRY_MAX_IMAGE_BYTES) {
        throw createGatewayHttpError(`이미지 용량이 너무 큽니다. 최대 ${Math.floor(OCR_RETRY_MAX_IMAGE_BYTES / (1024 * 1024))}MB까지 허용됩니다.`, 413, 'IMAGE_TOO_LARGE');
    }

    const signature = cleanData.slice(0, 20);
    const mimeType = signature.startsWith('iVBORw0KGgo')
        ? 'image/png'
        : signature.startsWith('/9j/')
            ? 'image/jpeg'
            : signature.startsWith('R0lGOD')
                ? 'image/gif'
                : signature.startsWith('UklGR')
                    ? 'image/webp'
                    : signature.startsWith('AAAAFftM') || signature.includes('ftyp')
                        ? 'image/heic'
                        : '';

    if (!mimeType) {
        throw createGatewayHttpError('지원하지 않는 이미지 형식입니다. JPG/PNG/GIF/WebP/HEIC만 지원합니다.', 415, 'UNSUPPORTED_IMAGE_FORMAT');
    }

    return { cleanData, mimeType };
};

const parseJsonCandidate = (rawText: string): Record<string, unknown> | null => {
    const trimmed = String(rawText || '').trim();
    if (!trimmed) return null;

    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            const first = parsed[0];
            return first && typeof first === 'object' && !Array.isArray(first) ? first as Record<string, unknown> : null;
        }
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
        const arrayStart = trimmed.indexOf('[');
        const arrayEnd = trimmed.lastIndexOf(']');
        if (arrayStart >= 0 && arrayEnd > arrayStart) {
            try {
                const parsed = JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
                const first = Array.isArray(parsed) ? parsed[0] : null;
                return first && typeof first === 'object' && !Array.isArray(first) ? first as Record<string, unknown> : null;
            } catch {
                return null;
            }
        }
        return null;
    }
};

const toStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item || '').trim()).filter(Boolean);
};

const resolveSafetyLevel = (score: number, rawLevel: unknown): '초급' | '중급' | '고급' => {
    if (rawLevel === '고급' || rawLevel === '중급' || rawLevel === '초급') return rawLevel;
    if (score >= 80) return '고급';
    if (score >= 60) return '중급';
    return '초급';
};

async function analyzeSingleRecord(imageSource: string, filenameHint: string) {
    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
        throw createGatewayHttpError('서버 Gemini API 키가 설정되지 않았습니다. GEMINI_API_KEY 환경변수를 확인하세요.', 502, 'MISSING_SERVER_GEMINI_KEY');
    }

    const { cleanData, mimeType } = normalizeImagePayload(imageSource);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OCR_RETRY_TIMEOUT_MS);

    let response: Response;
    try {
        response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: [
                                        '건설현장 위험성평가표 이미지를 분석해 JSON 배열 1개만 반환하세요.',
                                        '마크다운 없이 JSON만 반환하세요.',
                                        '필수 키: name, jobField, teamLeader, date, nationality, language, safetyScore, safetyLevel, strengths, weakAreas, improvement, suggestions, aiInsights, fullText, koreanTranslation, scoreReasoning, ocrConfidence',
                                        `파일명: ${filenameHint || 'unknown'}`,
                                    ].join('\n'),
                                },
                                {
                                    inlineData: {
                                        data: cleanData,
                                        mimeType,
                                    },
                                },
                            ],
                        },
                    ],
                    generationConfig: {
                        temperature: 0.1,
                        responseMimeType: 'application/json',
                    },
                }),
            }
        );
    } catch (error: any) {
        if (error?.name === 'AbortError') {
            throw createGatewayHttpError(`OCR 엔진 응답 시간이 초과되었습니다. (${Math.floor(OCR_RETRY_TIMEOUT_MS / 1000)}초)`, 504, 'OCR_TIMEOUT');
        }
        throw createGatewayHttpError(`OCR 엔진 연결에 실패했습니다: ${String(error?.message || error || 'network_error')}`, 502, 'OCR_UPSTREAM_NETWORK');
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        const raw = await response.text();
        const detail = raw.slice(0, 300);
        if (response.status === 429) {
            throw createGatewayHttpError(`Gemini API 할당량 초과(429): ${detail}`, 429, 'OCR_QUOTA');
        }
        if (response.status === 400) {
            throw createGatewayHttpError(`Gemini API 요청 형식 오류(400): ${detail}`, 400, 'OCR_INVALID_ARGUMENT');
        }
        if (response.status === 401 || response.status === 403) {
            throw createGatewayHttpError(`Gemini API 인증/권한 오류(${response.status}): 서버 API 키를 확인하세요.`, 502, 'OCR_UPSTREAM_AUTH');
        }
        throw createGatewayHttpError(`Gemini API 오류 (${response.status}): ${detail}`, 502, 'OCR_UPSTREAM_FAILURE');
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = parseJsonCandidate(rawText);

    if (!parsed) {
        throw createGatewayHttpError('서버 OCR 응답 JSON 파싱에 실패했습니다.', 502, 'OCR_PARSE_FAILURE');
    }

    const parsedSafetyScore = Number(parsed.safetyScore);
    const hasExtractedText =
        String(parsed.fullText || '').trim().length > 0 ||
        String(parsed.koreanTranslation || '').trim().length > 0 ||
        String(parsed.aiInsights || '').trim().length > 0;
    const safetyScore = Number.isFinite(parsedSafetyScore)
        ? parsedSafetyScore
        : (hasExtractedText ? 60 : 0);

    return {
        name: String(parsed.name || '식별 대기').trim(),
        jobField: String(parsed.jobField || '기타').trim(),
        teamLeader: String(parsed.teamLeader || '미지정').trim(),
        date: String(parsed.date || new Date().toISOString().split('T')[0]).trim(),
        nationality: normalizeNationality(String(parsed.nationality || '미상')),
        language: String(parsed.language || 'unknown').trim(),
        safetyScore,
        safetyLevel: resolveSafetyLevel(safetyScore, parsed.safetyLevel),
        strengths: toStringArray(parsed.strengths),
        strengths_native: toStringArray(parsed.strengths_native),
        weakAreas: toStringArray(parsed.weakAreas),
        weakAreas_native: toStringArray(parsed.weakAreas_native),
        improvement: String(parsed.improvement || '').trim(),
        improvement_native: String(parsed.improvement_native || '').trim(),
        suggestions: toStringArray(parsed.suggestions),
        suggestions_native: toStringArray(parsed.suggestions_native),
        aiInsights: String(parsed.aiInsights || '').trim(),
        aiInsights_native: String(parsed.aiInsights_native || '').trim(),
        fullText: String(parsed.fullText || '').trim(),
        koreanTranslation: String(parsed.koreanTranslation || '').trim(),
        scoreReasoning: toStringArray(parsed.scoreReasoning),
        ocrConfidence: Number.isFinite(Number(parsed.ocrConfidence)) ? Number(parsed.ocrConfidence) : 0.9,
        handwrittenAnswers: Array.isArray(parsed.handwrittenAnswers) ? parsed.handwrittenAnswers : [],
    };
}

async function handleOcrRetry(req: any, res: any) {
    const body = (req.body || {}) as RetryRequestBody;
    const recordId = String(body.recordId || '').trim();
    const imageSource = String(body.imageSource || '').trim();
    const filenameHint = String(body.filenameHint || '').trim().slice(0, 120);

    if (!recordId) {
        return res.status(400).json({ ok: false, message: 'recordId가 필요합니다.' });
    }

    if (recordId.length > 120) {
        return res.status(400).json({ ok: false, message: 'recordId 길이가 너무 깁니다.' });
    }

    if (!imageSource) {
        return res.status(400).json({ ok: false, message: 'imageSource가 필요합니다.' });
    }

    const record = await analyzeSingleRecord(imageSource, filenameHint || recordId);
    return res.status(200).json({ ok: true, recordId, record });
}

const toVectorLiteral = (values: number[]): string => {
    return `[${values.map((value) => Number(value).toFixed(8)).join(',')}]`;
};

const requestEmbedding = async (apiKey: string, text: string): Promise<number[]> => {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: { parts: [{ text }] },
                taskType: 'SEMANTIC_SIMILARITY',
            }),
        }
    );

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Embedding API 실패 (${response.status}): ${detail.slice(0, 300)}`);
    }

    const payload = await response.json();
    const values = payload?.embedding?.values;

    if (!Array.isArray(values) || values.length === 0) {
        throw new Error('Embedding 응답 파싱 실패');
    }

    return values.map((item: unknown) => Number(item)).filter((item: number) => Number.isFinite(item));
};

async function handleOcrUpsertBestPractice(req: any, res: any) {
    if (!isValidAdminAuthRequest(req)) {
        return sendUnauthorizedAdminResponse(res);
    }

    const body = (req.body || {}) as UpsertRequestBody;

    const sourceRecordId = String(body.sourceRecordId || '').trim();
    const safetyScore = Number(body.safetyScore || 0);
    const koreanText = String(body.koreanText || '').trim();

    if (!sourceRecordId) {
        return res.status(400).json({ ok: false, message: 'sourceRecordId가 필요합니다.' });
    }

    if (!Number.isFinite(safetyScore) || safetyScore < 80) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'score_below_threshold' });
    }

    if (koreanText.length < 20) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'text_too_short' });
    }

    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'missing_gemini_key' });
    }

    const embedding = await requestEmbedding(apiKey, koreanText);
    if (embedding.length === 0) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'embedding_empty' });
    }

    const supabase = getSupabaseClient();

    const payload = {
        source_record_id: sourceRecordId,
        safety_score: Math.round(Math.max(0, Math.min(100, safetyScore))),
        original_language: String(body.originalLanguage || 'ko').trim() || 'ko',
        ko_text: koreanText,
        actionable_coaching: String(body.actionableCoaching || '').trim() || null,
        job_field: String(body.jobField || '').trim() || null,
        nationality: String(body.nationality || '').trim() || null,
        approved_at: String(body.approvedAt || '').trim() || new Date().toISOString(),
        embedding: toVectorLiteral(embedding),
    };

    const { error } = await supabase
        .from('risk_best_practice_vectors')
        .upsert(payload, { onConflict: 'source_record_id' });

    if (error) {
        throw new Error(error.message);
    }

    return res.status(200).json({ ok: true, sourceRecordId, stored: true });
}

const resolveAction = (req: any): GatewayAction | '' => {
    const fromQuery = String(req?.query?.action || '').trim();
    if (fromQuery) return fromQuery as GatewayAction;

    const fromGatewayBody = String(req?.body?.gatewayAction || '').trim();
    if (fromGatewayBody) return fromGatewayBody as GatewayAction;

    const fromBody = String(req?.body?.action || '').trim();
    if (fromBody) return fromBody as GatewayAction;

    const url = String(req?.url || '');
    const actionMatch = url.match(/[?&]action=([^&]+)/);
    if (actionMatch?.[1]) {
        try {
            return decodeURIComponent(actionMatch[1]).trim() as GatewayAction;
        } catch {
            return actionMatch[1].trim() as GatewayAction;
        }
    }

    return '';
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    const action = resolveAction(req);
    if (!action) {
        return res.status(400).json({ ok: false, message: 'action 파라미터가 필요합니다.' });
    }

    try {
        switch (action) {
            case 'training.check-access':
                return await handleTrainingCheckAccess(req, res);
            case 'training.submit':
                return await handleTrainingSubmit(req, res);
            case 'ocr.retry':
                return await handleOcrRetry(req, res);
            case 'ocr.upsert-best-practice':
                return await handleOcrUpsertBestPractice(req, res);
            case 'worker.authenticate':
                return await handleWorkerAuthenticate(req, res);
            case 'harness.analyze':
                return await handleHarnessAnalyze(req, res);
            case 'harness.approve':
                return await handleHarnessApprove(req, res);
            case 'harness.persistence-health':
                return await handleHarnessPersistenceHealth(req, res);
            case 'harness.reanalyze':
                return await handleHarnessReanalyze(req, res);
            case 'harness.workflow-status':
                return await handleHarnessWorkflowStatus(req, res);
            default:
                return res.status(400).json({ ok: false, message: `Unknown action: ${action}` });
        }
    } catch (err: any) {
        const requestedStatus = Number(err?.statusCode);
        const statusCode = Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus < 600
            ? requestedStatus
            : 500;
        return res.status(statusCode).json({
            ok: false,
            code: err?.code || null,
            message: err?.message || 'gateway 처리 실패',
        });
    }
}
