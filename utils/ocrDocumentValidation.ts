import type {
    OcrDocumentType,
    OcrDocumentValidation,
    OcrFieldConfidences,
    WorkerRecord,
} from '../types';
import { getSafetyLevelFromScore } from './safetyLevelUtils.js';

const DOCUMENT_TYPES = new Set<OcrDocumentType>([
    'psi-risk-assessment',
    'other-safety-document',
    'unknown',
]);

const clampConfidence = (value: unknown): number | undefined => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : undefined;
};

export const normalizeOcrDocumentMetadata = (raw: Record<string, unknown>) => {
    const rawDocumentType = String(raw.documentType || '').trim() as OcrDocumentType;
    const documentType: OcrDocumentType = DOCUMENT_TYPES.has(rawDocumentType)
        ? rawDocumentType
        : 'unknown';
    const explicitPsiFlag = typeof raw.isPsiForm === 'boolean' ? raw.isPsiForm : null;
    const isPsiForm = explicitPsiFlag ?? (documentType === 'psi-risk-assessment' || !raw.documentType);
    const rawMarkers = Array.isArray(raw.documentMarkers) ? raw.documentMarkers : [];
    const rawConfidences = raw.fieldConfidences && typeof raw.fieldConfidences === 'object'
        ? raw.fieldConfidences as Record<string, unknown>
        : {};

    const validation: OcrDocumentValidation = {
        documentType,
        isPsiForm,
        reason: String(raw.documentValidationReason || '').trim(),
        detectedMarkers: rawMarkers.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 12),
    };
    const fieldConfidences: OcrFieldConfidences = {
        name: clampConfidence(rawConfidences.name),
        jobField: clampConfidence(rawConfidences.jobField),
        date: clampConfidence(rawConfidences.date),
        nationality: clampConfidence(rawConfidences.nationality),
        handwrittenAnswers: clampConfidence(rawConfidences.handwrittenAnswers),
    };

    return { validation, fieldConfidences };
};

export const applyOcrDocumentGate = <T extends WorkerRecord>(record: T): T => {
    if (record.ocrDocumentValidation?.isPsiForm !== false) return record;
    const reason = record.ocrDocumentValidation.reason || 'PSI 위험성평가 기록지의 필수 표식과 문항 구조를 확인할 수 없습니다.';

    return {
        ...record,
        safetyScore: 0,
        safetyLevel: getSafetyLevelFromScore(0),
        ocrErrorType: 'LAYOUT',
        ocrFailureCode: 'FORMAT',
        ocrStatus: 'TEXT_ONLY_REVIEW',
        ocrErrorMessage: `잘못된 문서 차단: ${reason}`,
        reviewStatus: 'PENDING',
        secondPassStatus: 'NEEDED',
        workflowState: 'second_pass_required',
        riskDecision: 'IMMEDIATE_ATTENTION',
        approvalState: 'REQUIRED',
        auditTrail: [
            ...(record.auditTrail || []),
            {
                stage: 'validation',
                timestamp: new Date().toISOString(),
                actor: 'ocr-document-gate',
                note: `PSI 문서 불일치로 자동 분석 차단: ${reason}`,
            },
        ],
    };
};

export const getLowConfidenceOcrFields = (
    confidences: OcrFieldConfidences | undefined,
    threshold = 0.8,
) => {
    const labels: Record<keyof OcrFieldConfidences, string> = {
        name: '근로자 이름',
        jobField: '공종',
        date: '작성일',
        nationality: '국적',
        handwrittenAnswers: '문항별 필기 답변',
    };

    return (Object.entries(confidences || {}) as Array<[keyof OcrFieldConfidences, number | undefined]>)
        .filter(([, confidence]) => typeof confidence === 'number' && confidence < threshold)
        .map(([field, confidence]) => ({ field, label: labels[field], confidence: confidence as number }));
};
