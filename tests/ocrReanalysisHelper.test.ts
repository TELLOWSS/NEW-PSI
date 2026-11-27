import { describe, expect, it } from 'vitest';
import { OcrGatewayError } from '../services/ocrGatewayService';
import type { WorkerRecord } from '../types';
import {
    buildReanalysisErrorMessage,
    isTransientReanalysisError,
    mergeReanalyzedWorkerRecord,
} from '../utils/ocrReanalysisHelper';

const baseWorkerRecord = (): WorkerRecord => ({
    id: 'worker-reanalyze-1',
    name: '김안전',
    jobField: '형틀',
    date: '2026-11-26',
    nationality: '대한민국',
    language: 'ko',
    handwrittenAnswers: [
        { questionNumber: '1', answerText: '거푸집 조립', koreanTranslation: '거푸집 조립', nativeTranslation: '' },
    ],
    fullText: '기존 원문',
    koreanTranslation: '기존 해석',
    safetyScore: 0,
    safetyLevel: '초급',
    strengths: [],
    strengths_native: [],
    weakAreas: [],
    weakAreas_native: [],
    improvement: '',
    improvement_native: '',
    suggestions: [],
    suggestions_native: [],
    aiInsights: '이전 실패',
    aiInsights_native: '',
    selfAssessedRiskLevel: '중',
    originalImage: 'data:image/jpeg;base64,ZmFrZQ==',
    ocrErrorType: 'UNKNOWN',
    ocrFailureCode: 'NETWORK',
    ocrErrorMessage: '[OCR_UPSTREAM_FAILURE] 이전 상류 장애',
    ocrUnknownSubCategory: 'network-like',
    secondPassStatus: 'NEEDED',
    workflowState: 'manual_review_required',
    riskDecision: 'IMMEDIATE_ATTENTION',
    approvalState: 'PENDING',
    auditTrail: [
        { stage: 'ocr', timestamp: '2026-11-26T01:00:00Z', actor: 'ai-engine', note: '최초 실패' },
    ],
});

describe('OCR reanalysis diagnostics and merge helper', () => {
    it('classifies only transient 5xx/network errors as retryable', () => {
        expect(isTransientReanalysisError(new OcrGatewayError('[OCR_UPSTREAM_FAILURE] 502', {
            code: 'OCR_UPSTREAM_FAILURE',
            status: 502,
        }))).toBe(true);
        expect(isTransientReanalysisError(new OcrGatewayError('[OCR_UPSTREAM_NETWORK] err', {
            code: 'OCR_UPSTREAM_NETWORK',
            status: 502,
        }))).toBe(true);
        expect(isTransientReanalysisError(new TypeError('Failed to fetch'))).toBe(true);

        for (const [code, status] of [
            ['OCR_PAID_APPROVAL_REQUIRED', 402],
            ['OCR_QUOTA', 429],
            ['OCR_RATE_LIMITED', 429],
            ['OCR_WRONG_DOCUMENT', 422],
            ['OCR_TIMEOUT', 504],
            ['HTTP_401', 401],
            ['OPENAI_API_NOT_CONFIGURED', 400],
        ] as const) {
            expect(isTransientReanalysisError(new OcrGatewayError(`[${code}] err`, { code, status }))).toBe(false);
        }
    });

    it('produces actionable Korean error guidance with error code instead of generic failure', () => {
        const upstream = buildReanalysisErrorMessage(new OcrGatewayError('[OCR_UPSTREAM_FAILURE] 502', {
            code: 'OCR_UPSTREAM_FAILURE',
            status: 502,
        }));
        expect(upstream.code).toBe('OCR_UPSTREAM_FAILURE');
        expect(upstream.retryable).toBe(true);
        expect(upstream.fullMessage).toContain('OCR_UPSTREAM_FAILURE');
        expect(upstream.fullMessage).toContain('AI 분석 서버 응답');

        const wrongDoc = buildReanalysisErrorMessage(new OcrGatewayError('[OCR_WRONG_DOCUMENT] 제목 불일치', {
            code: 'OCR_WRONG_DOCUMENT',
            status: 422,
        }));
        expect(wrongDoc.code).toBe('OCR_WRONG_DOCUMENT');
        expect(wrongDoc.retryable).toBe(false);
        expect(wrongDoc.fullMessage).toContain('1안·2안 위험성평가');
        expect(wrongDoc.fullMessage).toContain('제목 불일치');
    });

    it('clears prior OCR error flags after successful reanalysis and preserves review-only state when needed', () => {
        const previous = baseWorkerRecord();
        const cleaned = mergeReanalyzedWorkerRecord(previous, {
            ...previous,
            safetyScore: 86,
            safetyLevel: '고급',
            ocrErrorType: undefined,
            ocrFailureCode: undefined,
            ocrErrorMessage: undefined,
            aiInsights: '정상 분석 완료',
            aiInsights_native: '정상 분석 완료',
        }, {
            providerUsed: 'server_gemini',
            modelUsed: 'gemini-3.7-flash',
            attempts: 3,
            fallbackDepth: 2,
            latencyMs: 1200,
            recordedAt: '2026-11-27T00:00:00Z',
        });

        expect(cleaned.safetyScore).toBe(86);
        expect(cleaned.ocrErrorType).toBeUndefined();
        expect(cleaned.ocrFailureCode).toBeUndefined();
        expect(cleaned.ocrErrorMessage).toBeUndefined();
        expect(cleaned.ocrUnknownSubCategory).toBeUndefined();
        expect(cleaned.secondPassStatus).toBe('DONE');
        expect(cleaned.workflowState).toBe('completed');
        expect(cleaned.approvalState).toBe('APPROVED');
        expect(cleaned.ocrTrace?.modelUsed).toBe('gemini-3.7-flash');

        const reviewOnly = mergeReanalyzedWorkerRecord(previous, {
            ...previous,
            safetyScore: 68,
            safetyLevel: '중급',
            ocrErrorType: 'QUALITY',
            ocrFailureCode: 'UNKNOWN',
            ocrErrorMessage: '관리자 확인 필요',
        });
        expect(reviewOnly.ocrErrorType).toBe('QUALITY');
        expect(reviewOnly.secondPassStatus).toBe('NEEDED');
        expect(reviewOnly.workflowState).toBe('manual_review_required');
        expect(reviewOnly.approvalState).toBe('PENDING');
    });
});
