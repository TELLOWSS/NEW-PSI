import { afterEach, describe, expect, it, vi } from 'vitest';
import { OcrGatewayError, requestServerOcrAnalysis } from '../services/ocrGatewayService';

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
});
