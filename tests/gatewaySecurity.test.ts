import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/server/supabaseServer.js', () => ({
    createSupabaseServerClient: () => null,
}));

import gatewayHandler, {
    buildGeminiOcrInteractionInput,
    consumePaidOcrApprovalOnce,
    isExplicitPaidOcrApprovalRequest,
    isGeminiApiKeyRejection,
    isGeminiModelAvailabilityError,
    issuePaidOcrApprovalToken,
    readGeminiInteractionText,
    readGeminiInteractionUsage,
    requiresPaidOcrApproval,
    resolveGeminiQuotaErrorCode,
    resolveOcrModelChainForBilling,
    takeAndClearPaidOcrAdminPassword,
    verifyPaidOcrAdminPassword,
    verifyPaidOcrApprovalToken,
} from '../api/gateway';

const createResponse = () => {
    let statusCode = 0;
    let body: any = null;
    const headers: Record<string, string> = {};
    return {
        response: {
            setHeader(name: string, value: string) {
                headers[name] = value;
            },
            status(code: number) {
                statusCode = code;
                return this;
            },
            json(value: any) {
                body = value;
                return value;
            },
        },
        read: () => ({ statusCode, body, headers }),
    };
};

const originalSecret = process.env.TRAINING_LINK_SECRET;
const originalPaidApprovalSecret = process.env.OCR_PAID_APPROVAL_SECRET;
const originalPaidApprovalTtl = process.env.OCR_PAID_APPROVAL_TTL_SECONDS;
const originalAdminApiAuthToken = process.env.ADMIN_API_AUTH_TOKEN;
const originalFreeGeminiKey = process.env.GEMINI_API_KEY_FREE;
const originalPaidGeminiKey = process.env.GEMINI_API_KEY_PAID;
const originalOcrMinuteLimit = process.env.OCR_RETRY_MAX_PER_MINUTE;
const originalAdminPassword = process.env.PSI_ADMIN_PASSWORD;
const originalAdminSessionSecret = process.env.ADMIN_SESSION_SECRET;
const originalPsiAdminSecret = process.env.PSI_ADMIN_SECRET;

afterEach(() => {
    if (originalSecret === undefined) delete process.env.TRAINING_LINK_SECRET;
    else process.env.TRAINING_LINK_SECRET = originalSecret;
    if (originalPaidApprovalSecret === undefined) delete process.env.OCR_PAID_APPROVAL_SECRET;
    else process.env.OCR_PAID_APPROVAL_SECRET = originalPaidApprovalSecret;
    if (originalPaidApprovalTtl === undefined) delete process.env.OCR_PAID_APPROVAL_TTL_SECONDS;
    else process.env.OCR_PAID_APPROVAL_TTL_SECONDS = originalPaidApprovalTtl;
    if (originalAdminApiAuthToken === undefined) delete process.env.ADMIN_API_AUTH_TOKEN;
    else process.env.ADMIN_API_AUTH_TOKEN = originalAdminApiAuthToken;
    if (originalFreeGeminiKey === undefined) delete process.env.GEMINI_API_KEY_FREE;
    else process.env.GEMINI_API_KEY_FREE = originalFreeGeminiKey;
    if (originalPaidGeminiKey === undefined) delete process.env.GEMINI_API_KEY_PAID;
    else process.env.GEMINI_API_KEY_PAID = originalPaidGeminiKey;
    if (originalOcrMinuteLimit === undefined) delete process.env.OCR_RETRY_MAX_PER_MINUTE;
    else process.env.OCR_RETRY_MAX_PER_MINUTE = originalOcrMinuteLimit;
    if (originalAdminPassword === undefined) delete process.env.PSI_ADMIN_PASSWORD;
    else process.env.PSI_ADMIN_PASSWORD = originalAdminPassword;
    if (originalAdminSessionSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = originalAdminSessionSecret;
    if (originalPsiAdminSecret === undefined) delete process.env.PSI_ADMIN_SECRET;
    else process.env.PSI_ADMIN_SECRET = originalPsiAdminSecret;
    vi.restoreAllMocks();
});

describe('gateway public security boundaries', () => {
    it('recognizes Google API key rejection even when Gemini returns HTTP 400', () => {
        expect(isGeminiApiKeyRejection(400, JSON.stringify({
            error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' },
        }))).toBe(true);
        expect(isGeminiApiKeyRejection(400, JSON.stringify({
            error: { status: 'INVALID_ARGUMENT', message: 'Request payload is malformed.' },
        }))).toBe(false);
    });

    it('recognizes retired and missing Gemini models without treating them as paid quota', () => {
        expect(isGeminiModelAvailabilityError(404, '{"error":{"status":"NOT_FOUND"}}')).toBe(true);
        expect(isGeminiModelAvailabilityError(400, 'This model is no longer available to new users.')).toBe(true);
        expect(requiresPaidOcrApproval('OCR_MODEL_UNAVAILABLE')).toBe(false);
    });

    it('builds stateless Interactions-compatible media input and reads the raw REST response', () => {
        expect(buildGeminiOcrInteractionInput('분석', 'image-data', 'image/png')).toEqual([
            { type: 'text', text: '분석' },
            { type: 'image', data: 'image-data', mime_type: 'image/png', resolution: 'high' },
        ]);
        expect(buildGeminiOcrInteractionInput('분석', 'pdf-data', 'application/pdf')).toEqual([
            { type: 'text', text: '분석' },
            { type: 'document', data: 'pdf-data', mime_type: 'application/pdf' },
        ]);

        const payload = {
            status: 'completed',
            steps: [{ type: 'model_output', content: [{ type: 'text', text: '[{"ok":true}]' }] }],
            usage: {
                total_input_tokens: 1120,
                total_output_tokens: 240,
                total_thought_tokens: 40,
            },
        };
        expect(readGeminiInteractionText(payload)).toBe('[{"ok":true}]');
        expect(readGeminiInteractionUsage(payload, 1)).toEqual({
            inputTokens: 1120,
            outputTokens: 240,
            thinkingTokens: 40,
        });
    });

    it('requests paid approval only for free-provider quota exhaustion', () => {
        expect(requiresPaidOcrApproval('OCR_QUOTA')).toBe(true);
        expect(requiresPaidOcrApproval('OCR_PAID_QUOTA')).toBe(false);
        expect(requiresPaidOcrApproval('OCR_UPSTREAM_AUTH')).toBe(false);
        expect(requiresPaidOcrApproval('OCR_UPSTREAM_FAILURE')).toBe(false);
        expect(requiresPaidOcrApproval('OCR_RATE_LIMITED')).toBe(false);
        expect(requiresPaidOcrApproval('OCR_DAILY_BUDGET_EXCEEDED')).toBe(false);
        expect(resolveGeminiQuotaErrorCode('free')).toBe('OCR_QUOTA');
        expect(resolveGeminiQuotaErrorCode('paid')).toBe('OCR_PAID_QUOTA');
    });

    it('allows free quality fallback but limits an approved paid request to one model call', () => {
        expect(resolveOcrModelChainForBilling('auto', 'free', false)).toHaveLength(2);
        expect(resolveOcrModelChainForBilling('auto', 'paid', false)).toHaveLength(1);
        expect(resolveOcrModelChainForBilling('gemini-precise', 'paid', true)).toHaveLength(1);
    });

    it('requires a strict boolean approval flag and a server-issued token', () => {
        expect(isExplicitPaidOcrApprovalRequest({ allowPaidOcr: true, paidApprovalToken: 'signed-token' })).toBe(true);
        expect(isExplicitPaidOcrApprovalRequest({ allowPaidOcr: false, paidApprovalToken: 'signed-token' })).toBe(false);
        expect(isExplicitPaidOcrApprovalRequest({ allowPaidOcr: 'true' as any, paidApprovalToken: 'signed-token' })).toBe(false);
        expect(isExplicitPaidOcrApprovalRequest({ allowPaidOcr: true })).toBe(false);
    });

    it('requires the current administrator password again for a paid approval retry', () => {
        process.env.PSI_ADMIN_PASSWORD = 'current-admin-password';

        expect(() => verifyPaidOcrAdminPassword(undefined)).toThrow(expect.objectContaining({
            code: 'OCR_PAID_PASSWORD_REQUIRED',
            statusCode: 403,
        }));
        expect(() => verifyPaidOcrAdminPassword('wrong-password')).toThrow(expect.objectContaining({
            code: 'OCR_PAID_PASSWORD_INVALID',
            statusCode: 403,
        }));
        expect(verifyPaidOcrAdminPassword('current-admin-password')).toBe(true);
    });

    it('clears the paid password safely from object and string request bodies', () => {
        const objectBody: Record<string, unknown> = {
            recordId: 'record-1',
            paidOcrAdminPassword: 'sensitive-password',
        };
        const objectRequest = { body: objectBody };
        expect(takeAndClearPaidOcrAdminPassword(objectRequest, objectBody)).toBe('sensitive-password');
        expect(objectBody).not.toHaveProperty('paidOcrAdminPassword');

        const stringRequest: { body?: string } = {
            body: '{"paidOcrAdminPassword":"must-not-survive"}',
        };
        expect(() => takeAndClearPaidOcrAdminPassword(stringRequest, stringRequest.body)).not.toThrow();
        expect(stringRequest.body).toBeUndefined();
    });

    it('binds paid approval to the admin credential, record, image, expiry, and approved cost cap', () => {
        process.env.OCR_PAID_APPROVAL_SECRET = 'test-only-paid-approval-secret';
        const request = { headers: { 'x-admin-auth': 'admin-session-a' } };
        const context = {
            recordId: 'record-1',
            imageSource: 'data:image/png;base64,approval-image-a',
            maxCostUsd: 0.05,
        };
        const issued = issuePaidOcrApprovalToken(request, context);
        const verified = verifyPaidOcrApprovalToken(request, issued.token, context);

        expect(verified.maxCostUsd).toBe(0.05);
        expect(verified.maxPaidGenerateCalls).toBe(1);
        expect(issued.expiresAt).toMatch(/Z$/);
        expect(issued.nonceHash).toMatch(/^[0-9a-f]{64}$/);
        expect(() => verifyPaidOcrApprovalToken(request, issued.token, {
            ...context,
            imageSource: 'data:image/png;base64,different-image',
        })).toThrow(/현재 관리자 또는 문서와 일치하지 않습니다/);
        expect(() => verifyPaidOcrApprovalToken(
            { headers: { 'x-admin-auth': 'admin-session-b' } },
            issued.token,
            context,
        )).toThrow(/현재 관리자 또는 문서와 일치하지 않습니다/);
        expect(() => verifyPaidOcrApprovalToken(request, issued.token, {
            ...context,
            maxCostUsd: 0.01,
        })).toThrow(/비용 상한이 변경/);
    });

    it('requires a dedicated paid-approval signing secret without administrator-key fallbacks', () => {
        delete process.env.OCR_PAID_APPROVAL_SECRET;
        process.env.ADMIN_SESSION_SECRET = 'must-not-sign-paid-approval';
        process.env.ADMIN_API_AUTH_TOKEN = 'must-not-sign-paid-approval';
        process.env.PSI_ADMIN_SECRET = 'must-not-sign-paid-approval';

        expect(() => issuePaidOcrApprovalToken(
            { headers: { 'x-admin-auth': 'admin-session-a' } },
            {
                recordId: 'record-dedicated-signing-secret',
                imageSource: 'data:image/png;base64,dedicated-secret',
                maxCostUsd: 0.05,
            },
        )).toThrow(expect.objectContaining({
            code: 'OCR_PAID_APPROVAL_UNAVAILABLE',
            statusCode: 503,
        }));
    });

    it('consumes each paid approval once through the durable quota gate', async () => {
        process.env.OCR_PAID_APPROVAL_SECRET = 'test-only-paid-approval-secret';
        const request = { headers: { 'x-admin-auth': 'admin-session-a' } };
        const context = {
            recordId: 'record-consume',
            imageSource: 'data:image/png;base64,approval-image-consume',
            maxCostUsd: 0.05,
        };
        const issued = issuePaidOcrApprovalToken(request, context);
        const payload = verifyPaidOcrApprovalToken(request, issued.token, context);
        const rpc = vi.fn().mockResolvedValue({
            data: [{ allowed: true, current_count: 1, retry_after_seconds: 0 }],
            error: null,
        });

        await expect(consumePaidOcrApprovalOnce({ rpc }, payload, {
            adminPasswordReverified: true,
        })).resolves.toBe('database');
        await expect(consumePaidOcrApprovalOnce({ rpc }, payload, {
            adminPasswordReverified: true,
        })).rejects.toMatchObject({
            code: 'OCR_PAID_APPROVAL_ALREADY_USED',
            statusCode: 409,
        });
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith('psi_consume_api_quota', expect.objectContaining({
            p_scope: 'ocr.paid-approval.consume',
            p_max_requests: 1,
        }));
    });

    it('fails closed when durable paid-approval consumption is unavailable', async () => {
        process.env.OCR_PAID_APPROVAL_SECRET = 'test-only-paid-approval-secret';
        const request = { headers: { 'x-admin-auth': 'admin-session-a' } };
        const context = {
            recordId: 'record-fail-closed',
            imageSource: 'data:image/png;base64,approval-image-fail-closed',
            maxCostUsd: 0.05,
        };
        const issued = issuePaidOcrApprovalToken(request, context);
        const payload = verifyPaidOcrApprovalToken(request, issued.token, context);
        const rpc = vi.fn().mockRejectedValue(Object.assign(new Error('database offline'), { code: 'NETWORK_DOWN' }));

        await expect(consumePaidOcrApprovalOnce({ rpc }, payload, {
            adminPasswordReverified: true,
        })).rejects.toMatchObject({
            code: 'SECURITY_QUOTA_UNAVAILABLE',
            statusCode: 503,
        });
    });

    it('does not consume an approval unless password re-verification already succeeded', async () => {
        process.env.OCR_PAID_APPROVAL_SECRET = 'test-only-paid-approval-secret';
        const request = { headers: { 'x-admin-auth': 'admin-session-a' } };
        const context = {
            recordId: 'record-password-gate',
            imageSource: 'data:image/png;base64,approval-image-password-gate',
            maxCostUsd: 0.05,
        };
        const issued = issuePaidOcrApprovalToken(request, context);
        const payload = verifyPaidOcrApprovalToken(request, issued.token, context);
        const rpc = vi.fn();

        await expect(consumePaidOcrApprovalOnce({ rpc }, payload, {
            adminPasswordReverified: false,
        })).rejects.toMatchObject({
            code: 'OCR_PAID_PASSWORD_REQUIRED',
            statusCode: 403,
        });
        expect(rpc).not.toHaveBeenCalled();
    });

    it('returns a bounded approval challenge when and only when the free provider returns 429', async () => {
        process.env.ADMIN_API_AUTH_TOKEN = 'test-admin-auth';
        process.env.OCR_PAID_APPROVAL_SECRET = 'test-only-paid-approval-secret';
        process.env.GEMINI_API_KEY_FREE = 'test-free-key';
        process.env.GEMINI_API_KEY_PAID = 'test-paid-key';
        const imageSource = `data:image/png;base64,${Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            Buffer.alloc(120),
        ]).toString('base64')}`;
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
            JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota exceeded' } }),
            { status: 429 },
        ));
        const res = createResponse();

        await gatewayHandler({
            method: 'POST',
            headers: { 'x-admin-auth': 'test-admin-auth', 'x-forwarded-for': '198.51.100.41' },
            query: { action: 'ocr.retry' },
            body: { recordId: 'record-provider-429', imageSource, ocrEngine: 'auto' },
        }, res.response);

        expect(res.read().statusCode).toBe(402);
        expect(res.read().body).toMatchObject({
            ok: false,
            code: 'OCR_PAID_APPROVAL_REQUIRED',
            requiresExplicitApproval: true,
            paidAvailable: false,
            maxCostUsd: 0.05,
        });
        expect(res.read().body.estimatedCostUsd).toBeGreaterThan(0);
        expect(res.read().body.estimatedCostUsd).toBeLessThanOrEqual(0.05);
        expect(res.read().body.paidApprovalToken).toBeUndefined();
        expect(res.read().body.paidUnavailableReason).toMatch(/승인 저장소/);
        expect(res.read().headers['Cache-Control']).toBe('no-store');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-goog-api-key': 'test-free-key' });
    });

    it('stops after all free active models are unavailable without opening paid approval or exposing provider JSON', async () => {
        process.env.ADMIN_API_AUTH_TOKEN = 'test-admin-model-lifecycle';
        process.env.GEMINI_API_KEY_FREE = 'test-free-model-lifecycle';
        process.env.GEMINI_API_KEY_PAID = 'must-not-be-called';
        const imageSource = `data:image/png;base64,${Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            Buffer.alloc(120),
        ]).toString('base64')}`;
        const upstreamDetail = JSON.stringify({
            error: {
                status: 'NOT_FOUND',
                message: 'This model is no longer available to new users. secret-upstream-detail',
            },
        });
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(
            upstreamDetail,
            { status: 404, headers: { 'Content-Type': 'application/json' } },
        ));
        const res = createResponse();

        await gatewayHandler({
            method: 'POST',
            headers: {
                'x-admin-auth': 'test-admin-model-lifecycle',
                'x-forwarded-for': '198.51.100.147',
            },
            query: { action: 'ocr.retry' },
            body: { recordId: 'record-retired-models', imageSource, ocrEngine: 'auto' },
        }, res.response);

        expect(res.read().statusCode).toBe(503);
        expect(res.read().body).toMatchObject({ ok: false, code: 'OCR_MODEL_UNAVAILABLE' });
        expect(JSON.stringify(res.read().body)).not.toContain('secret-upstream-detail');
        expect(JSON.stringify(res.read().body)).not.toContain('OCR_PAID_APPROVAL_REQUIRED');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith(':countTokens'))).toBe(true);
        expect(String(fetchMock.mock.calls[0]?.[0])).toContain('gemini-3.5-flash-lite');
        expect(String(fetchMock.mock.calls[1]?.[0])).toContain('gemini-3.8-flash');
        expect(fetchMock.mock.calls.every(([, init]) => (
            (init?.headers as Record<string, string>)?.['x-goog-api-key'] === 'test-free-model-lifecycle'
        ))).toBe(true);
    });

    it('blocks an approved paid retry with a wrong administrator password before any paid API call', async () => {
        process.env.ADMIN_API_AUTH_TOKEN = 'test-admin-auth';
        process.env.PSI_ADMIN_PASSWORD = 'correct-admin-password';
        process.env.OCR_PAID_APPROVAL_SECRET = 'test-only-paid-approval-secret';
        process.env.GEMINI_API_KEY_FREE = 'test-free-key';
        process.env.GEMINI_API_KEY_PAID = 'test-paid-key';
        const imageSource = `data:image/png;base64,${Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            Buffer.alloc(120),
        ]).toString('base64')}`;
        const requestHeaders = { 'x-admin-auth': 'test-admin-auth', 'x-forwarded-for': '198.51.100.44' };
        const approval = issuePaidOcrApprovalToken(
            { headers: requestHeaders },
            { recordId: 'record-wrong-password', imageSource, maxCostUsd: 0.05 },
        );
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
            JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota exceeded' } }),
            { status: 429 },
        ));
        const res = createResponse();
        const requestBody: Record<string, unknown> = {
            recordId: 'record-wrong-password',
            imageSource,
            allowPaidOcr: true,
            paidApprovalToken: approval.token,
            paidOcrAdminPassword: 'wrong-admin-password',
        };

        await gatewayHandler({
            method: 'POST',
            headers: requestHeaders,
            query: { action: 'ocr.retry' },
            body: requestBody,
        }, res.response);

        expect(res.read().statusCode).toBe(403);
        expect(res.read().body.code).toBe('OCR_PAID_PASSWORD_INVALID');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-goog-api-key': 'test-free-key' });
        expect(requestBody).not.toHaveProperty('paidOcrAdminPassword');
    });

    it('parses a raw JSON request and removes its paid password before upstream OCR', async () => {
        process.env.ADMIN_API_AUTH_TOKEN = 'test-admin-auth';
        process.env.PSI_ADMIN_PASSWORD = 'correct-admin-password';
        process.env.OCR_PAID_APPROVAL_SECRET = 'test-only-paid-approval-secret';
        process.env.GEMINI_API_KEY_FREE = 'test-free-key';
        process.env.GEMINI_API_KEY_PAID = 'test-paid-key';
        const imageSource = `data:image/png;base64,${Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            Buffer.alloc(120),
        ]).toString('base64')}`;
        const requestHeaders = { 'x-admin-auth': 'test-admin-auth', 'x-forwarded-for': '198.51.100.46' };
        const approval = issuePaidOcrApprovalToken(
            { headers: requestHeaders },
            { recordId: 'record-raw-string-password', imageSource, maxCostUsd: 0.05 },
        );
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
            JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota exceeded' } }),
            { status: 429 },
        ));
        const request: { method: string; headers: Record<string, string>; query: Record<string, string>; body?: string } = {
            method: 'POST',
            headers: requestHeaders,
            query: { action: 'ocr.retry' },
            body: JSON.stringify({
                recordId: 'record-raw-string-password',
                imageSource,
                allowPaidOcr: true,
                paidApprovalToken: approval.token,
                paidOcrAdminPassword: 'wrong-admin-password',
            }),
        };
        const res = createResponse();

        await gatewayHandler(request, res.response);

        expect(res.read().statusCode).toBe(403);
        expect(res.read().body.code).toBe('OCR_PAID_PASSWORD_INVALID');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(request.body).toBeUndefined();
    });

    it('blocks an approved paid retry before the paid API when atomic nonce storage is unavailable', async () => {
        process.env.ADMIN_API_AUTH_TOKEN = 'test-admin-auth';
        process.env.PSI_ADMIN_PASSWORD = 'correct-admin-password';
        process.env.OCR_PAID_APPROVAL_SECRET = 'test-only-paid-approval-secret';
        process.env.GEMINI_API_KEY_FREE = 'test-free-key';
        process.env.GEMINI_API_KEY_PAID = 'test-paid-key';
        const imageSource = `data:image/png;base64,${Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            Buffer.alloc(120),
        ]).toString('base64')}`;
        const requestHeaders = { 'x-admin-auth': 'test-admin-auth', 'x-forwarded-for': '198.51.100.45' };
        const approval = issuePaidOcrApprovalToken(
            { headers: requestHeaders },
            { recordId: 'record-no-atomic-store', imageSource, maxCostUsd: 0.05 },
        );
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
            JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota exceeded' } }),
            { status: 429 },
        ));
        const res = createResponse();
        const requestBody: Record<string, unknown> = {
            recordId: 'record-no-atomic-store',
            imageSource,
            allowPaidOcr: true,
            paidApprovalToken: approval.token,
            paidOcrAdminPassword: 'correct-admin-password',
        };

        await gatewayHandler({
            method: 'POST',
            headers: requestHeaders,
            query: { action: 'ocr.retry' },
            body: requestBody,
        }, res.response);

        expect(res.read().statusCode).toBe(503);
        expect(res.read().body.code).toBe('SECURITY_QUOTA_UNAVAILABLE');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-goog-api-key': 'test-free-key' });
        expect(requestBody).not.toHaveProperty('paidOcrAdminPassword');
    });

    it('never opens paid approval for a free-key authentication failure', async () => {
        process.env.ADMIN_API_AUTH_TOKEN = 'test-admin-auth';
        process.env.OCR_PAID_APPROVAL_SECRET = 'test-only-paid-approval-secret';
        process.env.GEMINI_API_KEY_FREE = 'invalid-free-key';
        process.env.GEMINI_API_KEY_PAID = 'test-paid-key';
        const imageSource = `data:image/png;base64,${Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            Buffer.alloc(120),
        ]).toString('base64')}`;
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
            JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'API key not valid.' } }),
            { status: 400 },
        ));
        const res = createResponse();

        await gatewayHandler({
            method: 'POST',
            headers: { 'x-admin-auth': 'test-admin-auth', 'x-forwarded-for': '198.51.100.42' },
            query: { action: 'ocr.retry' },
            body: {
                recordId: 'record-invalid-free-key',
                imageSource,
                allowPaidOcr: true,
                paidApprovalToken: 'untrusted-token',
            },
        }, res.response);

        expect(res.read().statusCode).toBe(502);
        expect(res.read().body.code).toBe('OCR_UPSTREAM_AUTH');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-goog-api-key': 'invalid-free-key' });
    });

    it('keeps application rate limits separate from paid-provider approval', async () => {
        process.env.ADMIN_API_AUTH_TOKEN = 'test-admin-auth';
        process.env.GEMINI_API_KEY_FREE = 'test-free-key';
        process.env.OCR_RETRY_MAX_PER_MINUTE = '0';
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        const res = createResponse();

        await gatewayHandler({
            method: 'POST',
            headers: { 'x-admin-auth': 'test-admin-auth', 'x-forwarded-for': '198.51.100.43' },
            query: { action: 'ocr.retry' },
            body: { recordId: 'record-app-rate-limit', imageSource: 'not-read-before-rate-limit' },
        }, res.response);

        expect(res.read().statusCode).toBe(429);
        expect(res.read().body.code).toBe('OCR_RATE_LIMITED');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated server OCR before any paid analysis work', async () => {
        const res = createResponse();
        await gatewayHandler({
            method: 'POST',
            headers: {},
            query: { action: 'ocr.retry' },
            body: {
                recordId: 'record-1',
                imageSource: 'data:image/png;base64,AA==',
            },
        }, res.response);

        expect(res.read().statusCode).toBe(401);
        expect(res.read().body.ok).toBe(false);
    });

    it('rejects worker authentication without a signed training link', async () => {
        process.env.TRAINING_LINK_SECRET = 'test-only-training-secret';
        const res = createResponse();
        await gatewayHandler({
            method: 'POST',
            headers: {},
            query: { action: 'worker.authenticate' },
            body: {
                sessionId: 'session-1',
                keyType: 'phone',
                keyValue: '01012345678',
            },
        }, res.response);

        expect(res.read().statusCode).toBe(403);
        expect(res.read().body.code).toBe('INVALID_TRAINING_LINK');
    });

    it('keeps access checks read-protected without signed proofs', async () => {
        process.env.TRAINING_LINK_SECRET = 'test-only-training-secret';
        const res = createResponse();
        await gatewayHandler({
            method: 'POST',
            headers: {},
            query: { action: 'training.check-access' },
            body: { sessionId: 'session-1', workerId: 'worker-1' },
        }, res.response);

        expect(res.read().statusCode).toBe(403);
        expect(res.read().body.code).toBe('INVALID_TRAINING_LINK');
    });
});
