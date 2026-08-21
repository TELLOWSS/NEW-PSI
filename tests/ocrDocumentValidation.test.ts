import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    applyOcrDocumentGate,
    getLowConfidenceOcrFields,
    normalizeOcrDocumentMetadata,
} from '../utils/ocrDocumentValidation';

const baseRecord = (): WorkerRecord => ({
    id: 'record-1',
    name: '테스트',
    jobField: '철근',
    date: '2026-07-17',
    nationality: '대한민국',
    language: 'ko',
    handwrittenAnswers: [],
    fullText: '',
    koreanTranslation: '',
    safetyScore: 80,
    safetyLevel: '고급',
    strengths: [],
    strengths_native: [],
    weakAreas: [],
    weakAreas_native: [],
    improvement: '',
    improvement_native: '',
    suggestions: [],
    suggestions_native: [],
    aiInsights: '',
    aiInsights_native: '',
    selfAssessedRiskLevel: '중',
});

describe('OCR document validation gate', () => {
    it('normalizes document and field confidence metadata', () => {
        const result = normalizeOcrDocumentMetadata({
            documentType: 'psi-risk-assessment',
            isPsiForm: true,
            documentValidationReason: 'Q1~Q5 확인',
            documentMarkers: ['NEW-PSI', '공종', '현장 등록 한글이름', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
            handwrittenAnswers: [1, 2, 3, 4, 5].map((questionNumber) => ({ questionNumber })),
            fieldConfidences: { name: 1.2, jobField: 0.65, date: 95 },
        });

        expect(result.validation.isPsiForm).toBe(true);
        expect(result.fieldConfidences.name).toBe(1);
        expect(result.fieldConfidences.jobField).toBe(0.65);
        expect(result.fieldConfidences.date).toBe(0.95);
    });

    it('blocks scoring and approval for a non-PSI document', () => {
        const record = baseRecord();
        record.ocrDocumentValidation = {
            documentType: 'other-safety-document',
            isPsiForm: false,
            reason: '문항 구조 없음',
            detectedMarkers: [],
        };
        const gated = applyOcrDocumentGate(record);

        expect(gated.safetyScore).toBe(0);
        expect(gated.ocrFailureCode).toBe('FORMAT');
        expect(gated.approvalState).toBe('REQUIRED');
        expect(gated.riskDecision).toBe('IMMEDIATE_ATTENTION');
    });

    it('fails closed when model-declared PSI lacks title and Q1-Q5 evidence', () => {
        const result = normalizeOcrDocumentMetadata({
            documentType: 'psi-risk-assessment',
            isPsiForm: true,
            documentMarkers: [],
            fullText: '일반 메모 문서',
        });

        expect(result.validation.isPsiForm).toBe(false);
        expect(result.validation.reason).toContain('증거가 충분하지 않습니다');
    });

    it('returns only fields below the review threshold', () => {
        const lowFields = getLowConfidenceOcrFields({ name: 0.92, jobField: 0.55, date: 0.79 });
        expect(lowFields.map((item) => item.field)).toEqual(['jobField', 'date']);
    });
});
