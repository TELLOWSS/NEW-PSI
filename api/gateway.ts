import { createHash, randomUUID } from 'crypto';
import { isValidAdminAuthRequest, sendUnauthorizedAdminResponse } from '../lib/server/adminAuthGuard.js';
import { createSupabaseServerClient } from '../lib/server/supabaseServer.js';
import handleHarnessAnalyze from '../lib/server/harness/handlers/analyze.js';
import handleHarnessApprove from '../lib/server/harness/handlers/approve.js';
import handleHarnessPersistenceHealth from '../lib/server/harness/handlers/persistenceHealth.js';
import handleHarnessReanalyze from '../lib/server/harness/handlers/reanalyze.js';
import handleHarnessWorkflowStatus from '../lib/server/harness/handlers/workflowStatus.js';
import { evaluateOcrVerificationCompleteness } from '../utils/ocrVerificationLanguageUtils.js';
import { resolveGeminiOcrModelChain, type OcrEngineMode } from '../utils/aiEngineSettings.js';
import { normalizeNationality as importedNormalizeNationality } from '../utils/workerIdentity.js';
import { normalizeOcrRecordMetadata } from '../utils/ocrRecordNormalization.js';
import { PSI_FORM_MASTER_PROMPT_BLOCK } from '../config/psiFormMaster.js';
import { normalizeOcrDocumentMetadata } from '../utils/ocrDocumentValidation.js';
import {
    buildWorkerAuthenticationProof,
    verifyTrainingLinkToken,
    verifyWorkerAuthenticationToken,
} from '../lib/server/trainingLinkToken.js';
import {
    consumeApiQuota,
    recordApiUsageEvent,
    resolveRequestFingerprint,
} from '../lib/server/apiSecurity.js';

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

const EMBEDDING_MODEL = 'text-embedding-004';
const OCR_RETRY_TIMEOUT_MS = 25_000;
const OCR_RETRY_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const OCR_RETRY_LANGUAGE_POLICY = [
    '[언어 정책 — 엄격 준수 / 위반 시 실패체제]',
    '',
    '[절대 원칙]',
    '- 모든 분석 결과에서 영어 단독 사용 절대 금지. aiInsights, aiInsights_native, 필드에 영어 단어/문장 혼용 금지.',
    '- nationality 표준: 대한민국/베트남/중국/태국/우즈베키스탄/인도네시아/캄보디아/몽골/카자흐스탄/러시아/네팔/미얀마 중 표준 한글로 반환.',
    '- aiInsights는 관리자 검토용 한국어 문장. 영어 혼용 금지.',
    '- aiInsights_native는 작업자에게 직접 전달할 모국어 보호 안내. 빈 문자열 반환 절대 금지. 영어 혼용 금지.',
    '- 대한민국 근로자도 aiInsights_native를 한국어로 현장 전달용 안내로 반드시 채울 것.',
    '- 외국인 근로자는 aiInsights_native를 모국어로만 반드시 채울 것 (영어/한국어 혼용 절대 금지).',
    '- handwrittenAnswers[].koreanTranslation: 항상 한국어로만 작성 (영어 금지).',
    '- handwrittenAnswers[].nativeTranslation: 외국인은 해당 모국어로 완전 번역하여 반드시 채울 것. 한국인은 빈 문자열.',
    '',
    '[국가별 모국어 배정]',
    '- 대한민국 → 한국어 | 베트남 → 베트남어 | 중국 → 중국어 간체',
    '- 태국 → 태국어 | 우즈베키스탄 → 우즈베크어 | 인도네시아 → 인도네시아어',
    '- 캄보디아 → 크메르어 | 몽골 → 몽골어 | 카자흐스탄 → 러시아어 | 러시아 → 러시아어',
    '- 네팔 → 네팔어(देवनागरी) | 미얀마 → 미얀마어(မြန်မာဘာသာ)',
].join('\n');

const OCR_RETRY_RESPONSE_SCHEMA = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            documentType: { type: 'string', enum: ['psi-risk-assessment', 'other-safety-document', 'unknown'] },
            isPsiForm: { type: 'boolean' },
            documentValidationReason: { type: 'string' },
            documentMarkers: { type: 'array', items: { type: 'string' } },
            fieldConfidences: {
                type: 'object',
                properties: {
                    name: { type: 'number' },
                    jobField: { type: 'number' },
                    date: { type: 'number' },
                    nationality: { type: 'number' },
                    handwrittenAnswers: { type: 'number' },
                },
            },
            name: { type: 'string' },
            jobField: { type: 'string' },
            teamLeader: { type: 'string' },
            date: { type: 'string' },
            nationality: { type: 'string' },
            language: { type: 'string' },
            safetyScore: { type: 'number' },
            safetyLevel: { type: 'string' },
            strengths: { type: 'array', items: { type: 'string' } },
            strengths_native: { type: 'array', items: { type: 'string' } },
            weakAreas: { type: 'array', items: { type: 'string' } },
            weakAreas_native: { type: 'array', items: { type: 'string' } },
            improvement: { type: 'string' },
            improvement_native: { type: 'string' },
            suggestions: { type: 'array', items: { type: 'string' } },
            suggestions_native: { type: 'array', items: { type: 'string' } },
            aiInsights: { type: 'string' },
            aiInsights_native: { type: 'string' },
            fullText: { type: 'string' },
            koreanTranslation: { type: 'string' },
            scoreReasoning: { type: 'array', items: { type: 'string' } },
            ocrConfidence: { type: 'number' },
            handwrittenAnswers: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        questionNumber: { type: 'string' },
                        answerText: { type: 'string' },
                        koreanTranslation: { type: 'string', description: '관리자 검토용 한국어 해석 — 항상 한국어로만 작성' },
                        nativeTranslation: { type: 'string', description: '작업자 전달용 모국어 해석 — 외국인은 해당 국적 모국어로 별도 번역, 한국인은 빈 문자열' },
                    },
                },
            },
        },
    },
};

type GatewayHttpError = Error & {
    statusCode: number;
    code?: string;
};

type AuthKeyType = 'phone' | 'birthDate' | 'passport';
export type TrainingSubmissionAuthorization =
    | { mode: 'admin'; workerId: string | null }
    | { mode: 'worker-auth'; workerId: string };

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

export const resolveTrainingSubmissionAuthorization = (
    req: any,
    type: string,
    payload: Record<string, unknown>,
): TrainingSubmissionAuthorization => {
    const isAdmin = isValidAdminAuthRequest(req);
    const normalizedWorkerId = String(payload?.workerId || '').trim();

    if (type === 'group') {
        if (!isAdmin) {
            throw createGatewayHttpError('단체 대리제출은 관리자 인증이 필요합니다.', 403, 'ADMIN_AUTH_REQUIRED');
        }
        return { mode: 'admin', workerId: null };
    }

    if (isAdmin) {
        return { mode: 'admin', workerId: normalizedWorkerId || null };
    }

    const normalizedSessionId = String(payload?.sessionId || '').trim();
    const linkVerification = verifyTrainingLinkToken(
        normalizedSessionId,
        payload?.linkExpiresAt,
        payload?.linkToken,
    );
    if (!linkVerification.ok) {
        const message = linkVerification.reason === 'expired'
            ? '교육 링크가 만료되었습니다. 관리자에게 재발급을 요청해 주세요.'
            : '서버에서 검증되지 않은 교육 링크입니다.';
        throw createGatewayHttpError(message, 403, 'INVALID_TRAINING_LINK');
    }

    const hasWorkerAuthProof = Boolean(
        normalizedWorkerId
        || String(payload?.workerAuthToken || '').trim()
        || String(payload?.workerAuthExpiresAt || '').trim(),
    );
    if (hasWorkerAuthProof) {
        const workerVerification = verifyWorkerAuthenticationToken(
            normalizedSessionId,
            normalizedWorkerId,
            payload?.workerAuthExpiresAt,
            payload?.workerAuthToken,
        );
        if (!workerVerification.ok) {
            const message = workerVerification.reason === 'expired'
                ? '근로자 인증이 만료되었습니다. 다시 본인 확인해 주세요.'
                : '검증되지 않은 근로자 인증입니다.';
            throw createGatewayHttpError(message, 403, 'INVALID_WORKER_AUTH');
        }
        return { mode: 'worker-auth', workerId: normalizedWorkerId };
    }

    throw createGatewayHttpError(
        '유효한 교육 링크 또는 검증된 근로자 인증이 필요합니다.',
        403,
        'TRAINING_SUBMISSION_AUTH_REQUIRED',
    );
};

export const resolveAuthorizedWorkerId = (
    authorization: TrainingSubmissionAuthorization,
    payload: Record<string, unknown>,
) => {
    if (authorization.mode === 'worker-auth') return authorization.workerId;
    return authorization.workerId || String(payload?.workerId || '').trim() || null;
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
    return createSupabaseServerClient({ errorMessage: 'Supabase 환경변수 누락' });
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

async function loadTrainingCaseId(supabase: any, sessionId: string): Promise<string | null> {
    const result = await supabase
        .from('training_sessions')
        .select('case_id')
        .eq('id', sessionId)
        .maybeSingle();
    if (result.error) return null;
    return String(result.data?.case_id || '').trim() || null;
}

async function completeSafetyCaseAcknowledgement(
    supabase: any,
    options: {
        caseId: string | null;
        sessionId: string;
        workerName: string;
        evidenceId?: string | null;
    },
) {
    const caseId = String(options.caseId || '').trim();
    if (!caseId) return;

    const current = await supabase
        .from('safety_cases')
        .select('completed_stages,status')
        .eq('case_id', caseId)
        .maybeSingle();

    if (current.error || !current.data) return;

    const completedStages = current.data.completed_stages
        && typeof current.data.completed_stages === 'object'
        ? current.data.completed_stages as Record<string, string>
        : {};

    if (!completedStages.training || completedStages.acknowledgement) return;

    const occurredAt = new Date().toISOString();
    const nextCompletedStages = {
        ...completedStages,
        acknowledgement: occurredAt,
    };

    const update = await supabase
        .from('safety_cases')
        .update({
            completed_stages: nextCompletedStages,
            status: 'awaiting-reassessment',
        })
        .eq('case_id', caseId);

    if (update.error) return;

    const eventId = [
        caseId,
        'acknowledgement',
        options.sessionId,
        options.workerName,
    ]
        .join('-')
        .replace(/[^a-zA-Z0-9가-힣_-]+/g, '-')
        .slice(0, 240);

    await supabase.from('safety_case_events').upsert({
        event_id: eventId,
        case_id: caseId,
        stage: 'acknowledgement',
        occurred_at: occurredAt,
        actor: options.workerName,
        note: '근로자 본인 확인 및 이해도 체크 완료',
        evidence_id: options.evidenceId || options.sessionId,
    }, {
        onConflict: 'event_id',
    });
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
    const {
        sessionId,
        workerId,
        linkExpiresAt,
        linkToken,
        workerAuthExpiresAt,
        workerAuthToken,
    } = req.body || {};
    const normalizedSessionId = String(sessionId || '').trim();
    const normalizedWorkerId = String(workerId || '').trim();

    if (!normalizedSessionId || !normalizedWorkerId) {
        return res.status(400).json({ ok: false, message: 'sessionId와 workerId가 필요합니다.' });
    }

    const linkVerification = verifyTrainingLinkToken(normalizedSessionId, linkExpiresAt, linkToken);
    if (!linkVerification.ok) {
        return res.status(403).json({
            ok: false,
            code: 'INVALID_TRAINING_LINK',
            message: linkVerification.reason === 'expired'
                ? '교육 링크가 만료되었습니다.'
                : '검증되지 않은 교육 링크입니다.',
        });
    }

    const workerVerification = verifyWorkerAuthenticationToken(
        normalizedSessionId,
        normalizedWorkerId,
        workerAuthExpiresAt,
        workerAuthToken,
    );
    if (!workerVerification.ok) {
        return res.status(403).json({
            ok: false,
            code: 'INVALID_WORKER_AUTH',
            message: workerVerification.reason === 'expired'
                ? '근로자 인증이 만료되었습니다.'
                : '검증되지 않은 근로자 인증입니다.',
        });
    }

    const supabase = getSupabaseClient();
    const blocked = await hasExistingTrainingLog(supabase, {
        sessionId: normalizedSessionId,
        workerId: normalizedWorkerId,
    });

    return res.status(200).json({
        ok: true,
        data: {
            blocked,
            reason: blocked ? 'already-submitted' : null,
            mode: 'verified-read-only',
        },
    });
}

type TrainingSignatureCommitInput = {
    sessionId: string;
    caseId: string;
    workerId?: string | null;
    workerName: string;
    nationality: string;
    signatureDataUrl: string;
    pathPrefix?: string;
    selectedAudioUrl?: string;
    selectedLanguageCode?: string;
    isManagerProxy: boolean;
    signatureMethod: 'worker_self' | 'manager_proxy' | 'manager_group_proxy';
    reviewedGuidance: boolean;
    checklist: Record<string, unknown>;
    comprehensionComplete: boolean;
    errorContext?: string;
};

async function persistTrainingSignature(supabase: any, input: TrainingSignatureCommitInput) {
    const match = input.signatureDataUrl.match(/^data:image\/png;base64,(.+)$/);
    if (!match?.[1]) {
        throw new Error(`서명 데이터 형식 오류${input.errorContext ? `: ${input.errorContext}` : ''}`);
    }

    const binary = Buffer.from(match[1], 'base64');
    const path = buildSignatureStoragePath(input.sessionId, { prefix: input.pathPrefix });
    const signatureEvidenceHash = createHash('sha256').update(binary).digest('hex');
    const upload = await supabase.storage.from('signatures').upload(path, binary, {
        contentType: 'image/png',
        upsert: false,
    });

    if (upload.error) {
        throw new Error(`서명 업로드 실패${input.errorContext ? `(${input.errorContext})` : ''}: ${upload.error.message}`);
    }

    const commit = await supabase.rpc('psi_commit_training_signature', {
        p_session_id: input.sessionId,
        p_case_id: input.caseId || '',
        p_worker_id: input.workerId || null,
        p_worker_name: input.workerName,
        p_nationality: input.nationality,
        p_signature_path: path,
        p_signature_evidence_hash: signatureEvidenceHash,
        p_audio_url: input.selectedAudioUrl || '',
        p_selected_language_code: input.selectedLanguageCode || '',
        p_is_manager_proxy: input.isManagerProxy,
        p_signature_method: input.signatureMethod,
        p_reviewed_guidance: input.reviewedGuidance,
        p_checklist: input.checklist,
        p_comprehension_complete: input.comprehensionComplete,
        p_submitted_at: new Date().toISOString(),
    });

    if (commit.error) {
        await supabase.storage.from('signatures').remove([path]);
        if (String(commit.error.code || '') === '23505') {
            throw new DuplicateSubmissionError('이미 해당 세션에 서명을 제출했습니다. 관리자에게 확인해 주세요.');
        }
        const missingMigration = String(commit.error.message || '').includes('psi_commit_training_signature')
            || String(commit.error.code || '').toUpperCase() === 'PGRST202';
        throw createGatewayHttpError(
            missingMigration
                ? '서명 무결성 마이그레이션이 적용되지 않았습니다.'
                : `교육 서명 기록 저장 실패${input.errorContext ? `(${input.errorContext})` : ''}: ${commit.error.message}`,
            503,
            'TRAINING_SIGNATURE_COMMIT_FAILED',
        );
    }

    return {
        signatureEvidenceHash,
        signatureReference: `private://signatures/${path}`,
    };
}

function sendWorkerAuthenticationSuccess(res: any, matched: any, sessionId: string) {
    const workerId = String(matched?.id || '').trim();
    const proof = buildWorkerAuthenticationProof(sessionId, workerId);

    return res.status(200).json({
        ok: true,
        worker: {
            worker_id: workerId,
            name: String(matched?.name || ''),
            nationality: String(matched?.nationality || ''),
        },
        ...proof,
    });
}

async function handleWorkerAuthenticate(req: any, res: any) {
    const { keyType, keyValue, sessionId, linkExpiresAt, linkToken } = req.body || {};
    const normalizedType = String(keyType || '').trim() as AuthKeyType;
    const rawValue = String(keyValue || '').trim();
    const normalizedSessionId = String(sessionId || '').trim();

    if (!normalizedType || !rawValue || !normalizedSessionId) {
        return res.status(400).json({ ok: false, message: '본인 확인 정보가 필요합니다.' });
    }

    const linkVerification = verifyTrainingLinkToken(normalizedSessionId, linkExpiresAt, linkToken);
    if (!linkVerification.ok) {
        return res.status(403).json({
            ok: false,
            code: 'INVALID_TRAINING_LINK',
            message: linkVerification.reason === 'expired'
                ? '교육 링크가 만료되었습니다. 관리자에게 재발급을 요청해 주세요.'
                : '검증되지 않은 교육 링크입니다.',
        });
    }

    const supabase = getSupabaseClient();
    const fingerprint = resolveRequestFingerprint(req);
    const quota = await consumeApiQuota(supabase, {
        scope: 'worker.authenticate',
        clientKeyHash: `${fingerprint}:${normalizedSessionId}`,
        maxRequests: Number(process.env.WORKER_AUTH_MAX_ATTEMPTS || 5),
        windowSeconds: Number(process.env.WORKER_AUTH_WINDOW_SECONDS || 15 * 60),
        metadata: { sessionId: normalizedSessionId, keyType: normalizedType },
    });
    if (!quota.allowed) {
        if (typeof res.setHeader === 'function') {
            res.setHeader('Retry-After', String(quota.retryAfterSeconds || 60));
        }
        await recordApiUsageEvent(supabase, {
            scope: 'worker.authenticate',
            clientKeyHash: fingerprint,
            outcome: 'blocked',
            resourceId: normalizedSessionId,
            metadata: { keyType: normalizedType, reason: 'rate-limit' },
        });
        return res.status(429).json({
            ok: false,
            code: 'AUTH_RATE_LIMITED',
            message: '본인 확인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        });
    }

    let normalizedValue = '';

    if (normalizedType === 'phone') {
        normalizedValue = normalizePhone(rawValue);
        if (normalizedValue.length < 9) {
            return res.status(400).json({ ok: false, message: '핸드폰 번호를 확인해 주세요.' });
        }
    } else if (normalizedType === 'birthDate') {
        normalizedValue = normalizeBirthDate(rawValue);
        if (!(normalizedValue.length === 6 || normalizedValue.length === 8)) {
            return res.status(400).json({ ok: false, message: '생년월일은 6자리 또는 8자리로 입력해 주세요.' });
        }
    } else if (normalizedType === 'passport') {
        normalizedValue = normalizePassport(rawValue);
        if (normalizedValue.length < 5) {
            return res.status(400).json({ ok: false, message: '여권번호를 확인해 주세요.' });
        }
    } else {
        return res.status(400).json({ ok: false, message: '지원하지 않는 본인 확인 방식입니다.' });
    }

    const lookup = await supabase.rpc('psi_lookup_worker_auth', {
        p_key_type: normalizedType,
        p_key_value: normalizedValue,
    });
    if (lookup.error) {
        const error = createGatewayHttpError(
            String(lookup.error.message || '').includes('psi_lookup_worker_auth')
                ? '근로자 보안 조회 마이그레이션이 적용되지 않았습니다.'
                : `근로자 본인 확인 조회 실패: ${lookup.error.message}`,
            503,
            'WORKER_AUTH_LOOKUP_UNAVAILABLE',
        );
        throw error;
    }

    const matches = Array.isArray(lookup.data) ? lookup.data : [];
    if (matches.length !== 1) {
        await recordApiUsageEvent(supabase, {
            scope: 'worker.authenticate',
            clientKeyHash: fingerprint,
            outcome: 'failure',
            resourceId: normalizedSessionId,
            metadata: {
                keyType: normalizedType,
                reason: matches.length > 1 ? 'ambiguous' : 'not-found',
            },
        });
        if (matches.length > 1) {
            return res.status(409).json({
                ok: false,
                code: 'AMBIGUOUS_WORKER_IDENTITY',
                message: '같은 정보의 근로자가 여러 명입니다. 핸드폰 또는 여권번호로 확인하거나 관리자에게 문의해 주세요.',
            });
        }
        return res.status(403).json({ ok: false, message: AUTH_FAIL_MESSAGE });
    }

    await recordApiUsageEvent(supabase, {
        scope: 'worker.authenticate',
        clientKeyHash: fingerprint,
        outcome: 'success',
        resourceId: normalizedSessionId,
        metadata: { keyType: normalizedType, workerId: String(matches[0]?.id || '') },
    });
    return sendWorkerAuthenticationSuccess(res, matches[0], normalizedSessionId);
}

async function loadCanonicalWorker(supabase: any, workerId: string) {
    const { data, error } = await supabase
        .from('workers')
        .select('id, name, nationality')
        .eq('id', workerId)
        .maybeSingle();

    if (error) {
        throw new Error(`workers 조회 실패: ${error.message}`);
    }
    if (!data?.id || !data?.name) {
        throw createGatewayHttpError('인증된 근로자 정보를 찾을 수 없습니다.', 403, 'WORKER_NOT_FOUND');
    }

    return {
        id: String(data.id).trim(),
        name: String(data.name).trim(),
        nationality: String(data.nationality || '').trim(),
    };
}

async function handleSingleSignature(
    payload: any,
    authorization: TrainingSubmissionAuthorization,
): Promise<any> {
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
        isManagerProxy,
    } = payload;

    if (!sessionId || !signatureDataUrl) {
        throw new Error('필수값 누락');
    }

    const supabase = getSupabaseClient();
    const caseId = await loadTrainingCaseId(supabase, sessionId);
    const authorizedWorkerId = resolveAuthorizedWorkerId(authorization, payload);
    let normalizedWorkerName = String(workerName || '').trim();
    let normalizedNationality = String(nationality || '').trim();

    if (authorization.mode === 'worker-auth' || authorizedWorkerId) {
        if (!authorizedWorkerId) {
            throw createGatewayHttpError('인증된 workerId가 필요합니다.', 403, 'WORKER_AUTH_REQUIRED');
        }
        const canonicalWorker = await loadCanonicalWorker(supabase, authorizedWorkerId);
        normalizedWorkerName = canonicalWorker.name;
        normalizedNationality = canonicalWorker.nationality;
    }

    if (!normalizedWorkerName) {
        throw new Error('근로자 이름이 필요합니다.');
    }
    if (!normalizedNationality) {
        throw new Error('근로자 국적 정보가 필요합니다.');
    }

    const hasEngagementProof = Boolean(reviewedGuidance) || Boolean(audioPlayed) || Boolean(scrolledToEnd);
    if (!hasEngagementProof) {
        throw new Error('오디오 재생 또는 대본 끝까지 읽기 기록이 필요합니다.');
    }

    if (!acknowledgedRiskAssessment) {
        throw new Error('위험성평가 숙지 체크가 필요합니다.');
    }

    const effectiveIsManagerProxy = authorization.mode === 'admin' && Boolean(isManagerProxy);
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

    const comprehensionComplete = !effectiveIsManagerProxy
        && Boolean(reviewedGuidance)
        && checklistPayload.riskReview
        && checklistPayload.ppeConfirm
        && checklistPayload.emergencyConfirm;

    const isDuplicate = await hasExistingTrainingLog(supabase, {
        sessionId,
        workerId: authorizedWorkerId || undefined,
        workerName: normalizedWorkerName,
    });
    if (isDuplicate) {
        throw new DuplicateSubmissionError('이미 해당 세션에 서명을 제출했습니다. 관리자에게 확인해 주세요.');
    }

    const { signatureReference, signatureEvidenceHash } = await persistTrainingSignature(supabase, {
        sessionId,
        caseId,
        workerId: authorizedWorkerId,
        workerName: normalizedWorkerName,
        nationality: normalizedNationality,
        signatureDataUrl: String(signatureDataUrl),
        selectedAudioUrl,
        selectedLanguageCode,
        isManagerProxy: effectiveIsManagerProxy,
        signatureMethod: effectiveIsManagerProxy ? 'manager_proxy' : 'worker_self',
        reviewedGuidance: Boolean(reviewedGuidance),
        checklist: checklistPayload,
        comprehensionComplete,
    });

    if (comprehensionComplete) {
        await completeSafetyCaseAcknowledgement(supabase, {
            caseId,
            sessionId,
            workerName: normalizedWorkerName,
            evidenceId: signatureReference,
        });
    }

    return { signatureUrl: signatureReference, signatureEvidenceHash, comprehensionComplete };
}

export const buildGroupProxyAcknowledgement = (payload: Record<string, unknown>) => {
    const checklist = payload?.checklist && typeof payload.checklist === 'object'
        ? payload.checklist as Record<string, unknown>
        : {};

    return {
        reviewedGuidance: false,
        checklist: {
            riskReview: Boolean(checklist.riskReview),
            ppeConfirm: Boolean(checklist.ppeConfirm),
            emergencyConfirm: Boolean(checklist.emergencyConfirm),
            audioPlayed: Boolean(payload?.audioPlayed),
            scrolledToEnd: Boolean(payload?.scrolledToEnd),
            acknowledgedRiskAssessment: Boolean(payload?.acknowledgedRiskAssessment),
            proxySubmission: true,
            selfAttested: false,
        },
        comprehensionComplete: false,
    };
};

async function handleGroupSignatures(payload: any): Promise<any> {
    const { sessionId, selectedLanguageCode, selectedAudioUrl, signatures } = payload;

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
    const caseId = await loadTrainingCaseId(supabase, sessionId);
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

    const groupAcknowledgement = buildGroupProxyAcknowledgement(payload);

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

        try {
            await persistTrainingSignature(supabase, {
                sessionId,
                caseId,
                workerId: worker.id,
                workerName: worker.name,
                nationality: worker.nationality || '',
                signatureDataUrl: item.signatureDataUrl,
                pathPrefix: `group_proxy/${worker.id}`,
                selectedAudioUrl,
                selectedLanguageCode,
                isManagerProxy: true,
                signatureMethod: 'manager_group_proxy',
                reviewedGuidance: groupAcknowledgement.reviewedGuidance,
                checklist: groupAcknowledgement.checklist,
                comprehensionComplete: false,
                errorContext: worker.id,
            });
        } catch (error) {
            if (error instanceof DuplicateSubmissionError) {
                skippedDuplicateWorkerIds.push(worker.id);
                continue;
            }
            throw error;
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
        comprehensionComplete: false,
    };
}

async function handleTrainingSubmit(req: any, res: any) {
    const { type, payload } = req.body || {};

    if (!type) {
        return res.status(400).json({ ok: false, message: 'type 필드 필수 (single|group)' });
    }

    const normalizedPayload = payload && typeof payload === 'object'
        ? payload as Record<string, unknown>
        : {};
    const authorization = resolveTrainingSubmissionAuthorization(req, String(type), normalizedPayload);
    let data;

    switch (type) {
        case 'single':
            data = await handleSingleSignature(normalizedPayload, authorization);
            break;
        case 'group':
            data = await handleGroupSignatures(normalizedPayload);
            break;
        default:
            return res.status(400).json({ ok: false, message: `Unknown type: ${type}` });
    }

    return res.status(200).json({ ok: true, type, data });
}

const normalizeNationality = (rawNationality: string): string => importedNormalizeNationality(rawNationality);

const normalizeHandwrittenAnswers = (raw: unknown): Array<{ questionNumber: string; answerText: string; koreanTranslation: string; nativeTranslation?: string }> => {
    if (!Array.isArray(raw)) return [];

    return raw
        .map((item, index) => {
            const entry = item && typeof item === 'object' && !Array.isArray(item)
                ? item as Record<string, unknown>
                : {};

            return {
                questionNumber: String(entry.questionNumber || index + 1).trim(),
                answerText: String(entry.answerText || '').trim(),
                koreanTranslation: String(entry.koreanTranslation || '').trim(),
                nativeTranslation: String(entry.nativeTranslation || '').trim(),
            };
        })
        .filter((item) => item.answerText.length > 0 || item.koreanTranslation.length > 0 || String(item.nativeTranslation || '').trim().length > 0);
};

const REQUIRED_CHANGED_PSI_QUESTIONS = [1, 2, 3, 4, 5] as const;

type RetryHandwrittenAnswer = ReturnType<typeof normalizeHandwrittenAnswers>[number];

const normalizeQuestionNumber = (value: unknown): number | null => {
    const digits = String(value || '').match(/\d+/)?.[0];
    const questionNumber = Number(digits);
    return Number.isInteger(questionNumber) && questionNumber >= 1 && questionNumber <= 5 ? questionNumber : null;
};

const getHandwrittenAnswerText = (answer: RetryHandwrittenAnswer): string => [
    answer.answerText,
    answer.koreanTranslation,
    answer.nativeTranslation,
].filter(Boolean).join(' ').trim();

const evaluateChangedPsiFormCoverage = (record: {
    filename?: string;
    fullText?: string;
    koreanTranslation?: string;
    handwrittenAnswers?: RetryHandwrittenAnswer[];
}) => {
    const answers = Array.isArray(record.handwrittenAnswers) ? record.handwrittenAnswers : [];
    const searchableText = [
        record.filename,
        record.fullText,
        record.koreanTranslation,
        ...answers.flatMap((answer) => [answer.questionNumber, answer.answerText, answer.koreanTranslation, answer.nativeTranslation]),
    ].filter(Boolean).join(' ').toLowerCase();

    const looksLikeChangedPsiForm =
        searchableText.includes('new-psi') ||
        searchableText.includes('psi-ra-01') ||
        /\bq[1-5]\b/i.test(searchableText) ||
        answers.length >= 3;

    const present = new Set<number>();
    answers.forEach((answer, index) => {
        const questionNumber = normalizeQuestionNumber(answer.questionNumber) ?? (index >= 0 && index < 5 ? index + 1 : null);
        if (questionNumber && getHandwrittenAnswerText(answer).length >= 2) {
            present.add(questionNumber);
        }
    });

    const presentQuestions = REQUIRED_CHANGED_PSI_QUESTIONS.filter((questionNumber) => present.has(questionNumber));
    const missingQuestions = REQUIRED_CHANGED_PSI_QUESTIONS.filter((questionNumber) => !present.has(questionNumber));
    const isComplete = !looksLikeChangedPsiForm || missingQuestions.length === 0;
    const isAcceptable = !looksLikeChangedPsiForm || presentQuestions.length >= 4;
    const message = isComplete
        ? '변경 PSI 양식 Q1~Q5 답변 추출 완료'
        : `변경 PSI 양식 Q${missingQuestions.join(', Q')} 답변 추출 확인 필요`;

    return {
        looksLikeChangedPsiForm,
        presentQuestions,
        missingQuestions,
        isAcceptable,
        isComplete,
        message,
    };
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

const stripJsonCodeFence = (value: string): string => {
    const fenced = String(value || '').trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced?.[1] ? fenced[1].trim() : String(value || '').trim();
};

const normalizeParsedCandidate = (parsed: unknown): Record<string, unknown> | null => {
    if (Array.isArray(parsed)) {
        const first = parsed[0];
        return first && typeof first === 'object' && !Array.isArray(first) ? first as Record<string, unknown> : null;
    }
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
};

const parseJsonCandidate = (rawText: string): Record<string, unknown> | null => {
    const trimmed = stripJsonCodeFence(rawText);
    if (!trimmed) return null;

    try {
        return normalizeParsedCandidate(JSON.parse(trimmed));
    } catch {
        const candidates: string[] = [];

        const arrayStart = trimmed.indexOf('[');
        const arrayEnd = trimmed.lastIndexOf(']');
        if (arrayStart >= 0 && arrayEnd > arrayStart) {
            candidates.push(trimmed.slice(arrayStart, arrayEnd + 1));
        }

        const objectStart = trimmed.indexOf('{');
        const objectEnd = trimmed.lastIndexOf('}');
        if (objectStart >= 0 && objectEnd > objectStart) {
            candidates.push(trimmed.slice(objectStart, objectEnd + 1));
        }

        for (const candidate of candidates) {
            try {
                const parsed = JSON.parse(stripJsonCodeFence(candidate));
                const normalized = normalizeParsedCandidate(parsed);
                if (normalized) return normalized;
            } catch {
                // 다음 후보 시도
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

const shouldTryNextModel = (code?: string): boolean => {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) return true;
    if (
        normalized === 'OCR_QUOTA' ||
        normalized === 'OCR_UPSTREAM_AUTH' ||
        normalized === 'MISSING_SERVER_GEMINI_KEY' ||
        normalized === 'OCR_INVALID_ARGUMENT' ||
        normalized === 'UNSUPPORTED_IMAGE_FORMAT' ||
        normalized === 'INVALID_BASE64' ||
        normalized === 'IMAGE_TOO_LARGE' ||
        normalized === 'IMAGE_DATA_TOO_SHORT'
    ) {
        return false;
    }
    return true;
};

async function analyzeSingleRecord(
    imageSource: string,
    filenameHint: string,
    engine: OcrEngineMode = 'auto',
    isPaidApiMode = true,
) {
    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
        throw createGatewayHttpError('서버 Gemini API 키가 설정되지 않았습니다. GEMINI_API_KEY 환경변수를 확인하세요.', 502, 'MISSING_SERVER_GEMINI_KEY');
    }

    const { cleanData, mimeType } = normalizeImagePayload(imageSource);
    let parsed: Record<string, unknown> | null = null;
    let attempts = 0;
    let fallbackDepth = 0;
    let lastError: GatewayHttpError | null = null;

    if (engine === 'openai-precise') {
        throw createGatewayHttpError('ChatGPT Plus 구독은 OpenAI API가 아닙니다. 별도 OpenAI API 키 연결이 필요합니다.', 400, 'OPENAI_API_NOT_CONFIGURED');
    }
    const modelChain = resolveGeminiOcrModelChain(engine, { isPaidApiMode });
    for (let modelIndex = 0; modelIndex < modelChain.length; modelIndex++) {
        const model = modelChain[modelIndex];
        attempts = modelIndex + 1;
        fallbackDepth = modelIndex;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), OCR_RETRY_TIMEOUT_MS);

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
                                            '필수 키: documentType, isPsiForm, documentValidationReason, documentMarkers, fieldConfidences, name, jobField, teamLeader, date, nationality, language, safetyScore, safetyLevel, strengths, strengths_native, weakAreas, weakAreas_native, improvement, improvement_native, suggestions, suggestions_native, aiInsights, aiInsights_native, fullText, koreanTranslation, scoreReasoning, ocrConfidence, handwrittenAnswers',
                                            '[문서 유형 선확인 - 가장 먼저 수행]',
                                            '- PSI, NEW-PSI 또는 PSI-RA-01 위험성평가 기록지의 제목, 하단 공종·이름 칸, Q1~Q5 문항 구조가 실제로 보이는지 먼저 확인하세요.',
                                            '- 해당 양식이 아니거나 확실하지 않으면 isPsiForm=false, documentType="other-safety-document" 또는 "unknown"으로 반환하세요.',
                                            '- isPsiForm=false이면 보이지 않는 값을 추정하지 말고 safetyScore=0으로 반환하세요.',
                                            '- fieldConfidences의 각 필드는 0~1로 기록하고 흐리거나 비어 있으면 0.8 미만으로 기록하세요.',
                                            'handwrittenAnswers는 이미지에 보이는 문항 답변을 번호 순서대로 추출하세요.',
                                            '- questionNumber: 문항 번호',
                                            '- answerText: 작업자가 실제로 쓴 원문',
                                            '- koreanTranslation: 해당 답변의 한국어 해석 (항상 한국어만)',
                                            '- nativeTranslation: 외국인 근로자는 해당 모국어로 완전 번역하여 반드시 채울 것. 한국인은 빈 문자열.',
                                            '[NEW-PSI 고정 양식 판독 규칙]',
                                            PSI_FORM_MASTER_PROMPT_BLOCK,
                                            '- jobField는 페이지 하단 왼쪽의 "공종" 칸에 실제로 적힌 값만 사용하세요.',
                                            '- name은 페이지 하단 가운데의 "현장 등록 한글이름" 칸에 실제로 적힌 값만 사용하세요.',
                                            '- Q1 답변은 근로자가 실제로 하는 작업 중 가장 위험한 세부작업/위험작업입니다. 위험분석, 점수, 위험성평가 교육자료 환류의 핵심 근거로 사용하세요.',
                                            '- 단, Q1 답변은 하단 "공종" 칸의 확정값을 대체하지 않습니다. Q1을 jobField로 저장하거나 jobField를 자동 확정하는 값으로 쓰지 마세요.',
                                            '- 하단 공종/이름 칸이 비었거나 흐리면 추정하지 말고 jobField는 "미분류", name은 "식별 대기"로 반환하세요.',
                                            '문항형 위험성평가표(1~5번)가 보이면 handwrittenAnswers를 절대 비워두지 마세요.',
                                            'NEW-PSI 양식 또는 PSI-RA-01 양식이면 Q1 위험 작업, Q2 위험요인/사고 이유, Q3 위험수준과 이유, Q4 감소대책, Q5 지킬 행동을 각각 분리해서 5개 항목으로 반환하세요.',
                                            OCR_RETRY_LANGUAGE_POLICY,
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
                            responseSchema: OCR_RETRY_RESPONSE_SCHEMA,
                        },
                    }),
                }
            );

            if (!response.ok) {
                const raw = await response.text();
                const detail = raw.slice(0, 300);
                let mappedError: GatewayHttpError;
                if (response.status === 429) {
                    mappedError = createGatewayHttpError(`Gemini API 할당량 초과(429): ${detail}`, 429, 'OCR_QUOTA');
                } else if (response.status === 400) {
                    mappedError = createGatewayHttpError(`Gemini API 요청 형식 오류(400): ${detail}`, 400, 'OCR_INVALID_ARGUMENT');
                } else if (response.status === 401 || response.status === 403) {
                    mappedError = createGatewayHttpError(`Gemini API 인증/권한 오류(${response.status}): 서버 API 키를 확인하세요.`, 502, 'OCR_UPSTREAM_AUTH');
                } else {
                    mappedError = createGatewayHttpError(`Gemini API 오류 (${response.status}): ${detail}`, 502, 'OCR_UPSTREAM_FAILURE');
                }
                lastError = mappedError;
                if (!shouldTryNextModel(mappedError.code) || modelIndex === modelChain.length - 1) {
                    throw mappedError;
                }
                continue;
            }

            const data = await response.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            parsed = parseJsonCandidate(rawText);

            if (!parsed) {
                const parseError = createGatewayHttpError('서버 OCR 응답 JSON 파싱에 실패했습니다.', 502, 'OCR_PARSE_FAILURE');
                lastError = parseError;
                if (modelIndex === modelChain.length - 1) {
                    throw parseError;
                }
                continue;
            }

            break;
        } catch (error: any) {
            const gatewayError = (error && typeof error === 'object' && Number((error as any).statusCode) >= 400)
                ? (error as GatewayHttpError)
                : (error?.name === 'AbortError'
                    ? createGatewayHttpError(`OCR 엔진 응답 시간이 초과되었습니다. (${Math.floor(OCR_RETRY_TIMEOUT_MS / 1000)}초)`, 504, 'OCR_TIMEOUT')
                    : createGatewayHttpError(`OCR 엔진 연결에 실패했습니다: ${String(error?.message || error || 'network_error')}`, 502, 'OCR_UPSTREAM_NETWORK'));
            lastError = gatewayError;
            if (!shouldTryNextModel(gatewayError.code) || modelIndex === modelChain.length - 1) {
                throw gatewayError;
            }
        } finally {
            clearTimeout(timeout);
        }
    }

    if (!parsed) {
        throw (lastError || createGatewayHttpError('서버 OCR 응답을 해석하지 못했습니다.', 502, 'OCR_UPSTREAM_FAILURE'));
    }

    const documentMetadata = normalizeOcrDocumentMetadata(parsed);
    if (!documentMetadata.validation.isPsiForm) {
        throw createGatewayHttpError(
            `PSI 위험성평가 기록지가 아닌 문서로 판정되었습니다: ${documentMetadata.validation.reason || '필수 표식 또는 문항 구조 불일치'}`,
            422,
            'OCR_WRONG_DOCUMENT',
        );
    }

    const normalizedNationality = normalizeNationality(String(parsed.nationality || '미상'));
    const normalizedHandwrittenAnswers = normalizeHandwrittenAnswers(parsed.handwrittenAnswers);
    const nativeInsights = String(parsed.aiInsights_native || '').trim();
    const parsedSafetyScore = Number(parsed.safetyScore);
    const hasCoreExtractedText =
        String(parsed.fullText || '').trim().length > 0 ||
        String(parsed.koreanTranslation || '').trim().length > 0 ||
        normalizedHandwrittenAnswers.length > 0;
    const hasExtractedText =
        hasCoreExtractedText ||
        String(parsed.aiInsights || '').trim().length > 0;
    const verificationAudit = evaluateOcrVerificationCompleteness({
        nationality: normalizedNationality,
        language: String(parsed.language || 'unknown').trim(),
        jobField: String(parsed.jobField || '기타').trim(),
        weakAreas: toStringArray(parsed.weakAreas),
        aiInsights: String(parsed.aiInsights || '').trim(),
        aiInsights_native: nativeInsights,
        fullText: String(parsed.fullText || '').trim(),
        koreanTranslation: String(parsed.koreanTranslation || '').trim(),
        handwrittenAnswers: normalizedHandwrittenAnswers,
    });

    if (!hasCoreExtractedText) {
        throw createGatewayHttpError('서버 OCR 결과에 유효 텍스트가 없어 재분석이 필요합니다.', 502, 'OCR_PARSE_FAILURE');
    }

    if (!verificationAudit.isComplete) {
        throw createGatewayHttpError(`서버 OCR 구조 검증 실패: ${verificationAudit.issues.join(', ')}`, 502, 'OCR_PARSE_FAILURE');
    }

    const changedFormCoverage = evaluateChangedPsiFormCoverage({
        filename: filenameHint,
        fullText: String(parsed.fullText || '').trim(),
        koreanTranslation: String(parsed.koreanTranslation || '').trim(),
        handwrittenAnswers: normalizedHandwrittenAnswers,
    });

    if (!changedFormCoverage.isAcceptable) {
        throw createGatewayHttpError(changedFormCoverage.message, 502, 'OCR_PARSE_FAILURE');
    }

    const scoreReasoning = toStringArray(parsed.scoreReasoning);
    const coverageAwareScoreReasoning =
        changedFormCoverage.looksLikeChangedPsiForm && !changedFormCoverage.isComplete
            ? [...scoreReasoning, changedFormCoverage.message]
            : scoreReasoning;

    const safetyScore = Number.isFinite(parsedSafetyScore)
        ? parsedSafetyScore
        : (hasExtractedText ? 60 : 0);

    const normalizedRecord = normalizeOcrRecordMetadata({
        name: String(parsed.name || '식별 대기').trim(),
        jobField: String(parsed.jobField || '기타').trim(),
        teamLeader: String(parsed.teamLeader || '미지정').trim(),
        date: String(parsed.date || new Date().toISOString().split('T')[0]).trim(),
        nationality: normalizedNationality,
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
        aiInsights_native: nativeInsights,
        fullText: String(parsed.fullText || '').trim(),
        koreanTranslation: String(parsed.koreanTranslation || '').trim(),
        scoreReasoning: coverageAwareScoreReasoning,
        ocrConfidence: Number.isFinite(Number(parsed.ocrConfidence)) ? Number(parsed.ocrConfidence) : 0.9,
        ocrDocumentValidation: documentMetadata.validation,
        ocrFieldConfidences: documentMetadata.fieldConfidences,
        handwrittenAnswers: normalizedHandwrittenAnswers,
    }, { appendAuditTrail: false }).record;

    return {
        record: normalizedRecord,
        attempts,
        fallbackDepth,
    };
}

async function handleOcrRetry(req: any, res: any) {
    if (!isValidAdminAuthRequest(req)) {
        return sendUnauthorizedAdminResponse(res);
    }

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

    const supabase = getSupabaseClient();
    const fingerprint = resolveRequestFingerprint(req);
    const perMinuteQuota = await consumeApiQuota(supabase, {
        scope: 'ocr.retry.minute',
        clientKeyHash: fingerprint,
        maxRequests: Number(process.env.OCR_RETRY_MAX_PER_MINUTE || 6),
        windowSeconds: 60,
        metadata: { recordId },
    });
    const dailyQuota = perMinuteQuota.allowed
        ? await consumeApiQuota(supabase, {
            scope: 'ocr.retry.daily',
            clientKeyHash: 'global',
            maxRequests: Number(process.env.OCR_RETRY_DAILY_BUDGET || 100),
            windowSeconds: 24 * 60 * 60,
            metadata: { recordId, requestedBy: fingerprint },
        })
        : perMinuteQuota;

    if (!perMinuteQuota.allowed || !dailyQuota.allowed) {
        const retryAfterSeconds = Math.max(
            perMinuteQuota.retryAfterSeconds || 0,
            dailyQuota.retryAfterSeconds || 0,
            60,
        );
        if (typeof res.setHeader === 'function') {
            res.setHeader('Retry-After', String(retryAfterSeconds));
        }
        await recordApiUsageEvent(supabase, {
            scope: 'ocr.retry',
            clientKeyHash: fingerprint,
            outcome: 'blocked',
            resourceId: recordId,
            metadata: {
                reason: perMinuteQuota.allowed ? 'daily-budget' : 'minute-rate-limit',
            },
        });
        return res.status(429).json({
            ok: false,
            code: perMinuteQuota.allowed ? 'OCR_DAILY_BUDGET_EXCEEDED' : 'OCR_RATE_LIMITED',
            message: perMinuteQuota.allowed
                ? '오늘의 서버 OCR 재분석 한도에 도달했습니다. 관리자에게 한도 조정을 요청해 주세요.'
                : 'OCR 재분석 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        });
    }

    const traceStartMs = Date.now();
    const requestedEngine = String(req.body?.ocrEngine || 'auto') as OcrEngineMode;
    const engine: OcrEngineMode = ['auto', 'gemini-fast', 'gemini-precise', 'openai-precise'].includes(requestedEngine)
        ? requestedEngine
        : 'auto';
    const isPaidApiMode = req.body?.isPaidApiMode === true;
    let result;
    try {
        result = await analyzeSingleRecord(imageSource, filenameHint || recordId, engine, isPaidApiMode);
    } catch (error) {
        await recordApiUsageEvent(supabase, {
            scope: 'ocr.retry',
            clientKeyHash: fingerprint,
            outcome: 'failure',
            resourceId: recordId,
            latencyMs: Date.now() - traceStartMs,
            metadata: { engine },
        });
        throw error;
    }
    const traceLatencyMs = Date.now() - traceStartMs;

    await recordApiUsageEvent(supabase, {
        scope: 'ocr.retry',
        clientKeyHash: fingerprint,
        outcome: 'success',
        resourceId: recordId,
        latencyMs: traceLatencyMs,
        metadata: {
            engine,
            provider: 'server_gemini',
            attempts: result.attempts,
            fallbackDepth: result.fallbackDepth,
        },
    });

    return res.status(200).json({
        ok: true,
        recordId,
        record: result.record,
        trace: {
            providerUsed: 'server_gemini',
            latencyMs: traceLatencyMs,
            attempts: result.attempts,
            fallbackDepth: result.fallbackDepth,
            recordedAt: new Date().toISOString(),
        },
    });
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
