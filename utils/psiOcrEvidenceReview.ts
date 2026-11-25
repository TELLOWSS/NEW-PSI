import type { HandwrittenAnswer } from '../types';
import { buildFiveQuestionReviewItems } from './psiFiveQuestionReview';

export interface PsiOcrEvidenceInput {
    hasOriginalImage: boolean;
    documentRejected: boolean;
    ocrConfidence?: number | null;
    ocrErrorType?: string | null;
    answers?: readonly HandwrittenAnswer[] | null;
    hasUnsavedEdits: boolean;
    isForeignLanguage: boolean;
}

export type PsiOcrEvidenceAttention = 'source' | 'document' | 'ocr' | 'questions' | 'translation' | 'unsaved' | 'compare';
export interface PsiOcrEvidenceReview {
    attention: PsiOcrEvidenceAttention;
    headline: string;
    instruction: string;
    sourceLabel: string;
    confidenceLabel: string;
    answersLabel: string;
    translationLabel: string;
    editsLabel: string;
    originalCount: number;
    translatedCount: number;
    nativeTranslatedCount: number;
}

/**
 * This is a presentation-only checklist derived from existing in-memory fields.
 * The OCR transcript is NOT the source photo, a populated field is NOT verified,
 * and a completed checklist is NOT an approval or permission to resume work.
 */
export const buildPsiOcrEvidenceReview = ({
    hasOriginalImage,
    documentRejected,
    ocrConfidence,
    ocrErrorType,
    answers,
    hasUnsavedEdits,
    isForeignLanguage,
}: PsiOcrEvidenceInput): PsiOcrEvidenceReview => {
    const questions = buildFiveQuestionReviewItems(answers);
    const originalCount = questions.filter((step) => step.state === 'source-only' || step.state === 'comparison-ready').length;
    const translatedCount = questions.filter((step) => step.state === 'translation-only' || step.state === 'comparison-ready').length;
    const nativeTranslatedCount = questions.filter((step) => step.hasNativeTranslation).length;

    const normalizedConfidence = typeof ocrConfidence === 'number'
        && Number.isFinite(ocrConfidence)
        && ocrConfidence >= 0
        && ocrConfidence <= 1
        ? ocrConfidence
        : null;
    const lowConfidence = Boolean(ocrErrorType) || (normalizedConfidence !== null && normalizedConfidence < 0.7);

    let attention: PsiOcrEvidenceAttention = 'compare';
    let headline = '원본 이미지와 인식 문장을 직접 대조해 주세요';
    let instruction = '모든 문항이 입력되어 있어도 실제 근로자가 쓴 내용과 의미가 일치하는지는 관리자 확인이 필요합니다.';

    if (documentRejected) {
        attention = 'document';
        headline = '문서 종류부터 확인이 필요합니다';
        instruction = '자동 문서 판정에서 위험성평가 서식이 아닌 것으로 표시되었습니다. 원본 종류를 먼저 확인한 뒤 수정을 진행해 주세요.';
    } else if (!hasOriginalImage) {
        attention = 'source';
        headline = '원본 이미지 연결을 먼저 확인해 주세요';
        instruction = '인식 문장만으로는 자필 원본과 일치하는지 검증할 수 없습니다. 원래 기록지 이미지 또는 별도 원본 보관 위치를 확인해 주세요.';
    } else if (lowConfidence) {
        attention = 'ocr';
        headline = 'OCR 인식 불확실 항목을 먼저 확인해 주세요';
        instruction = '낮은 인식 신뢰 신호 또는 OCR 오류가 있습니다. 재촬영이 반드시 필요한 것은 아니며, 원본을 읽을 수 있는지 먼저 대조해 주세요.';
    } else if (originalCount < 5) {
        attention = 'questions';
        headline = `자필 인식 문장 ${5 - originalCount}개 문항 확인 필요`;
        instruction = 'Q1~Q5 중 비어 있는 문항을 원본에서 찾아 확인해 주세요. AI 해석만으로 누락된 자필 내용을 채웠다고 판단하면 안 됩니다.';
    } else if (translatedCount < originalCount || (isForeignLanguage && nativeTranslatedCount < originalCount)) {
        attention = 'translation';
        headline = '한국어·모국어 해석을 원본과 비교해 주세요';
        instruction = '원문이 확보된 문항에 비해 해석이 부족합니다. 모국어 전달용 번역은 현장 통역 또는 관리자의 별도 검수가 필요합니다.';
    } else if (hasUnsavedEdits) {
        attention = 'unsaved';
        headline = '수정사항이 아직 저장되지 않았습니다';
        instruction = '화면의 수정은 원본 이미지와 별도입니다. 수정 근거를 확인하고 기존 저장 절차로 저장한 후 최종 승인 여부를 판단해 주세요.';
    }

    const confidenceLabel = normalizedConfidence !== null
        ? `인식 참고값 ${Math.round(normalizedConfidence * 100)}%${lowConfidence ? ' · 원본 재대조' : ''}`
        : '인식 신뢰도 미산정 · 원본 확인 필요';

    return {
        attention,
        headline,
        instruction,
        sourceLabel: hasOriginalImage ? '원본 이미지 연결됨 · 육안 확인 필요' : '원본 이미지 미연결',
        confidenceLabel,
        answersLabel: `인식 문장 ${originalCount}/5 · 한국어 해석 ${translatedCount}/5`,
        translationLabel: isForeignLanguage
            ? `모국어 해석 입력 ${nativeTranslatedCount}/5 · 자연스러움 미검증`
            : '모국어 추가 해석 대상 아님',
        editsLabel: hasUnsavedEdits ? '수정 중 · 아직 저장되지 않음' : '현재 화면의 미저장 변경 없음 · 승인 별개',
        originalCount,
        translatedCount,
        nativeTranslatedCount,
    };
};
