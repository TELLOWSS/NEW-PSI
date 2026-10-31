import type { WorkerRecord } from '../types';

/** A transcription is evidence of what was written, not evidence of site compliance. */
export const INTERPRETATION_NOTE_VERSION = '2026-10-31-v1';

export interface InterpretationNoteRow {
    number: number;
    question: string;
    original: string;
    korean: string;
    sourceState: 'recorded' | 'missing';
    translationState: 'draft-needs-review' | 'missing';
}

export interface WorkerInterpretationNote {
    rows: InterpretationNoteRow[];
    sourceCount: number;
    translationCount: number;
    managerRecordApproved: boolean;
    reviewMessages: string[];
}

const QUESTIONS = [
    '가장 위험한 작업',
    '가장 큰 위험요소',
    '본인이 판단한 위험 정도와 이유',
    '내가 할 수 있는 예방조치',
    '오늘부터 실천할 안전행동',
] as const;

const toQuestionIndex = (value: string): number | null => {
    const matched = String(value ?? '').trim().match(/^(?:Q(?:UESTION)?[\s-]*)?([1-5])(?:[.)]\s*|$)/i);
    return matched ? Number(matched[1]) : null;
};

/**
 * Converts existing, stored OCR rows into a faithful bilingual note.
 * No translation is generated here. Never infer high/medium/low from adjectives.
 * Manager approval is NOT a native-language translation certification.
 */
export const buildWorkerInterpretationNote = (
    record: Pick<WorkerRecord, 'handwrittenAnswers' | 'reviewStatus' | 'approvalStatus'>,
): WorkerInterpretationNote => {
    const answers = Array.isArray(record.handwrittenAnswers) ? record.handwrittenAnswers : [];
    const rows: InterpretationNoteRow[] = QUESTIONS.map((question, index) => {
        const number = index + 1;
        const answer = answers.find(item => toQuestionIndex(item.questionNumber) === number);
        const original = String(answer?.answerText || '').trim();
        const korean = String(answer?.koreanTranslation || '').trim();
        return {
            number,
            question,
            original,
            korean,
            sourceState: original ? 'recorded' : 'missing',
            translationState: korean ? 'draft-needs-review' : 'missing',
        };
    });

    const sourceCount = rows.filter(row => row.sourceState === 'recorded').length;
    const translationCount = rows.filter(row => row.translationState !== 'missing').length;
    const managerRecordApproved = record.reviewStatus === 'APPROVED' || record.approvalStatus === 'APPROVED';
    const reviewMessages: string[] = [];

    if (sourceCount < 5) reviewMessages.push('원문이 누락된 문항은 원본 사진과 다시 대조해야 합니다.');
    if (translationCount < 5) reviewMessages.push('한국어 번역이 없는 문항은 관리자 확인 후 보완해야 합니다.');
    reviewMessages.push('번역은 원문과 대조할 검토용 텍스트입니다. 자연스러움·정확성은 별도 언어 검수가 필요합니다.');
    reviewMessages.push('Q3의 자필 표현은 근로자의 자기 인식이며 공식 위험등급 확정이나 안전점수의 근거가 아닙니다.');
    reviewMessages.push('Q4·Q5의 보호구·행동 약속은 실제 착용·조치 완료 증빙이 아닙니다.');

    return { rows, sourceCount, translationCount, managerRecordApproved, reviewMessages };
};
