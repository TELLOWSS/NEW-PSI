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

export const normalizeOcrConfidence = (value: unknown): number | undefined => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return undefined;
    if (numeric <= 1) return numeric;
    // 1.0 기반 응답의 작은 초과치는 1로 보정하고, 일반적인 0~100 응답은 백분율로 환산한다.
    if (numeric <= 2) return 1;
    return numeric / 100;
};

export interface PsiDocumentEvidence {
    hasPsiTitleEvidence: boolean;
    hasQuestionStructure: boolean;
    hasFooterEvidence: boolean;
    questionCount: number;
    isSufficient: boolean;
}

const getQuestionNumbers = (value: unknown): Set<string> => {
    const numbers = new Set<string>();
    if (Array.isArray(value)) {
        value.slice(0, 8).forEach((answer) => {
            if (!answer || typeof answer !== 'object') return;
            const matched = String((answer as Record<string, unknown>).questionNumber || '').match(/[1-5]/)?.[0];
            if (matched) numbers.add(matched);
        });
    }
    return numbers;
};

/** 모델 판정값과 별개로 제목/양식번호 + Q1~Q5 구조를 확인하는 결정론적 PSI 증거 게이트. */
export const assessPsiDocumentEvidence = (raw: Record<string, unknown>): PsiDocumentEvidence => {
    const nestedValidation = raw.ocrDocumentValidation && typeof raw.ocrDocumentValidation === 'object'
        ? raw.ocrDocumentValidation as Record<string, unknown>
        : {};
    const markers = [
        ...(Array.isArray(raw.documentMarkers) ? raw.documentMarkers : []),
        ...(Array.isArray(nestedValidation.detectedMarkers) ? nestedValidation.detectedMarkers : []),
    ].map((item) => String(item || '').trim()).filter(Boolean);
    const markerEvidenceText = markers.join(' ').normalize('NFKC').replace(/\s+/g, ' ');
    const evidenceText = [
        String(raw.fullText || ''),
        String(raw.koreanTranslation || ''),
        String(raw.documentValidationReason || ''),
        String(nestedValidation.reason || ''),
    ].join(' ').normalize('NFKC');
    const compactEvidence = evidenceText.replace(/\s+/g, ' ');
    const hasPsiIdentifier = /(?:^|[^a-z0-9])(?:new[-\s]?psi|psi[-\s]?ra[-\s]?0?1|psi)(?:[^a-z0-9]|$)/i.test(markerEvidenceText);
    const hasRiskAssessmentTitle = /위험성\s*평가/.test(markerEvidenceText);
    const hasFooterEvidence = /(?:현장\s*등록\s*한글\s*이름|공종|작성자|근로자\s*이름)/.test(markerEvidenceText);
    const questionNumbers = getQuestionNumbers(raw.handwrittenAnswers);
    for (const matched of compactEvidence.matchAll(/(?:^|[^0-9a-z])q?\s*([1-5])(?:[^0-9]|$)/gi)) {
        if (matched[1]) questionNumbers.add(matched[1]);
    }
    const questionCount = questionNumbers.size;
    const hasPsiTitleEvidence = hasPsiIdentifier || (hasRiskAssessmentTitle && hasFooterEvidence);
    const hasQuestionStructure = questionCount >= 4;
    return {
        hasPsiTitleEvidence,
        hasQuestionStructure,
        hasFooterEvidence,
        questionCount,
        isSufficient: hasPsiTitleEvidence && hasQuestionStructure,
    };
};

export const normalizeOcrDocumentMetadata = (raw: Record<string, unknown>) => {
    const rawDocumentType = String(raw.documentType || '').trim() as OcrDocumentType;
    const documentType: OcrDocumentType = DOCUMENT_TYPES.has(rawDocumentType)
        ? rawDocumentType
        : 'unknown';
    const explicitPsiFlag = typeof raw.isPsiForm === 'boolean' ? raw.isPsiForm : null;
    // 문서 검증 메타데이터가 없으면 PSI로 추정하지 않는다. 실제 인명·점수 자동확정은 fail-closed가 원칙이다.
    const declaredPsiForm = explicitPsiFlag ?? documentType === 'psi-risk-assessment';
    const deterministicEvidence = assessPsiDocumentEvidence(raw);
    const isPsiForm = declaredPsiForm && deterministicEvidence.isSufficient;
    const rawMarkers = Array.isArray(raw.documentMarkers) ? raw.documentMarkers : [];
    const rawConfidences = raw.fieldConfidences && typeof raw.fieldConfidences === 'object'
        ? raw.fieldConfidences as Record<string, unknown>
        : {};

    const validation: OcrDocumentValidation = {
        documentType,
        isPsiForm,
        reason: deterministicEvidence.isSufficient
            ? String(raw.documentValidationReason || '').trim()
            : `${String(raw.documentValidationReason || '').trim()}${raw.documentValidationReason ? ' | ' : ''}PSI 제목/양식번호와 Q1~Q5 구조 증거가 충분하지 않습니다.`,
        detectedMarkers: rawMarkers.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 12),
    };
    const fieldConfidences: OcrFieldConfidences = {
        name: normalizeOcrConfidence(rawConfidences.name),
        jobField: normalizeOcrConfidence(rawConfidences.jobField),
        date: normalizeOcrConfidence(rawConfidences.date),
        nationality: normalizeOcrConfidence(rawConfidences.nationality),
        handwrittenAnswers: normalizeOcrConfidence(rawConfidences.handwrittenAnswers),
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
