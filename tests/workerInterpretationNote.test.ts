import { describe, expect, it } from 'vitest';
import { buildWorkerInterpretationNote } from '../utils/workerInterpretationNote';
import type { HandwrittenAnswer, WorkerRecord } from '../types';

const example = (answers: HandwrittenAnswer[], approved = false) => ({
    handwrittenAnswers: answers,
    reviewStatus: approved ? 'APPROVED' as const : 'PENDING' as const,
    approvalStatus: 'PENDING' as const,
}) satisfies Pick<WorkerRecord, 'handwrittenAnswers' | 'reviewStatus' | 'approvalStatus'>;

describe('worker interpretation note: preserve source vs interpretation', () => {
    it('keeps all five Chinese source answers and stored Korean translations without inventing a grade', () => {
        const note = buildWorkerInterpretationNote(example([
            { questionNumber: '1', answerText: '高处作业', koreanTranslation: '고소작업' },
            { questionNumber: 'Q2', answerText: '坠落、夹伤、碰撞', koreanTranslation: '추락, 끼임, 부딪힘' },
            { questionNumber: 'QUESTION 3', answerText: '非常危险，越高越危险', koreanTranslation: '매우 위험합니다. 높을수록 더 위험합니다.' },
            { questionNumber: '4.', answerText: '佩戴安全带、佩戴安全帽、使用防护用具', koreanTranslation: '안전대와 안전모를 착용하고 보호구를 사용합니다.' },
            { questionNumber: 'Q5', answerText: '确认护具、工作顺序、安全进行工作', koreanTranslation: '보호구와 작업순서를 확인하고 안전하게 작업합니다.' },
        ]));
        expect(note.sourceCount).toBe(5);
        expect(note.translationCount).toBe(5);
        expect(note.rows[2].original).toBe('非常危险，越高越危险');
        expect(note.rows[2].korean).toContain('높을수록');
        expect(note.managerRecordApproved).toBe(false);
        expect(note.reviewMessages.join(' ')).toContain('공식 위험등급');
    });

    it('requires verification when source/translation is absent instead of filling blanks', () => {
        const note = buildWorkerInterpretationNote(example([
            { questionNumber: 'Q1', answerText: '高处作业', koreanTranslation: '' },
            { questionNumber: 'Q2', answerText: '', koreanTranslation: '위험요소' },
        ]));
        expect(note.sourceCount).toBe(1);
        expect(note.translationCount).toBe(1);
        expect(note.rows[0].korean).toBe('');
        expect(note.rows[1].original).toBe('');
        expect(note.rows[4].sourceState).toBe('missing');
        expect(note.reviewMessages.join(' ')).toContain('원본 사진');
    });

    it('does not describe manager approval as native-speaker translation certification', () => {
        const note = buildWorkerInterpretationNote(example([], true));
        expect(note.managerRecordApproved).toBe(true);
        expect(note.reviewMessages.join(' ')).toContain('별도 언어 검수');
    });
});
