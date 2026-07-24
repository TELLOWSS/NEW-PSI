import { afterEach, describe, expect, it } from 'vitest';
import gatewayHandler from '../api/gateway';

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

afterEach(() => {
    if (originalSecret === undefined) delete process.env.TRAINING_LINK_SECRET;
    else process.env.TRAINING_LINK_SECRET = originalSecret;
});

describe('gateway public security boundaries', () => {
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
