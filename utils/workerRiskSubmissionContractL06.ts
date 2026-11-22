import { PSI_FORM_MASTER_VERSION, PSI_FORM_QUESTIONS, type PsiQuestionKey } from '../config/psiFormMaster';
import { checkWorkerRiskDraft, type WorkerRiskDraftState, type WorkerRiskDraftGrade } from './workerRiskDraftL06';

/**
 * L06 official-submission boundary contract (source-only).
 * These pure functions NEVER authenticate a worker, write a record, transmit
 * data, make an OCR call, or assert that a receipt was received.
 *
 * An eventual trusted API must derive tenant/site/worker identity exclusively
 * from its verified server session, never the browser payload.
 */
export const L06_SUBMISSION_SCHEMA = 'psi-worker-self-risk-v1' as const;
export const L06_RECEIPT_SCHEMA = 'psi-worker-self-risk-receipt-v1' as const;
export const L06_SOURCE_LANGUAGES = ['ko', 'vi', 'zh', 'th', 'km', 'uz', 'id', 'mn', 'ru', 'my', 'kk', 'bn'] as const;
export type L06SourceLanguage = typeof L06_SOURCE_LANGUAGES[number];

export interface L06ClientSubmission {
    schema: typeof L06_SUBMISSION_SCHEMA;
    formVersion: typeof PSI_FORM_MASTER_VERSION;
    sourceLanguage: L06SourceLanguage;
    answers: Record<PsiQuestionKey, string>;
    selfRiskGrade: Exclude<WorkerRiskDraftGrade, ''>;
    gradeReason: string;
}

export type L06ValidationFailureCode =
    | 'INVALID_PAYLOAD' | 'UNSUPPORTED_SCHEMA' | 'UNSUPPORTED_FORM'
    | 'UNSUPPORTED_LANGUAGE' | 'INVALID_QUESTION_SET'
    | 'MISSING_ANSWER' | 'ANSWER_TOO_LONG' | 'INVALID_RISK_GRADE'
    | 'INVALID_GRADE_REASON';

export type L06ValidationResult =
    | { ok: true; value: L06ClientSubmission }
    | { ok: false; code: L06ValidationFailureCode };

/** Strict allowlist: injected workerId, siteId, token, scores etc. are rejected. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, expected: readonly string[]) =>
    Object.keys(value).length === expected.length &&
    Object.keys(value).every(key => expected.includes(key));
const QUESTION_KEYS = PSI_FORM_QUESTIONS.map(q => q.key);
const PAYLOAD_KEYS = ['schema', 'formVersion', 'sourceLanguage', 'answers', 'selfRiskGrade', 'gradeReason'] as const;
const GRADES = ['상', '중', '하'] as const;

export const validateL06ClientSubmission = (input: unknown): L06ValidationResult => {
    if (!isRecord(input) || !exactKeys(input, PAYLOAD_KEYS)) return { ok: false, code: 'INVALID_PAYLOAD' };
    if (input.schema !== L06_SUBMISSION_SCHEMA) return { ok: false, code: 'UNSUPPORTED_SCHEMA' };
    if (input.formVersion !== PSI_FORM_MASTER_VERSION) return { ok: false, code: 'UNSUPPORTED_FORM' };
    if (!L06_SOURCE_LANGUAGES.includes(input.sourceLanguage as L06SourceLanguage))
        return { ok: false, code: 'UNSUPPORTED_LANGUAGE' };
    if (!isRecord(input.answers) || !exactKeys(input.answers, QUESTION_KEYS))
        return { ok: false, code: 'INVALID_QUESTION_SET' };
    if (!GRADES.includes(input.selfRiskGrade as typeof GRADES[number]))
        return { ok: false, code: 'INVALID_RISK_GRADE' };
    if (typeof input.gradeReason !== 'string' || input.gradeReason.length > 500)
        return { ok: false, code: 'INVALID_GRADE_REASON' };

    const answers = {} as Record<PsiQuestionKey, string>;
    for (const key of QUESTION_KEYS) {
        const raw = input.answers[key];
        if (typeof raw !== 'string') return { ok: false, code: 'MISSING_ANSWER' };
        if (raw.length > 500) return { ok: false, code: 'ANSWER_TOO_LONG' };
        const cleaned = raw.trim();
        if (key === 'Q3') {
            if (cleaned !== input.selfRiskGrade) return { ok: false, code: 'INVALID_RISK_GRADE' };
        } else if (cleaned.length < 2) return { ok: false, code: 'MISSING_ANSWER' };
        answers[key] = cleaned;
    }
    return {
        ok: true,
        value: {
            schema: L06_SUBMISSION_SCHEMA,
            formVersion: PSI_FORM_MASTER_VERSION,
            sourceLanguage: input.sourceLanguage as L06SourceLanguage,
            answers,
            selfRiskGrade: input.selfRiskGrade as L06ClientSubmission['selfRiskGrade'],
            gradeReason: input.gradeReason.trim(),
        },
    };
};

/** Never invoked by the trial UI. This prepares no identity fields or submit operation. */
export const prepareL06ClientSubmission = (
    draft: WorkerRiskDraftState, sourceLanguage: L06SourceLanguage,
): L06ValidationResult => {
    if (!checkWorkerRiskDraft(draft).readyForReview) return { ok: false, code: 'MISSING_ANSWER' };
    return validateL06ClientSubmission({
        schema: L06_SUBMISSION_SCHEMA,
        formVersion: PSI_FORM_MASTER_VERSION,
        sourceLanguage,
        answers: { ...draft.answers, Q3: draft.grade },
        selfRiskGrade: draft.grade,
        gradeReason: draft.gradeReason,
    });
};

export interface L06TrustedServerGate {
    // All booleans must be set by a trusted, authenticated server boundary.
    workerAuthenticated: boolean;
    tenantAndSiteMembershipVerified: boolean;
    activeAssessmentCycleVerified: boolean;
    privacyProcessingBasisReviewed: boolean;
    originalLanguagePreserved: boolean;
    serverIdempotencyAndAuditReady: boolean;
    tenantRlsAndStorageVerified: boolean;
    featureOwnerApproved: boolean;
}

export const L06_CLOSED_SERVER_GATE: Readonly<L06TrustedServerGate> = Object.freeze({
    workerAuthenticated: false,
    tenantAndSiteMembershipVerified: false,
    activeAssessmentCycleVerified: false,
    privacyProcessingBasisReviewed: false,
    originalLanguagePreserved: false,
    serverIdempotencyAndAuditReady: false,
    tenantRlsAndStorageVerified: false,
    featureOwnerApproved: false,
});

/** Advisory fail-closed checklist; NOT itself an authorization primitive. */
export const evaluateL06ServerGate = (gate: L06TrustedServerGate) => ({
    allowedForServerImplementation: Object.values(gate).every(value => value === true),
    unmet: (Object.keys(L06_CLOSED_SERVER_GATE) as Array<keyof L06TrustedServerGate>)
        .filter(key => gate[key] !== true),
});

export interface L06ExpectedReceiptContext {
    // Must be supplied by a trusted API caller, NEVER from form input.
    authenticatedTransport: boolean;
    requestId: string;
    tenantId: string;
    siteId: string;
    workerId: string;
}

export interface L06PendingReviewReceipt {
    schema: typeof L06_RECEIPT_SCHEMA;
    receiptId: string;
    requestId: string;
    tenantId: string;
    siteId: string;
    workerId: string;
    receivedAt: string;
    state: 'received-pending-manager-review';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Shape/correlation guard only; matching fields do not prove signature or
 * database commit. Only a trusted authenticated server response may call this.
 */
export const matchL06PendingReviewReceipt = (
    input: unknown, expected: L06ExpectedReceiptContext,
): L06PendingReviewReceipt | null => {
    if (!expected.authenticatedTransport || !isRecord(input)) return null;
    const keys = ['schema','receiptId','requestId','tenantId','siteId','workerId','receivedAt','state'];
    if (!exactKeys(input, keys)) return null;
    if (input.schema !== L06_RECEIPT_SCHEMA || input.state !== 'received-pending-manager-review') return null;
    if (![input.receiptId,input.requestId,input.tenantId,input.siteId,input.workerId].every(value => typeof value === 'string' && UUID.test(value))) return null;
    if (input.requestId !== expected.requestId || input.tenantId !== expected.tenantId ||
        input.siteId !== expected.siteId || input.workerId !== expected.workerId) return null;
    if (typeof input.receivedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(input.receivedAt) ||
        !Number.isFinite(Date.parse(input.receivedAt))) return null;
    return input as unknown as L06PendingReviewReceipt;
};
