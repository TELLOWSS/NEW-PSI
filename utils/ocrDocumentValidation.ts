import type {
    OcrDocumentType,
    OcrDocumentValidation,
    OcrFieldConfidences,
    PsiFormVariant,
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
    hasRiskAssessmentTitle: boolean;
    hasLegacyForm1Structure: boolean;
    formVariant: PsiFormVariant;
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

const getHandwrittenAnswersEvidenceText = (value: unknown): string => {
    if (!Array.isArray(value)) return '';
    return value
        .slice(0, 8)
        .map((item) => {
            if (!item || typeof item !== 'object') return '';
            const row = item as Record<string, unknown>;
            return [row.questionNumber, row.answerText, row.koreanTranslation, row.nativeTranslation]
                .map((part) => String(part || '').trim())
                .filter(Boolean)
                .join(' ');
        })
        .filter(Boolean)
        .join(' ');
};

const hasSubstantiveHandwrittenAnswers = (value: unknown): boolean => {
    if (!Array.isArray(value)) return false;
    return value.some((item) => {
        if (!item || typeof item !== 'object') return false;
        const row = item as Record<string, unknown>;
        return [row.answerText, row.koreanTranslation, row.nativeTranslation]
            .some((part) => String(part || '').trim().length >= 2);
    });
};

const LEGACY_FORM1_DOMAIN_GROUPS: RegExp[] = [
    /작업\s*내용|금일\s*작업|오늘\s*작업|세부\s*작업|작업\s*공종|작업\s*장소|작업명|공정명?|작업\s*구간|비계|거푸집|형틀|철근|알폼|갱폼|해체|양중/,
    /유해[\s·•-]*위험\s*요인|위험\s*요인|위험\s*요소|위험\s*사항|위험\s*내용|사고\s*원인|사고\s*유형|추락|낙하|끼임|감전|협착|전도|붕괴|화재|개구부|단부/,
    /위험\s*성|위험\s*도|위험\s*등급|빈도|강도|상[\s/·]+중[\s/·]+하/,
    /감소\s*대책|안전\s*대책|개선\s*대책|안전\s*조치|안전\s*관리|조치\s*내용|조치\s*사항|예방\s*대책|대책|실천\s*사항|안전\s*행동|보호구|안전대|안전모|안전화|발판|안전난간|서명/,
];

const countLegacyForm1DomainSlots = (text: string): number => (
    LEGACY_FORM1_DOMAIN_GROUPS.filter((pattern) => pattern.test(text)).length
);

/** 모델 판정값과 별개로 2안(NEW-PSI/Q1~Q5)과 1안(기존·구형 위험성평가 기록지)을 함께 검증하는 결정론적 PSI 증거 게이트. */
export const assessPsiDocumentEvidence = (raw: Record<string, unknown>): PsiDocumentEvidence => {
    const nestedValidation = raw.ocrDocumentValidation && typeof raw.ocrDocumentValidation === 'object'
        ? raw.ocrDocumentValidation as Record<string, unknown>
        : {};
    const markers = [
        ...(Array.isArray(raw.documentMarkers) ? raw.documentMarkers : []),
        ...(Array.isArray(nestedValidation.detectedMarkers) ? nestedValidation.detectedMarkers : []),
    ].map((item) => String(item || '').trim()).filter(Boolean);
    const markerEvidenceText = markers.join(' ').normalize('NFKC').replace(/\s+/g, ' ');
    const answersEvidenceText = getHandwrittenAnswersEvidenceText(raw.handwrittenAnswers);
    const evidenceText = [
        String(raw.fullText || ''),
        String(raw.koreanTranslation || ''),
        String(raw.documentValidationReason || ''),
        String(nestedValidation.reason || ''),
        answersEvidenceText,
    ].join(' ').normalize('NFKC');
    const compactEvidence = evidenceText.replace(/\s+/g, ' ');
    const combinedEvidence = [markerEvidenceText, compactEvidence].filter(Boolean).join(' ');
    const legacyDomainSlotCount = countLegacyForm1DomainSlots(combinedEvidence);
    const hasSubstantiveContent = compactEvidence.trim().length >= 15 || hasSubstantiveHandwrittenAnswers(raw.handwrittenAnswers);
    const hasRiskAssessmentTitle = /위험성\s*평가|위험\s*요인\s*(?:평가|파악)|위험\s*예지|일일\s*위험성|근로자\s*위험성|작업\s*전\s*위험성|자기규율\s*위험성|안전보건\s*위험성|risk\s*assessment|风险评估|危险性评价|đánh\s*giá\s*rủi\s*ro|ประเมินความเสี่ยง|penilaian\s*risiko|xavf[^\n]{0,12}baholash|эрсдэлийн\s*үнэлгээ|оценка\s*рисков/i.test(combinedEvidence);
    const hasFooterEvidence = /(?:현장\s*등록\s*한글\s*이름|공종|직종|작성자|근로자\s*이름|근로자|작업자|성명|이름|팀명|소속|작성일|서명)/.test(combinedEvidence);
    const hasCroppedLegacyForm1Table = legacyDomainSlotCount >= 3 && hasFooterEvidence && hasSubstantiveContent;
    const hasLegacyForm1Structure = (hasRiskAssessmentTitle && legacyDomainSlotCount >= 2 && hasSubstantiveContent) || hasCroppedLegacyForm1Table;
    const hasPsiIdentifier = /(?:^|[^a-z0-9])(?:new[-\s]?psi|psi[-\s]?ra[-\s]?0?1|psi)(?:[^a-z0-9]|$)/i.test(combinedEvidence);
    const questionNumbers = getQuestionNumbers(raw.handwrittenAnswers);
    for (const matched of compactEvidence.matchAll(/(?:^|[^0-9a-z])q?\s*([1-5])(?:[^0-9]|$)/gi)) {
        if (matched[1]) questionNumbers.add(matched[1]);
    }
    const questionCount = questionNumbers.size;
    const hasQuestionStructure = questionCount >= 4 || hasLegacyForm1Structure;
    const hasPsiTitleEvidence = hasPsiIdentifier || (hasRiskAssessmentTitle && hasFooterEvidence) || hasCroppedLegacyForm1Table;
    const isForm2Explicit = hasPsiIdentifier || /\bq[1-5]\b/i.test(combinedEvidence) || (questionCount >= 4 && !hasLegacyForm1Structure);
    const formVariant: PsiFormVariant = isForm2Explicit
        ? 'form-2-psi'
        : hasLegacyForm1Structure
            ? 'form-1-legacy'
            : 'unknown';
    return {
        hasPsiTitleEvidence,
        hasQuestionStructure,
        hasFooterEvidence,
        hasRiskAssessmentTitle,
        hasLegacyForm1Structure,
        formVariant,
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
    const normalizedMarkers = rawMarkers.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 12);
    const fallbackMarkers = normalizedMarkers.length === 0 && deterministicEvidence.isSufficient
        ? [deterministicEvidence.formVariant === 'form-1-legacy' ? '위험성평가(1안)' : 'NEW-PSI']
        : normalizedMarkers;
    const rawConfidences = raw.fieldConfidences && typeof raw.fieldConfidences === 'object'
        ? raw.fieldConfidences as Record<string, unknown>
        : {};

    const validation: OcrDocumentValidation = {
        documentType,
        formVariant: deterministicEvidence.formVariant,
        isPsiForm,
        reason: deterministicEvidence.isSufficient
            ? String(raw.documentValidationReason || '').trim()
            : `${String(raw.documentValidationReason || '').trim()}${raw.documentValidationReason ? ' | ' : ''}위험성평가 기록지(1안 기존 양식 또는 2안 NEW-PSI) 제목·작성 항목 증거가 충분하지 않습니다.`,
        detectedMarkers: fallbackMarkers,
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
