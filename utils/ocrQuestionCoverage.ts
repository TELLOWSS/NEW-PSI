/**
 * Five-question handwritten OCR coverage shared by the server, fallback OCR,
 * admin diagnostics and the routing quality gate.
 *
 * Only the worker's visible answerText is evidence of a filled-in response.
 * Translations are separate derived data; they cannot complete a missing source.
 * Q3 may legitimately contain just 상/중/하 (or Chinese 高/中/低).
 */
export type PsiOcrAnswerLike = {
    questionNumber?: unknown;
    answerText?: unknown;
    koreanTranslation?: unknown;
    nativeTranslation?: unknown;
};

const QUESTION_ORDER = [1, 2, 3, 4, 5] as const;
const ONE_CHARACTER_RISK_GRADES = new Set(['상', '중', '하', '高', '中', '低']);

const parseQuestionNumber = (raw: unknown, index: number): number | null => {
    const label = String(raw ?? '').trim().normalize('NFKC');
    if (!label) return index >= 0 && index < 5 ? index + 1 : null;
    const match = label.match(/^(?:Q\s*)?([1-5])$/i);
    return match ? Number(match[1]) : null;
};

export const getPsiWrittenAnswerCoverage = (answers: unknown): {
    presentQuestions: number[];
    missingQuestions: number[];
    answerCount: number;
} => {
    const present = new Set<number>();
    if (Array.isArray(answers)) {
        answers.slice(0, 12).forEach((raw, index) => {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
            const answer = raw as PsiOcrAnswerLike;
            const number = parseQuestionNumber(answer.questionNumber, index);
            if (!number) return;
            const source = String(answer.answerText ?? '').normalize('NFKC').trim();
            if (source.length >= 2 || (number === 3 && ONE_CHARACTER_RISK_GRADES.has(source))) {
                present.add(number);
            }
        });
    }
    const presentQuestions = QUESTION_ORDER.filter((n) => present.has(n));
    const missingQuestions = QUESTION_ORDER.filter((n) => !present.has(n));
    return { presentQuestions, missingQuestions, answerCount: presentQuestions.length };
};
