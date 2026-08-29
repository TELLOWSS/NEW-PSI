import type { OcrTraceInfo, WorkerRecord } from '../types';
import type { OcrEngineMode } from '../utils/aiEngineSettings';

export class OcrGatewayError extends Error {
    code?: string;
    status: number;
    trace?: OcrTraceInfo;
    estimatedCostUsd?: number;
    maxCostUsd?: number;
    paidApprovalToken?: string;
    paidAvailable?: boolean;
    paidUnavailableReason?: string;

    constructor(message: string, options: {
        code?: string;
        status: number;
        trace?: OcrTraceInfo;
        estimatedCostUsd?: number;
        maxCostUsd?: number;
        paidApprovalToken?: string;
        paidAvailable?: boolean;
        paidUnavailableReason?: string;
    }) {
        super(message);
        this.name = 'OcrGatewayError';
        this.code = options.code;
        this.status = options.status;
        this.trace = options.trace;
        this.estimatedCostUsd = options.estimatedCostUsd;
        this.maxCostUsd = options.maxCostUsd;
        this.paidApprovalToken = options.paidApprovalToken;
        this.paidAvailable = options.paidAvailable;
        this.paidUnavailableReason = options.paidUnavailableReason;
    }
}

export const OCR_PAID_APPROVAL_REQUIRED_CODE = 'OCR_PAID_APPROVAL_REQUIRED';

/** 무료 할당량 소진 후 서버가 명시적으로 승인 절차를 요구한 경우만 유료 승인 UI를 연다. */
export const isOcrPaidApprovalRequired = (error: unknown): error is OcrGatewayError => (
    error instanceof OcrGatewayError
    && String(error.code || '').toUpperCase() === OCR_PAID_APPROVAL_REQUIRED_CODE
);

const readOptionalNonNegativeNumber = (...values: unknown[]): number | undefined => {
    for (const value of values) {
        if (value === null || value === undefined) continue;
        if (typeof value === 'string' && !value.trim()) continue;
        const parsed = typeof value === 'number' ? value : Number(value);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return undefined;
};

const readOptionalString = (...values: unknown[]): string | undefined => {
    for (const value of values) {
        const parsed = String(value || '').trim();
        if (parsed) return parsed;
    }
    return undefined;
};

const OCR_SYSTEM_UNAVAILABLE_CODES = new Set([
    'SECURITY_QUOTA_UNAVAILABLE',
    'MISSING_SERVER_GEMINI_KEY',
    'MISSING_SERVER_GEMINI_FREE_KEY',
    'MISSING_SERVER_GEMINI_PAID_KEY',
    'OCR_PAID_APPROVAL_UNAVAILABLE',
    'OCR_UPSTREAM_AUTH',
    'HTTP_500',
    'HTTP_503',
]);

/** 파일 자체가 아니라 공통 서버 설정/의존성 장애인 경우에만 배치 회로를 연다. */
export const isOcrGatewaySystemUnavailable = (error: unknown): boolean => {
    if (!(error instanceof OcrGatewayError)) return false;
    return OCR_SYSTEM_UNAVAILABLE_CODES.has(String(error.code || '').toUpperCase());
};

export type OcrGatewayResult = {
    recordId: string;
    record: WorkerRecord;
    trace?: OcrTraceInfo;
};

export const requestServerOcrAnalysis = async (input: {
    recordId: string;
    imageSource: string;
    filenameHint?: string;
    ocrEngine?: OcrEngineMode;
    allowPaidOcr?: boolean;
    paidApprovalToken?: string;
    paidOcrAdminPassword?: string;
}): Promise<OcrGatewayResult> => {
    let requestBody = JSON.stringify({
        recordId: input.recordId,
        imageSource: input.imageSource,
        filenameHint: input.filenameHint,
        ocrEngine: input.ocrEngine || 'auto',
        // 유료 실행 정보는 사용자가 해당 문서에 승인한 재요청에서만 전송한다.
        allowPaidOcr: input.allowPaidOcr === true,
        paidApprovalToken: input.allowPaidOcr === true ? input.paidApprovalToken : undefined,
        paidOcrAdminPassword: input.allowPaidOcr === true ? input.paidOcrAdminPassword : undefined,
    });
    // 호출자가 전달한 임시 객체에도 관리자 비밀번호를 남겨두지 않는다.
    input.paidOcrAdminPassword = undefined;

    const responsePromise = fetch('/api/gateway?action=ocr.retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
    });
    // fetch가 요청 본문을 인수한 직후 직렬화 문자열 참조도 제거한다.
    requestBody = '';
    const response = await responsePromise;

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok || !data?.record) {
        const code = String(data?.code || '').trim() || `HTTP_${response.status}`;
        const message = String(data?.message || response.statusText || '서버 OCR 분석 실패').trim();
        throw new OcrGatewayError(`[${code}] ${message}`, {
            code,
            status: response.status,
            trace: data?.trace as OcrTraceInfo | undefined,
            estimatedCostUsd: readOptionalNonNegativeNumber(
                data?.estimatedCostUsd,
                data?.details?.estimatedCostUsd,
            ),
            maxCostUsd: readOptionalNonNegativeNumber(
                data?.maxCostUsd,
                data?.details?.maxCostUsd,
            ),
            paidApprovalToken: readOptionalString(
                data?.paidApprovalToken,
                data?.details?.paidApprovalToken,
            ),
            paidAvailable: typeof data?.paidAvailable === 'boolean'
                ? data.paidAvailable
                : typeof data?.details?.paidAvailable === 'boolean'
                    ? data.details.paidAvailable
                    : undefined,
            paidUnavailableReason: readOptionalString(
                data?.paidUnavailableReason,
                data?.details?.paidUnavailableReason,
            ),
        });
    }

    return {
        recordId: String(data.recordId || input.recordId),
        record: {
            ...data.record,
            id: String(data.record.id || input.recordId),
        } as WorkerRecord,
        trace: data.trace as OcrTraceInfo | undefined,
    };
};
