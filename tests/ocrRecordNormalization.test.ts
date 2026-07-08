import { describe, expect, it } from 'vitest';
import { normalizeOcrRecordMetadata } from '../utils/ocrRecordNormalization';

describe('OCR record metadata normalization', () => {
    it('does not infer jobField from Q1 handwritten answer context', () => {
        const result = normalizeOcrRecordMetadata({
            name: '김근로',
            jobField: '기타',
            date: '2026.06.30',
            fullText: 'Q1 이번 작업에서 가장 위험한 작업은 무엇입니까? 형틀 작업 위험 Q2 추락',
            koreanTranslation: 'Q1 형틀 작업 위험',
            handwrittenAnswers: [
                { questionNumber: '1', answerText: '형틀 작업 위험', koreanTranslation: '형틀 작업 위험' },
                { questionNumber: '2', answerText: '추락', koreanTranslation: '추락' },
            ],
        });

        expect(result.record.jobField).toBe('미분류');
        expect(result.changes.some((change) => change.field === 'jobField' && change.after === '형틀')).toBe(false);
    });

    it('quarantines a Q1-like sentence when it is returned as jobField', () => {
        const result = normalizeOcrRecordMetadata({
            name: '김근로',
            jobField: '철근 조립 작업 중 낙하 위험',
            date: '2026.06.30',
            fullText: '현장 등록 한글이름 김근로 Q1 철근 조립 작업 중 낙하 위험',
            koreanTranslation: '철근 조립 작업 중 낙하 위험',
            handwrittenAnswers: [
                { questionNumber: '1', answerText: '철근 조립 작업 중 낙하 위험', koreanTranslation: '철근 조립 작업 중 낙하 위험' },
            ],
        });

        expect(result.record.jobField).toBe('미분류');
        expect(result.changes).toContainEqual({
            field: 'jobField',
            before: '철근 조립 작업 중 낙하 위험',
            after: '미분류',
            reason: '문항 답변으로 보이는 공종값 격리',
        });
    });

    it('still normalizes explicit job field labels', () => {
        const result = normalizeOcrRecordMetadata({
            name: '김근로',
            jobField: '형틀공',
            date: '2026.06.30',
            fullText: '공종 형틀공 현장 등록 한글이름 김근로',
            koreanTranslation: '공종 형틀공',
            handwrittenAnswers: [],
        });

        expect(result.record.jobField).toBe('형틀');
    });

    it('keeps legacy generic job labels compatible', () => {
        const result = normalizeOcrRecordMetadata({
            name: '김근로',
            jobField: '일반공종',
            date: '2026.06.30',
            fullText: '공종 일반공종 현장 등록 한글이름 김근로',
            koreanTranslation: '공종 일반공종',
            handwrittenAnswers: [],
        });

        expect(result.record.jobField).toBe('기타');
    });

    it('normalizes OCR date strings written as YY/DD/MM or DD.MM.YYYY', () => {
        const yyDayMonth = normalizeOcrRecordMetadata({
            name: 'date-test',
            jobField: '철근',
            date: '26/29/06',
            fullText: '',
            koreanTranslation: '',
            handwrittenAnswers: [],
        });
        const dayMonthYear = normalizeOcrRecordMetadata({
            name: 'date-test',
            jobField: '형틀',
            date: '29.1.2026',
            fullText: '',
            koreanTranslation: '',
            handwrittenAnswers: [],
        });

        expect(yyDayMonth.record.date).toBe('2026-06-29');
        expect(dayMonthYear.record.date).toBe('2026-01-29');
    });
});
