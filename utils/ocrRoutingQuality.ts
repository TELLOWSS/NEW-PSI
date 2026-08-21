import { assessPsiDocumentEvidence, normalizeOcrConfidence } from './ocrDocumentValidation.js';

export const OCR_AUTO_ACCEPTANCE_THRESHOLD = 0.86;
export const OCR_CRITICAL_FIELD_THRESHOLD = 0.82;
export const OCR_MIN_ANSWER_COUNT = 4;

export type OcrRoutingQualityReason =
    | 'wrong-document'
    | 'insufficient-psi-markers'
    | 'missing-source-text'
    | 'missing-critical-value'
    | 'low-ocr-confidence'
    | 'low-critical-field-confidence'
    | 'incomplete-q1-q5';

export interface OcrRoutingQualityAssessment {
    isVerifiedPsiForm: boolean;
    score: number;
    shouldEscalate: boolean;
    requiresManualReview: boolean;
    reasons: OcrRoutingQualityReason[];
    answerCount: number;
    ocrConfidence: number;
    criticalFieldConfidence: number;
}

export const shouldPreferOcrQualityCandidate = (
    candidate: OcrRoutingQualityAssessment,
    current: OcrRoutingQualityAssessment,
): boolean => {
    // 정밀 모델의 false-negative 문서 판정이 유효한 PSI 후보를 덮어쓰지 못하게 한다.
    // 양쪽 모두 비-PSI이면 아래 품질 비교만 수행하므로 실제 오문서가 자동 승인되지는 않는다.
    if (candidate.isVerifiedPsiForm !== current.isVerifiedPsiForm) {
        return candidate.isVerifiedPsiForm;
    }
    if (candidate.requiresManualReview !== current.requiresManualReview) {
        return !candidate.requiresManualReview;
    }
    if (candidate.reasons.length !== current.reasons.length) {
        return candidate.reasons.length < current.reasons.length;
    }
    if (candidate.answerCount !== current.answerCount) {
        return candidate.answerCount > current.answerCount;
    }
    if (candidate.criticalFieldConfidence !== current.criticalFieldConfidence) {
        return candidate.criticalFieldConfidence > current.criticalFieldConfidence;
    }
    return candidate.score > current.score;
};

const clampConfidence = (value: unknown): number => {
    return normalizeOcrConfidence(value) ?? 0;
};

const getNonEmptyAnswerCount = (value: unknown): number => {
    if (!Array.isArray(value)) return 0;
    return value.slice(0, 5).filter((answer) => {
        if (!answer || typeof answer !== 'object') return false;
        const row = answer as Record<string, unknown>;
        return [row.answerText, row.koreanTranslation, row.nativeTranslation]
            .some((item) => String(item || '').trim().length >= 2);
    }).length;
};

const normalizeCriticalValue = (value: unknown): string => String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s._/-]+/g, '');

const CRITICAL_VALUE_PLACEHOLDERS = new Set([
    '',
    '-',
    '없음',
    '미상',
    '미확인',
    '확인필요',
    '식별대기',
    '인식불가',
    'unknown',
    'n/a',
    'na',
]);

const JOB_FIELD_PLACEHOLDERS = new Set([
    ...CRITICAL_VALUE_PLACEHOLDERS,
    '기타',
    '미분류',
]);

const hasCriticalIdentityValues = (raw: Record<string, unknown>): boolean => {
    const name = normalizeCriticalValue(raw.name);
    const jobField = normalizeCriticalValue(raw.jobField);
    const date = normalizeCriticalValue(raw.date);
    const nationality = normalizeCriticalValue(raw.nationality);
    return !CRITICAL_VALUE_PLACEHOLDERS.has(name)
        && !JOB_FIELD_PLACEHOLDERS.has(jobField)
        && !CRITICAL_VALUE_PLACEHOLDERS.has(date)
        && !CRITICAL_VALUE_PLACEHOLDERS.has(nationality);
};

/**
 * 공급자가 스스로 반환한 confidence만 믿지 않고, PSI 핵심 필드와 Q1~Q5 커버리지를
 * 함께 점수화한다. 잘못된 문서는 비용 낭비를 막기 위해 정밀 모델로 승격하지 않는다.
 */
export const assessOcrRoutingQuality = (
    raw: Record<string, unknown>,
): OcrRoutingQualityAssessment => {
    const normalizedDocumentValidation = raw.ocrDocumentValidation
        && typeof raw.ocrDocumentValidation === 'object'
        ? raw.ocrDocumentValidation as Record<string, unknown>
        : {};
    // 문서 판정값 자체가 누락된 경우에도 자동확정하지 않는다.
    const declaredPsiForm = raw.isPsiForm === true || normalizedDocumentValidation.isPsiForm === true;
    const explicitlyRejected = raw.isPsiForm === false || normalizedDocumentValidation.isPsiForm === false;
    const documentEvidence = assessPsiDocumentEvidence(raw);
    const isPsiForm = declaredPsiForm && documentEvidence.isSufficient && !explicitlyRejected;
    const fieldConfidences = raw.fieldConfidences && typeof raw.fieldConfidences === 'object'
        ? raw.fieldConfidences as Record<string, unknown>
        : raw.ocrFieldConfidences && typeof raw.ocrFieldConfidences === 'object'
            ? raw.ocrFieldConfidences as Record<string, unknown>
            : {};
    const ocrConfidence = clampConfidence(raw.ocrConfidence);
    const criticalValues = [
        clampConfidence(fieldConfidences.name),
        clampConfidence(fieldConfidences.jobField),
        clampConfidence(fieldConfidences.date),
        clampConfidence(fieldConfidences.nationality),
        clampConfidence(fieldConfidences.handwrittenAnswers),
    ];
    const criticalFieldConfidence = Math.min(...criticalValues);
    const answerCount = getNonEmptyAnswerCount(raw.handwrittenAnswers);
    const answerCoverage = Math.min(1, answerCount / 5);
    const hasSourceText = [raw.fullText, raw.koreanTranslation]
        .some((item) => String(item || '').trim().length >= 3) || answerCount > 0;
    const hasCriticalValues = hasCriticalIdentityValues(raw);
    const score = Number((
        ocrConfidence * 0.50
        + criticalFieldConfidence * 0.30
        + answerCoverage * 0.20
    ).toFixed(4));

    const reasons: OcrRoutingQualityReason[] = [];
    if (explicitlyRejected || !declaredPsiForm) reasons.push('wrong-document');
    if (declaredPsiForm && !documentEvidence.isSufficient) reasons.push('insufficient-psi-markers');
    if (!hasSourceText) reasons.push('missing-source-text');
    if (!hasCriticalValues) reasons.push('missing-critical-value');
    if (ocrConfidence < OCR_AUTO_ACCEPTANCE_THRESHOLD) reasons.push('low-ocr-confidence');
    if (criticalFieldConfidence < OCR_CRITICAL_FIELD_THRESHOLD) reasons.push('low-critical-field-confidence');
    if (answerCount < OCR_MIN_ANSWER_COUNT) reasons.push('incomplete-q1-q5');

    // 가중 평균이 개별 핵심필드/Q1~Q5 미달을 상쇄해서는 안 된다.
    const requiresManualReview = reasons.length > 0 || score < OCR_AUTO_ACCEPTANCE_THRESHOLD;
    return {
        isVerifiedPsiForm: isPsiForm,
        score,
        shouldEscalate: requiresManualReview && (
            isPsiForm
            || documentEvidence.isSufficient
            || (declaredPsiForm && (documentEvidence.hasPsiTitleEvidence || documentEvidence.questionCount >= 3))
        ),
        requiresManualReview,
        reasons,
        answerCount,
        ocrConfidence,
        criticalFieldConfidence,
    };
};

export const getOcrQualityReviewMessage = (assessment: OcrRoutingQualityAssessment): string => {
    const labels: Record<OcrRoutingQualityReason, string> = {
        'wrong-document': 'PSI 양식 불일치',
        'insufficient-psi-markers': 'PSI 제목/양식번호 및 Q1~Q5 구조 증거 부족',
        'missing-source-text': '원문 텍스트 누락',
        'missing-critical-value': '이름·공종·날짜·국적 실제 값 누락',
        'low-ocr-confidence': '전체 판독 신뢰도 부족',
        'low-critical-field-confidence': '이름·공종·날짜·국적·필기 핵심 필드 신뢰도 부족',
        'incomplete-q1-q5': 'Q1~Q5 답변 추출 부족',
    };
    const detail = assessment.reasons.map((reason) => labels[reason]).join(', ');
    return `OCR 자동확정 보류(품질점수 ${Math.round(assessment.score * 100)}점): ${detail || '관리자 확인 필요'}`;
};
