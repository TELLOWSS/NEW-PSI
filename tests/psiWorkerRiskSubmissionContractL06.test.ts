import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PSI_FORM_MASTER_VERSION } from '../config/psiFormMaster';
import { emptyWorkerRiskDraft } from '../utils/workerRiskDraftL06';
import {
    L06_CLOSED_SERVER_GATE,
    L06_RECEIPT_SCHEMA,
    L06_SUBMISSION_SCHEMA,
    evaluateL06ServerGate,
    matchL06PendingReviewReceipt,
    prepareL06ClientSubmission,
    validateL06ClientSubmission,
} from '../utils/workerRiskSubmissionContractL06';

const example = () => ({
    schema: L06_SUBMISSION_SCHEMA,
    formVersion: PSI_FORM_MASTER_VERSION,
    sourceLanguage: 'ko',
    answers: {
        Q1: '가설 작업발판 설치',
        Q2: '단부 난간 미설치 시 추락 우려',
        Q3: '상',
        Q4: '난간 확보 후 안전대 고정',
        Q5: '난간 미설치 시 작업중지 요청',
    },
    selfRiskGrade: '상',
    gradeReason: '높은 단부에서 작업',
});
const ctx = {
    authenticatedTransport: true,
    requestId: '123e4567-e89b-42d3-a456-426614174001',
    tenantId: '123e4567-e89b-42d3-a456-426614174002',
    siteId: '123e4567-e89b-42d3-a456-426614174003',
    workerId: '123e4567-e89b-42d3-a456-426614174004',
};
const receipt = () => ({
    schema: L06_RECEIPT_SCHEMA,
    receiptId: '123e4567-e89b-42d3-a456-426614174005',
    requestId: ctx.requestId,
    tenantId: ctx.tenantId,
    siteId: ctx.siteId,
    workerId: ctx.workerId,
    receivedAt: '2026-11-22T02:45:00.000Z',
    state: 'received-pending-manager-review',
});

describe('L06 worker-risk official-submission boundary (closed; no endpoint)', () => {
    it('accepts only the original five self-written answers and one-character risk level', () => {
        const result = validateL06ClientSubmission(example());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(Object.keys(result.value.answers)).toEqual(['Q1','Q2','Q3','Q4','Q5']);
        expect(result.value.selfRiskGrade).toBe('상');
        expect(result.value.sourceLanguage).toBe('ko');
        expect(result.value.answers.Q1).toBe('가설 작업발판 설치');
    });
    it('prepares only complete in-memory drafts, preserving the original language', () => {
        const draft = emptyWorkerRiskDraft();
        expect(prepareL06ClientSubmission(draft, 'vi')).toEqual({ ok: false, code: 'MISSING_ANSWER' });
        draft.answers.Q1 = 'Scaffold installation';
        draft.answers.Q2 = 'Fall risk due to missing guardrails';
        draft.grade = '상';
        draft.gradeReason = 'exposed edge';
        draft.answers.Q4 = 'Install guards and secure lifeline';
        draft.answers.Q5 = 'Stop work and inform supervisor';
        const result = prepareL06ClientSubmission(draft, 'vi');
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.answers.Q1).toBe('Scaffold installation');
        expect(result.value.sourceLanguage).toBe('vi');
        expect(JSON.stringify(result.value)).not.toMatch(/workerId|tenantId|siteId|authToken|name/);
    });
    it('rejects injected identity, secret, extra questions and invented translated answers', () => {
        expect(validateL06ClientSubmission({ ...example(), workerId: 'forged' })).toEqual({ ok: false, code: 'INVALID_PAYLOAD' });
        expect(validateL06ClientSubmission({ ...example(), tenantId: 'site-b' })).toEqual({ ok: false, code: 'INVALID_PAYLOAD' });
        expect(validateL06ClientSubmission({ ...example(), answers: { ...example().answers, Q6: 'filled' } })).toEqual({ ok: false, code: 'INVALID_QUESTION_SET' });
        expect(validateL06ClientSubmission({ ...example(), answers: { ...example().answers, koreanTranslation: 'AI text' } })).toEqual({ ok: false, code: 'INVALID_QUESTION_SET' });
        expect(validateL06ClientSubmission({ ...example(), answers: { ...example().answers, Q2: '' } })).toEqual({ ok: false, code: 'MISSING_ANSWER' });
        expect(validateL06ClientSubmission({ ...example(), answers: { ...example().answers, Q2: 'x' } })).toEqual({ ok: false, code: 'MISSING_ANSWER' });
        expect(validateL06ClientSubmission({ ...example(), answers: { ...example().answers, Q2: 'x'.repeat(501) } })).toEqual({ ok: false, code: 'ANSWER_TOO_LONG' });
    });
    it('rejects unsupported form versions, source languages, and Q3 mismatches', () => {
        expect(validateL06ClientSubmission({ ...example(), formVersion: 'legacy' })).toEqual({ ok: false, code: 'UNSUPPORTED_FORM' });
        expect(validateL06ClientSubmission({ ...example(), sourceLanguage: 'arbitrary' })).toEqual({ ok: false, code: 'UNSUPPORTED_LANGUAGE' });
        expect(validateL06ClientSubmission({ ...example(), selfRiskGrade: '최상' })).toEqual({ ok: false, code: 'INVALID_RISK_GRADE' });
        expect(validateL06ClientSubmission({ ...example(), answers: { ...example().answers, Q3: '중' } })).toEqual({ ok: false, code: 'INVALID_RISK_GRADE' });
        expect(validateL06ClientSubmission({ ...example(), gradeReason: 'x'.repeat(501) })).toEqual({ ok: false, code: 'INVALID_GRADE_REASON' });
    });
    it('keeps all trusted server requirements closed by default', () => {
        const result = evaluateL06ServerGate(L06_CLOSED_SERVER_GATE);
        expect(result.allowedForServerImplementation).toBe(false);
        expect(result.unmet).toHaveLength(8);
        expect(result.unmet).toContain('workerAuthenticated');
        expect(result.unmet).toContain('tenantRlsAndStorageVerified');
        expect(result.unmet).toContain('featureOwnerApproved');
    });
    it('does not confuse browser preview, mismatched receipts, or approval with verified server receipt', () => {
        expect(matchL06PendingReviewReceipt(receipt(), { ...ctx, authenticatedTransport: false })).toBeNull();
        expect(matchL06PendingReviewReceipt(receipt(), { ...ctx, siteId: '123e4567-e89b-42d3-a456-426614174999' })).toBeNull();
        expect(matchL06PendingReviewReceipt(receipt(), { ...ctx, workerId: '123e4567-e89b-42d3-a456-426614174999' })).toBeNull();
        expect(matchL06PendingReviewReceipt({ ...receipt(), state: 'approved' }, ctx)).toBeNull();
        expect(matchL06PendingReviewReceipt({ ...receipt(), receivedAt: 'yesterday' }, ctx)).toBeNull();
        expect(matchL06PendingReviewReceipt({ ...receipt(), isApproved: true }, ctx)).toBeNull();
        expect(matchL06PendingReviewReceipt(receipt(), ctx)?.state).toBe('received-pending-manager-review');
    });
    it('keeps receipt validation and auth outside the public L06 route', () => {
        const source = readFileSync(resolve(process.cwd(), 'pages/WorkerRiskDraft.tsx'), 'utf8');
        const boundary = readFileSync(resolve(process.cwd(), 'utils/workerRiskSubmissionContractL06.ts'), 'utf8');
        expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|worker\.authenticate/);
        expect(boundary).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|createClient\s*\(/);
        expect(source).not.toContain('matchL06PendingReviewReceipt');
    });
});
