import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const durableSupabase = vi.hoisted(() => {
    const consumedNonceHashes = new Set<string>();
    const events: string[] = [];
    const insert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ insert }));
    const rpc = vi.fn(async (_functionName: string, args: Record<string, unknown>) => {
        const scope = String(args.p_scope || '');
        events.push(`rpc:${scope}`);

        if (scope === 'ocr.paid-approval.consume') {
            const nonceHash = String(args.p_client_key_hash || '');
            const allowed = !consumedNonceHashes.has(nonceHash);
            if (allowed) consumedNonceHashes.add(nonceHash);
            return {
                data: [{
                    allowed,
                    current_count: 1,
                    retry_after_seconds: allowed ? 0 : 60,
                }],
                error: null,
            };
        }

        return {
            data: [{ allowed: true, current_count: 1, retry_after_seconds: 0 }],
            error: null,
        };
    });

    return {
        client: { rpc, from },
        consumedNonceHashes,
        events,
        from,
        insert,
        rpc,
    };
});

vi.mock('../lib/server/supabaseServer.js', () => ({
    createSupabaseServerClient: () => durableSupabase.client,
}));

import gatewayHandler, {
    consumePaidOcrApprovalOnce,
    issuePaidOcrApprovalToken,
    verifyPaidOcrApprovalToken,
} from '../api/gateway';

const ENV_KEYS = [
    'ADMIN_API_AUTH_TOKEN',
    'ADMIN_LOGIN_PASSWORD',
    'PSI_ADMIN_PASSWORD',
    'GEMINI_API_KEY_FREE',
    'GEMINI_API_KEY_PAID',
    'OCR_MAX_USD_PER_DOCUMENT',
    'OCR_PAID_APPROVAL_SECRET',
    'OCR_PAID_APPROVAL_TTL_SECONDS',
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const ADMIN_TOKEN = 'paid-flow-admin-session';
const ADMIN_PASSWORD = 'paid-flow-current-password';
const FREE_API_KEY = 'mock-free-api-key';
const PAID_API_KEY = 'mock-paid-api-key';
const approvalContext = {
    recordId: 'record-paid-success',
    imageSource: `data:image/png;base64,${Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(120),
    ]).toString('base64')}`,
    maxCostUsd: 0.05,
};
const requestHeaders = {
    'x-admin-auth': ADMIN_TOKEN,
    'x-forwarded-for': '198.51.100.80',
    'user-agent': 'paid-ocr-integration-test',
};

const successfulOcrRecord = {
    documentType: 'psi-risk-assessment',
    isPsiForm: true,
    documentValidationReason: 'NEW-PSI 제목과 Q1~Q5 및 하단 인적사항을 확인했습니다.',
    documentMarkers: ['NEW-PSI', '위험성평가', '공종', '현장 등록 한글이름', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
    fieldConfidences: {
        name: 0.96,
        jobField: 0.96,
        date: 0.96,
        nationality: 0.96,
        handwrittenAnswers: 0.96,
    },
    name: '김현장',
    jobField: '철근',
    teamLeader: '박팀장',
    date: '2026-08-31',
    nationality: '대한민국',
    language: 'ko',
    safetyScore: 80,
    safetyLevel: '고급',
    score_reason: '추락 위험과 작업 전 점검 순서를 구체적으로 기록했습니다.',
    score_reason_native: '추락 위험과 작업 전 점검 순서를 구체적으로 기록했습니다.',
    actionable_coaching: '작업 전 안전대 체결 상태를 팀장과 함께 확인하세요.',
    actionable_coaching_native: '작업 전 안전대 체결 상태를 팀장과 함께 확인하세요.',
    scoreBreakdown: {
        psychological: 8,
        jobUnderstanding: 16,
        riskAssessmentUnderstanding: 16,
        proficiency: 24,
        improvementExecution: 16,
        repeatViolationPenalty: 0,
    },
    strengths: ['작업 전 점검 순서가 구체적입니다.'],
    strengths_native: ['작업 전 점검 순서가 구체적입니다.'],
    weakAreas: ['단부 접근 통제 기준을 보완해야 합니다.'],
    weakAreas_native: ['단부 접근 통제 기준을 보완해야 합니다.'],
    improvement: '단부 접근 전 통제선을 확인합니다.',
    improvement_native: '단부 접근 전 통제선을 확인합니다.',
    suggestions: ['안전대 체결 확인을 상호 점검합니다.'],
    suggestions_native: ['안전대 체결 확인을 상호 점검합니다.'],
    aiInsights: '철근 작업 전 안전대 체결과 단부 통제 상태를 확인해야 합니다.',
    aiInsights_native: '철근 작업 전 안전대 체결과 단부 통제 상태를 확인해야 합니다.',
    fullText: 'NEW-PSI 위험성평가 Q1 Q2 Q3 Q4 Q5 공종 철근 현장 등록 한글이름 김현장',
    koreanTranslation: '위험성평가 문항별 답변과 안전조치를 확인했습니다.',
    scoreReasoning: ['세부 보호지표 합계로 점수를 계산했습니다.'],
    ocrConfidence: 0.96,
    handwrittenAnswers: [
        ['1', '고소 철근 조립 중 추락 위험'],
        ['2', '단부 접근과 발판 흔들림이 사고 원인'],
        ['3', '위험수준은 높음이며 추락 시 중상 가능'],
        ['4', '안전대 체결 후 통제선 안쪽에서 작업'],
        ['5', '작업 전 팀장과 체결 상태를 상호 확인'],
    ].map(([questionNumber, answerText]) => ({
        questionNumber,
        answerText,
        koreanTranslation: answerText,
        nativeTranslation: '',
    })),
};

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

const callOcrGateway = async (body: Record<string, unknown>) => {
    const response = createResponse();
    await gatewayHandler({
        method: 'POST',
        headers: requestHeaders,
        query: { action: 'ocr.retry' },
        body,
    }, response.response);
    return response.read();
};

const getApiKey = (init?: RequestInit): string => {
    const headers = init?.headers as Record<string, string> | undefined;
    return String(headers?.['x-goog-api-key'] || '');
};

beforeEach(() => {
    process.env.ADMIN_API_AUTH_TOKEN = ADMIN_TOKEN;
    process.env.ADMIN_LOGIN_PASSWORD = ADMIN_PASSWORD;
    process.env.PSI_ADMIN_PASSWORD = ADMIN_PASSWORD;
    process.env.GEMINI_API_KEY_FREE = FREE_API_KEY;
    process.env.GEMINI_API_KEY_PAID = PAID_API_KEY;
    process.env.OCR_MAX_USD_PER_DOCUMENT = '0.05';
    process.env.OCR_PAID_APPROVAL_SECRET = 'paid-flow-signing-secret';
    process.env.OCR_PAID_APPROVAL_TTL_SECONDS = '60';

    durableSupabase.consumedNonceHashes.clear();
    durableSupabase.events.length = 0;
    durableSupabase.rpc.mockClear();
    durableSupabase.from.mockClear();
    durableSupabase.insert.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    for (const key of ENV_KEYS) {
        const value = originalEnv[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('paid OCR approval integration', () => {
    it('runs one paid countTokens and one stateless paid interaction only after challenge, password, and durable nonce consumption', async () => {
        const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const url = String(input);
            const apiKey = getApiKey(init);
            const operation = url.endsWith(':countTokens') ? 'countTokens' : 'interactions';
            durableSupabase.events.push(`fetch:${apiKey}:${operation}`);

            if (apiKey === FREE_API_KEY) {
                return new Response(JSON.stringify({
                    error: { status: 'RESOURCE_EXHAUSTED', message: 'free quota exhausted' },
                }), { status: 429, headers: { 'Content-Type': 'application/json' } });
            }
            if (apiKey === PAID_API_KEY && operation === 'countTokens') {
                return new Response(JSON.stringify({ totalTokens: 600 }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            if (apiKey === PAID_API_KEY && operation === 'interactions') {
                return new Response(JSON.stringify({
                    status: 'completed',
                    output_text: JSON.stringify([successfulOcrRecord]),
                    usage: {
                        total_input_tokens: 600,
                        total_output_tokens: 300,
                        total_thought_tokens: 0,
                    },
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            throw new Error(`Unexpected mocked Gemini request: ${apiKey} ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        const challenge = await callOcrGateway({
            recordId: approvalContext.recordId,
            imageSource: approvalContext.imageSource,
            filenameHint: '현장 기록.png',
            ocrEngine: 'auto',
        });

        expect(challenge.statusCode).toBe(402);
        expect(challenge.body).toMatchObject({
            code: 'OCR_PAID_APPROVAL_REQUIRED',
            requiresExplicitApproval: true,
            paidAvailable: true,
            maxCostUsd: 0.05,
        });
        expect(challenge.body.paidApprovalToken).toEqual(expect.any(String));
        expect(challenge.body.paidApprovalToken.length).toBeGreaterThan(40);

        const approvedBody: Record<string, unknown> = {
            recordId: approvalContext.recordId,
            imageSource: approvalContext.imageSource,
            filenameHint: '현장 기록.png',
            ocrEngine: 'auto',
            allowPaidOcr: true,
            paidApprovalToken: challenge.body.paidApprovalToken,
            paidOcrAdminPassword: ADMIN_PASSWORD,
        };
        const approved = await callOcrGateway(approvedBody);

        expect(approved.statusCode).toBe(200);
        expect(approved.body).toMatchObject({
            ok: true,
            recordId: approvalContext.recordId,
            record: { name: '김현장', jobField: '철근' },
            trace: {
                billingTier: 'paid',
                paidApprovalUsed: true,
                freeQuotaExhausted: true,
                paidCalls: 1,
                attempts: 1,
            },
        });
        expect(approvedBody).not.toHaveProperty('paidOcrAdminPassword');

        const nonceRpcCalls = durableSupabase.rpc.mock.calls.filter(([, args]) => (
            (args as Record<string, unknown>).p_scope === 'ocr.paid-approval.consume'
        ));
        expect(nonceRpcCalls).toHaveLength(1);
        expect(nonceRpcCalls[0]?.[1]).toMatchObject({
            p_max_requests: 1,
            p_client_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        });

        const paidCalls = fetchMock.mock.calls.filter(([, init]) => getApiKey(init) === PAID_API_KEY);
        expect(paidCalls.filter(([url]) => String(url).endsWith(':countTokens'))).toHaveLength(1);
        expect(paidCalls.filter(([url]) => String(url).endsWith('/interactions'))).toHaveLength(1);
        const interactionBody = JSON.parse(String(
            paidCalls.find(([url]) => String(url).endsWith('/interactions'))?.[1]?.body || '{}',
        ));
        expect(interactionBody).toMatchObject({
            model: 'gemini-3.5-flash-lite',
            store: false,
            response_format: { type: 'text', mime_type: 'application/json' },
            generation_config: { thinking_level: 'minimal' },
        });
        expect(interactionBody.input).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'image', resolution: 'high' }),
        ]));
        expect(durableSupabase.events.indexOf('rpc:ocr.paid-approval.consume')).toBeLessThan(
            durableSupabase.events.indexOf(`fetch:${PAID_API_KEY}:countTokens`),
        );

        const reused = await callOcrGateway({
            recordId: approvalContext.recordId,
            imageSource: approvalContext.imageSource,
            filenameHint: '현장 기록.png',
            ocrEngine: 'auto',
            allowPaidOcr: true,
            paidApprovalToken: challenge.body.paidApprovalToken,
            paidOcrAdminPassword: ADMIN_PASSWORD,
        });

        expect(reused.statusCode).toBe(409);
        expect(reused.body.code).toBe('OCR_PAID_APPROVAL_ALREADY_USED');
        expect(fetchMock.mock.calls.filter(([, init]) => getApiKey(init) === PAID_API_KEY)).toHaveLength(2);
        expect(durableSupabase.rpc.mock.calls.filter(([, args]) => (
            (args as Record<string, unknown>).p_scope === 'ocr.paid-approval.consume'
        ))).toHaveLength(1);
    });

    it('allows exactly one of two concurrent durable nonce consumers', async () => {
        const issued = issuePaidOcrApprovalToken(
            { headers: requestHeaders },
            approvalContext,
        );
        const payload = verifyPaidOcrApprovalToken(
            { headers: requestHeaders },
            issued.token,
            approvalContext,
        );
        const databaseNonces = new Set<string>();
        const rpc = vi.fn(async (_functionName: string, args: Record<string, unknown>) => {
            const nonceHash = String(args.p_client_key_hash || '');
            const allowed = !databaseNonces.has(nonceHash);
            if (allowed) databaseNonces.add(nonceHash);
            await Promise.resolve();
            return {
                data: [{ allowed, current_count: 1, retry_after_seconds: allowed ? 0 : 60 }],
                error: null,
            };
        });

        const results = await Promise.allSettled([
            consumePaidOcrApprovalOnce({ rpc }, payload, { adminPasswordReverified: true }),
            consumePaidOcrApprovalOnce({ rpc }, payload, { adminPasswordReverified: true }),
        ]);

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
        expect(rejected.reason).toMatchObject({
            code: 'OCR_PAID_APPROVAL_ALREADY_USED',
            statusCode: 409,
        });
        expect(rpc).toHaveBeenCalledTimes(2);
        expect(rpc).toHaveBeenCalledWith('psi_consume_api_quota', expect.objectContaining({
            p_scope: 'ocr.paid-approval.consume',
            p_max_requests: 1,
        }));
    });

    it('rejects signature tampering and expiry before nonce consumption', () => {
        const request = { headers: requestHeaders };
        const issued = issuePaidOcrApprovalToken(request, approvalContext);
        const [encodedPayload, signature] = issued.token.split('.');
        const replacement = signature.endsWith('A') ? 'B' : 'A';
        const tampered = `${encodedPayload}.${signature.slice(0, -1)}${replacement}`;

        expect(() => verifyPaidOcrApprovalToken(request, tampered, approvalContext)).toThrow(expect.objectContaining({
            code: 'OCR_PAID_APPROVAL_INVALID',
            statusCode: 403,
        }));

        const issuedAtMs = 1_800_000_000_000;
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(issuedAtMs);
        const expiring = issuePaidOcrApprovalToken(request, approvalContext);
        nowSpy.mockReturnValue(issuedAtMs + 61_000);

        expect(() => verifyPaidOcrApprovalToken(request, expiring.token, approvalContext)).toThrow(expect.objectContaining({
            code: 'OCR_PAID_APPROVAL_EXPIRED',
            statusCode: 403,
        }));
        expect(durableSupabase.rpc).not.toHaveBeenCalled();
    });
});
