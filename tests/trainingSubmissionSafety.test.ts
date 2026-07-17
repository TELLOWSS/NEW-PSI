import { afterEach, describe, expect, it } from 'vitest';
import {
    buildGroupProxyAcknowledgement,
    resolveAuthorizedWorkerId,
    resolveTrainingSubmissionAuthorization,
} from '../api/gateway';
import gatewayHandler from '../api/gateway';
import { normalizeSubmitSignaturePayload } from '../api/training/submit-signature';
import {
    generateTrainingLinkToken,
    generateWorkerAuthenticationToken,
} from '../lib/server/trainingLinkToken';

const originalSecret = process.env.TRAINING_LINK_SECRET;

afterEach(() => {
    if (originalSecret === undefined) delete process.env.TRAINING_LINK_SECRET;
    else process.env.TRAINING_LINK_SECRET = originalSecret;
});

describe('training submission authorization', () => {
    it('returns 403 before any submission work for an unverified public request', async () => {
        let statusCode = 0;
        let responseBody: any = null;
        const res = {
            status(code: number) {
                statusCode = code;
                return this;
            },
            json(body: any) {
                responseBody = body;
                return body;
            },
        };

        await gatewayHandler({
            method: 'POST',
            headers: {},
            query: { action: 'training.submit' },
            body: {
                type: 'single',
                payload: {
                    sessionId: 'session-1',
                    workerId: 'victim-worker-id',
                },
            },
        }, res);

        expect(statusCode).toBe(403);
        expect(responseBody.code).toBe('INVALID_TRAINING_LINK');
    });

    it('blocks a public arbitrary workerId without a verified proof', () => {
        expect(() => resolveTrainingSubmissionAuthorization(
            { headers: {} },
            'single',
            {
                sessionId: 'session-1',
                workerId: 'victim-worker-id',
            },
        )).toThrow('검증되지 않은 교육 링크');
    });

    it('does not accept a public training link without verified worker identity', () => {
        process.env.TRAINING_LINK_SECRET = 'test-only-training-secret';
        const expiresAt = Date.now() + 60_000;
        const payload = {
            sessionId: 'session-1',
            workerId: 'victim-worker-id',
            linkExpiresAt: expiresAt,
            linkToken: generateTrainingLinkToken('session-1', expiresAt),
        };

        expect(() => resolveTrainingSubmissionAuthorization(
            { headers: {} },
            'single',
            payload,
        )).toThrow('검증되지 않은 근로자 인증');
    });

    it('accepts a server-signed worker authentication proof only for its worker id', () => {
        process.env.TRAINING_LINK_SECRET = 'test-only-training-secret';
        const expiresAt = Date.now() + 60_000;
        const payload = {
            sessionId: 'session-1',
            workerId: 'worker-1',
            workerAuthExpiresAt: expiresAt,
            linkExpiresAt: expiresAt,
            linkToken: generateTrainingLinkToken('session-1', expiresAt),
            workerAuthToken: generateWorkerAuthenticationToken('session-1', 'worker-1', expiresAt),
        };

        const authorization = resolveTrainingSubmissionAuthorization(
            { headers: {} },
            'single',
            payload,
        );

        expect(authorization).toEqual({ mode: 'worker-auth', workerId: 'worker-1' });
        expect(resolveAuthorizedWorkerId(authorization, payload)).toBe('worker-1');
    });

    it('requires administrator authentication for group proxy submissions', () => {
        expect(() => resolveTrainingSubmissionAuthorization(
            { headers: {} },
            'group',
            { sessionId: 'session-1' },
        )).toThrow('관리자 인증');
    });
});

describe('training submission compatibility and proxy semantics', () => {
    it('maps the WorkerTraining submit-signature body into the guarded gateway contract', () => {
        const payload = normalizeSubmitSignaturePayload({
            sessionId: 'session-1',
            workerName: '홍길동',
            nationality: '대한민국',
            reviewedGuidance: true,
            audioPlayed: true,
            checklist: {
                riskReview: true,
                ppeConfirm: true,
                emergencyConfirm: true,
            },
        });

        expect(payload.scrolledToEnd).toBe(true);
        expect(payload.acknowledgedRiskAssessment).toBe(true);
        expect(payload.audioPlayed).toBe(true);
        expect(payload.isManagerProxy).toBe(false);
    });

    it('keeps group proxy acknowledgement separate from worker self-comprehension', () => {
        const acknowledgement = buildGroupProxyAcknowledgement({
            audioPlayed: true,
            checklist: {
                riskReview: true,
                ppeConfirm: false,
                emergencyConfirm: true,
            },
        });

        expect(acknowledgement.reviewedGuidance).toBe(false);
        expect(acknowledgement.comprehensionComplete).toBe(false);
        expect(acknowledgement.checklist.ppeConfirm).toBe(false);
        expect(acknowledgement.checklist.scrolledToEnd).toBe(false);
        expect(acknowledgement.checklist.proxySubmission).toBe(true);
        expect(acknowledgement.checklist.selfAttested).toBe(false);
    });
});
