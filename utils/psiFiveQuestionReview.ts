import { PSI_FORM_QUESTIONS, type PsiQuestionKey } from '../config/psiFormMaster';
import type { HandwrittenAnswer } from '../types';

export type FiveQuestionReviewState = 'missing' | 'source-only' | 'translation-only' | 'comparison-ready';

export interface FiveQuestionReviewItem {
    key: PsiQuestionKey;
    number: string;
    title: string;
    intent: string;
    sourceIndex: number | null;
    state: FiveQuestionReviewState;
    stateLabel: string;
    hasNativeTranslation: boolean;
}

// A READ-ONLY review navigation model. It never reconstructs missing OCR
// answers, changes their order, substitutes Q1 for the jobField, or writes data.
export const buildFiveQuestionReviewItems = (
    answers: readonly HandwrittenAnswer[] | null | undefined,
): FiveQuestionReviewItem[] => {
    const provided = Array.isArray(answers) ? answers : [];
    return PSI_FORM_QUESTIONS.map((question) => {
        const numbered = provided.findIndex((answer) => {
            const raw = String(answer?.questionNumber || '').trim().toUpperCase();
            return raw === question.questionNumber || raw === question.key;
        });
        // Historical OCR records may contain unnumbered answers in original
        // Q1–Q5 order. Do not infer a number for an explicitly *different* Q.
        const pos = Number(question.questionNumber) - 1;
        const indexed = numbered < 0 && pos < provided.length
            && !String(provided[pos]?.questionNumber || '').trim()
            ? pos : -1;
        const sourceIndex = numbered >= 0 ? numbered : indexed >= 0 ? indexed : null;
        const answer = sourceIndex === null ? undefined : provided[sourceIndex];
        const source = Boolean(String(answer?.answerText || '').trim());
        const translation = Boolean(String(answer?.koreanTranslation || '').trim());
        const state: FiveQuestionReviewState = source && translation
            ? 'comparison-ready'
            : source ? 'source-only'
            : translation ? 'translation-only'
            : 'missing';

        const stateLabel = state === 'comparison-ready'
            ? '원문·해석 확보'
            : state === 'source-only' ? '한국어 해석 확인 필요'
            : state === 'translation-only' ? '자필 원문 확인 필요'
            : '답변 미확인';

        return {
            key: question.key,
            number: question.questionNumber,
            title: question.title,
            intent: question.workerIntent,
            sourceIndex,
            state,
            stateLabel,
            hasNativeTranslation: Boolean(String(answer?.nativeTranslation || '').trim()),
        };
    });
};
