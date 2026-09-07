import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    OcrGatewayError,
    isOcrGatewaySystemUnavailable,
    isOcrPaidApprovalRequired,
    requestServerOcrAnalysis,
} from '../services/ocrGatewayService';

describe('server OCR gateway client', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('preserves an HTTP auth code when an expired session returns no JSON code', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ ok: false, message: '로그인이 필요합니다.' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
        )));

        const request = requestServerOcrAnalysis({
            recordId: 'record-1',
            imageSource: 'data:image/jpeg;base64,/9j/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        });

        await expect(request).rejects.toMatchObject({
            name: 'OcrGatewayError',
            code: 'HTTP_401',
            status: 401,
        } satisfies Partial<OcrGatewayError>);
        await expect(request).rejects.toThrow('[HTTP_401] 로그인이 필요합니다.');
    });

    it('classifies only common server configuration outages as batch-stopping errors', () => {
        expect(isOcrGatewaySystemUnavailable(new OcrGatewayError(
            '[SECURITY_QUOTA_UNAVAILABLE] quota unavailable',
            { code: 'SECURITY_QUOTA_UNAVAILABLE', status: 503 },
        ))).toBe(true);
        expect(isOcrGatewaySystemUnavailable(new OcrGatewayError(
            '[OCR_UPSTREAM_AUTH] key rejected',
            { code: 'OCR_UPSTREAM_AUTH', status: 502 },
        ))).toBe(true);
        expect(isOcrGatewaySystemUnavailable(new OcrGatewayError(
            '[MISSING_SERVER_GEMINI_FREE_KEY] free key missing',
            { code: 'MISSING_SERVER_GEMINI_FREE_KEY', status: 502 },
        ))).toBe(true);
        expect(isOcrGatewaySystemUnavailable(new OcrGatewayError(
            '[OCR_MODEL_UNAVAILABLE] model retired',
            { code: 'OCR_MODEL_UNAVAILABLE', status: 503 },
        ))).toBe(true);
        expect(isOcrGatewaySystemUnavailable(new OcrGatewayError(
            '[OCR_COST_ESTIMATE_UNAVAILABLE] count unavailable',
            { code: 'OCR_COST_ESTIMATE_UNAVAILABLE', status: 502 },
        ))).toBe(true);
        expect(isOcrGatewaySystemUnavailable(new OcrGatewayError(
            '[OCR_PARSE_FAILURE] one file could not be parsed',
            { code: 'OCR_PARSE_FAILURE', status: 502 },
        ))).toBe(false);
    });

    it('opens paid approval only for the explicit server approval code', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({
                ok: false,
                code: 'OCR_PAID_APPROVAL_REQUIRED',
                message: '무료 할당량을 모두 사용했습니다.',
                estimatedCostUsd: 0.0123,
                maxCostUsd: 0.05,
                paidApprovalToken: 'single-use-token',
                paidAvailable: true,
            }),
            { status: 402, headers: { 'Content-Type': 'application/json' } },
        )));

        const request = requestServerOcrAnalysis({
            recordId: 'record-paid-consent',
            imageSource: 'data:image/jpeg;base64,/9j/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        });

        const error = await request.catch((reason) => reason as OcrGatewayError);
        expect(isOcrPaidApprovalRequired(error)).toBe(true);
        expect(error).toMatchObject({
            code: 'OCR_PAID_APPROVAL_REQUIRED',
            status: 402,
            estimatedCostUsd: 0.0123,
            maxCostUsd: 0.05,
            paidApprovalToken: 'single-use-token',
            paidAvailable: true,
        });

        expect(isOcrPaidApprovalRequired(new OcrGatewayError(
            '[OCR_QUOTA] free quota exhausted',
            { code: 'OCR_QUOTA', status: 429 },
        ))).toBe(false);
        expect(isOcrPaidApprovalRequired(new Error('429 rate limit'))).toBe(false);
    });

    it('preserves the reason when paid execution is safely unavailable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({
                ok: false,
                code: 'OCR_PAID_APPROVAL_REQUIRED',
                message: '무료 할당량을 모두 사용했습니다.',
                estimatedCostUsd: 0.01,
                maxCostUsd: 0.05,
                paidAvailable: false,
                paidUnavailableReason: '일회용 승인 저장소가 연결되지 않았습니다.',
            }),
            { status: 402, headers: { 'Content-Type': 'application/json' } },
        )));

        const error = await requestServerOcrAnalysis({
            recordId: 'record-paid-unavailable',
            imageSource: 'data:image/jpeg;base64,/9j/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        }).catch((reason) => reason as OcrGatewayError);

        expect(error).toMatchObject({
            code: 'OCR_PAID_APPROVAL_REQUIRED',
            paidAvailable: false,
            paidApprovalToken: undefined,
            paidUnavailableReason: '일회용 승인 저장소가 연결되지 않았습니다.',
        });
    });

    it('sends paid approval only on the explicitly approved retry', async () => {
        const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(
            JSON.stringify({
                ok: true,
                recordId: 'record-1',
                record: { id: 'record-1', name: '테스트' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));
        vi.stubGlobal('fetch', fetchMock);

        const defaultRequest = {
            recordId: 'record-1',
            imageSource: 'data:image/jpeg;base64,/9j/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            paidApprovalToken: 'must-not-leak-without-approval',
            paidOcrAdminPassword: 'must-not-leak-without-approval',
        };
        await requestServerOcrAnalysis(defaultRequest);
        const approvedRequest = {
            recordId: 'record-1',
            imageSource: 'data:image/jpeg;base64,/9j/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            allowPaidOcr: true,
            paidApprovalToken: 'approved-file-once',
            paidOcrAdminPassword: 'current-admin-password',
        };
        await requestServerOcrAnalysis(approvedRequest);

        const defaultRequestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}'));
        expect(defaultRequestBody).toMatchObject({
            recordId: 'record-1',
            allowPaidOcr: false,
        });
        expect(defaultRequestBody).not.toHaveProperty('paidApprovalToken');
        expect(defaultRequestBody).not.toHaveProperty('paidOcrAdminPassword');
        expect(defaultRequest.paidOcrAdminPassword).toBeUndefined();

        const approvedRequestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body || '{}'));
        expect(approvedRequestBody).toMatchObject({
            recordId: 'record-1',
            allowPaidOcr: true,
            paidApprovalToken: 'approved-file-once',
            paidOcrAdminPassword: 'current-admin-password',
        });
        expect(approvedRequest.paidOcrAdminPassword).toBeUndefined();
    });
});
