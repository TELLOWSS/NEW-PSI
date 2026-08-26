import type { OcrTraceInfo, WorkerRecord } from '../types';
import type { OcrEngineMode } from '../utils/aiEngineSettings';

export class OcrGatewayError extends Error {
    code?: string;
    status: number;
    trace?: OcrTraceInfo;

    constructor(message: string, options: { code?: string; status: number; trace?: OcrTraceInfo }) {
        super(message);
        this.name = 'OcrGatewayError';
        this.code = options.code;
        this.status = options.status;
        this.trace = options.trace;
    }
}

const OCR_SYSTEM_UNAVAILABLE_CODES = new Set([
    'SECURITY_QUOTA_UNAVAILABLE',
    'MISSING_SERVER_GEMINI_KEY',
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
}): Promise<OcrGatewayResult> => {
    const response = await fetch('/api/gateway?action=ocr.retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            recordId: input.recordId,
            imageSource: input.imageSource,
            filenameHint: input.filenameHint,
            ocrEngine: input.ocrEngine || 'auto',
        }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok || !data?.record) {
        const code = String(data?.code || '').trim() || `HTTP_${response.status}`;
        const message = String(data?.message || response.statusText || '서버 OCR 분석 실패').trim();
        throw new OcrGatewayError(`[${code}] ${message}`, {
            code,
            status: response.status,
            trace: data?.trace as OcrTraceInfo | undefined,
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
