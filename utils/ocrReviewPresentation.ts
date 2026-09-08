import type { WorkerRecord } from '../types';

/** Legacy QUALITY is also used for extracted documents awaiting field/translation review. */
export const isOcrReviewOnlyRecord = (record: Partial<WorkerRecord>): boolean => {
    if (record.ocrErrorType !== 'QUALITY') return false;
    if (record.ocrFailureCode && record.ocrFailureCode !== 'UNKNOWN') return false;
    const hasText = Boolean(String(record.fullText || record.koreanTranslation || '').trim())
        || (record.handwrittenAnswers || []).some(answer => Boolean(String(answer.answerText || '').trim()));
    return hasText && (
        record.workflowState === 'manual_review_required'
        || (record.auditTrail || []).some(entry => entry.actor === 'ocr-quality-gate')
    );
};

export const getOcrReviewGuide = (record: Partial<WorkerRecord>): string => {
    const detail = String(record.ocrErrorMessage || '').trim();
    return `문서 내용은 추출되었습니다. 이름·공종·날짜와 문항별 번역을 원본과 대조해 주세요.${detail ? ` 확인 근거: ${detail}` : ''} 이 상태만으로 빛반사·흔들림을 확정하거나 재촬영할 필요는 없습니다.`;
};
