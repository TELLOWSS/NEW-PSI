import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    OcrGatewayError,
    isOcrGatewaySystemUnavailable,
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
            '[OCR_PARSE_FAILURE] one file could not be parsed',
            { code: 'OCR_PARSE_FAILURE', status: 502 },
        ))).toBe(false);
    });
});
