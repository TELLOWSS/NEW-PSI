import { PSI_FORM_QUESTIONS, type PsiQuestionKey } from '../config/psiFormMaster';

/**
 * L06 self-written trial worksheet. No worker identity, authentication,
 * server receipt, persistent draft, OCR score or safety approval is stored.
 */
export type WorkerRiskDraftAnswers = Record<PsiQuestionKey, string>;
export type WorkerRiskDraftGrade = '' | '상' | '중' | '하';
export type WorkerRiskDraftState = {
    answers: WorkerRiskDraftAnswers;
    grade: WorkerRiskDraftGrade;
    gradeReason: string;
};

export const emptyWorkerRiskDraft = (): WorkerRiskDraftState => ({
    answers: { Q1: '', Q2: '', Q3: '', Q4: '', Q5: '' },
    grade: '',
    gradeReason: '',
});

export const checkWorkerRiskDraft = (draft: WorkerRiskDraftState) => {
    const missing = PSI_FORM_QUESTIONS.filter(question => {
        if (question.key === 'Q3') return !['상', '중', '하'].includes(draft.grade);
        return String(draft.answers[question.key] || '').trim().length < 2;
    }).map(question => question.key);
    return {
        completedCount: PSI_FORM_QUESTIONS.length - missing.length,
        missing,
        readyForReview: missing.length === 0,
        // A completed trial worksheet is NEVER a recorded worker submission.
        submitted: false as const,
        approved: false as const,
        serverReceived: false as const,
    };
};

export const printableWorkerRiskDraft = (draft: WorkerRiskDraftState): Array<{key: PsiQuestionKey;title: string;answer: string}> =>
    PSI_FORM_QUESTIONS.map(question => ({
        key: question.key,
        title: question.workerIntent,
        answer: question.key === 'Q3'
            ? [draft.grade, draft.gradeReason.trim()].filter(Boolean).join(' · ')
            : String(draft.answers[question.key] || '').trim(),
    }));
