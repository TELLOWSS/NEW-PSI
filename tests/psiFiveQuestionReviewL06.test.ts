import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { HandwrittenAnswer } from '../types';
import { PSI_FORM_MASTER_VERSION, PSI_FORM_QUESTIONS } from '../config/psiFormMaster';
import { buildFiveQuestionReviewItems } from '../utils/psiFiveQuestionReview';

const answer = (questionNumber: string, answerText: string, koreanTranslation = '', nativeTranslation = ''): HandwrittenAnswer => ({
    questionNumber, answerText, koreanTranslation, nativeTranslation,
});
const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Living UI L06 Q1–Q5 original-preserving review', () => {
    it('uses the existing single master, all five questions in order', () => {
        const items = buildFiveQuestionReviewItems([]);
        expect(items.map(({ key }) => key)).toEqual(PSI_FORM_QUESTIONS.map((q) => q.key));
        expect(items).toHaveLength(5);
        expect(items.every((x) => x.state === 'missing' && x.sourceIndex === null)).toBe(true);
        expect(PSI_FORM_MASTER_VERSION).toBe('psi-form-master-2026-11-22-v2-legacy-compatible');
        expect(items[0].intent).toContain('가장 위험한 세부작업');
        expect(items[4].intent).toContain('내가 실제로 지킬 행동');
    });
    it('recognizes Q-prefixed and numbered raw records without sorting or mutating', () => {
        const answers = [answer('Q3','상: 추락 위험','상: 추락 위험'), answer('1','갱폼 인상','갱폼 인상'), answer('Q5','안전고리 체결')];
        const snapshot = JSON.stringify(answers);
        const items = buildFiveQuestionReviewItems(answers);
        expect(items[0]).toMatchObject({ key:'Q1',sourceIndex:1,state:'comparison-ready'});
        expect(items[1]).toMatchObject({ key:'Q2',sourceIndex:null,state:'missing'});
        expect(items[2]).toMatchObject({ key:'Q3',sourceIndex:0,state:'comparison-ready'});
        expect(items[4]).toMatchObject({ key:'Q5',sourceIndex:2,state:'source-only'});
        expect(JSON.stringify(answers)).toBe(snapshot);
    });
    it('does not turn Korean translation alone into a verified handwritten original', () => {
        const items = buildFiveQuestionReviewItems([answer('Q1','','번역 문장')]);
        expect(items[0].state).toBe('translation-only');
        expect(items[0].stateLabel).toContain('자필 원문');
    });
    it('supports legacy unnumbered records only when the question slot is unambiguous', () => {
        const items = buildFiveQuestionReviewItems([answer('','작업 A'), answer('','위험 B')]);
        expect(items[0]).toMatchObject({sourceIndex:0,state:'source-only'});
        expect(items[1]).toMatchObject({sourceIndex:1,state:'source-only'});
        expect(items[2].sourceIndex).toBeNull();
        expect(buildFiveQuestionReviewItems([answer('Q5','원문')])[0].state).toBe('missing');
    });
    it('does not conflate native translation with original or manager approval', () => {
        const items = buildFiveQuestionReviewItems([answer('Q1','원문','','작업자용 해석')]);
        expect(items[0].state).toBe('source-only');
        expect(items[0].hasNativeTranslation).toBe(true);
    });
    it('shows navigable read-only progress linked to the original editor, not a new submission channel', () => {
        const comp = source('components/assessment/PsiFiveQuestionReviewNavigator.tsx');
        const modal = source('components/modals/RecordDetailModal.tsx');
        const logic = source('utils/psiFiveQuestionReview.ts');
        expect(modal).toContain('<PsiFiveQuestionReviewNavigator');
        expect(modal).toContain('answers={record.handwrittenAnswers}');
        expect(modal).toContain('data-psi-question-original={idx}');
        expect(modal).toContain('getPsiQuestionLabel(ans.questionNumber)');
        expect(modal).toContain("handleAnswerChange(idx, 'answerText', e.target.value)");
        expect(comp).toContain('onFocusAnswer(step.sourceIndex)');
        expect(comp).toContain('문항 확인 상태는 저장·관리자 승인 또는 위험 해소를 뜻하지 않습니다');
        expect(comp).toContain('모국어 번역 검수를 대신하지 않습니다');
        expect(logic).not.toMatch(/fetch\s*\(|setInterval\s*\(|localStorage|sessionStorage|indexedDB/i);
        expect(comp).not.toMatch(/fetch\s*\(|setInterval\s*\(|localStorage|sessionStorage|indexedDB/i);
    });
});
