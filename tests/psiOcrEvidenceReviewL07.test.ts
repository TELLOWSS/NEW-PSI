import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { HandwrittenAnswer } from '../types';
import { buildPsiOcrEvidenceReview, type PsiOcrEvidenceInput } from '../utils/psiOcrEvidenceReview';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const answer = (i: number, source: string, ko = '', native = ''): HandwrittenAnswer =>
    ({ questionNumber: String(i), answerText: source, koreanTranslation: ko, nativeTranslation: native });
const complete = Array.from({ length: 5 }, (_, i) => answer(i + 1, `original ${i + 1}`, `Korean ${i + 1}`, `native ${i + 1}`));
const fixture = (patch: Partial<PsiOcrEvidenceInput> = {}): PsiOcrEvidenceInput => ({
    hasOriginalImage: true,
    documentRejected: false,
    ocrConfidence: 0.96,
    ocrErrorType: null,
    answers: complete,
    hasUnsavedEdits: false,
    isForeignLanguage: true,
    ...patch,
});

describe('L07 OCR evidence boundary', () => {
    it('never calls an absent photo a verified original', () => {
        const result = buildPsiOcrEvidenceReview(fixture({ hasOriginalImage: false }));
        expect(result.attention).toBe('source');
        expect(result.headline).toContain('원본 이미지');
        expect(result.instruction).toContain('인식 문장만으로는');
    });

    it('puts document rejection ahead of OCR confidence and all answered fields', () => {
        const result = buildPsiOcrEvidenceReview(fixture({
            documentRejected: true, ocrConfidence: 0.25, hasOriginalImage: false,
        }));
        expect(result.attention).toBe('document');
        expect(result.instruction).toContain('자동 문서 판정');
    });

    it('warns about low confidence and OCR errors without forcing an unnecessary retake', () => {
        for (const patch of [{ ocrConfidence: 0.69 }, { ocrConfidence: 0.96, ocrErrorType: 'HANDWRITING' }]) {
            const result = buildPsiOcrEvidenceReview(fixture(patch));
            expect(result.attention).toBe('ocr');
            expect(result.instruction).toContain('재촬영이 반드시 필요한 것은 아니');
        }
        expect(buildPsiOcrEvidenceReview(fixture({ ocrConfidence: 0.7 })).attention).toBe('compare');
    });

    it('counts Q1-Q5 originals separately from interpretation-only entries', () => {
        const answers = [answer(1, '', '해석 단독'), answer(2, '위험 상황', ''), answer(3, '위험도', '상')];
        const result = buildPsiOcrEvidenceReview(fixture({ answers, isForeignLanguage: false }));
        expect(result.originalCount).toBe(2);
        expect(result.translatedCount).toBe(2);
        expect(result.attention).toBe('questions');
        expect(result.answersLabel).toContain('2/5');
        expect(result.instruction).toContain('AI 해석만으로');
    });

    it('distinguishes missing native translation from Korean and original, not claim fluent delivery', () => {
        const answers = complete.map((item, i) => (i === 1 ? { ...item, nativeTranslation: '' } : item));
        const result = buildPsiOcrEvidenceReview(fixture({ answers }));
        expect(result.originalCount).toBe(5);
        expect(result.nativeTranslatedCount).toBe(4);
        expect(result.attention).toBe('translation');
        expect(result.translationLabel).toContain('자연스러움 미검증');
        expect(buildPsiOcrEvidenceReview(fixture({ answers, isForeignLanguage: false })).attention).toBe('compare');
    });

    it('marks unsaved edits separately from approval, even if all fields are present', () => {
        const result = buildPsiOcrEvidenceReview(fixture({ hasUnsavedEdits: true }));
        expect(result.attention).toBe('unsaved');
        expect(result.editsLabel).toContain('아직 저장되지 않음');
        expect(buildPsiOcrEvidenceReview(fixture()).editsLabel).toContain('승인 별개');
    });

    it('does not turn missing/invalid confidence into a trusted percentage', () => {
        for (const value of [undefined, -1, 2, NaN]) {
            const result = buildPsiOcrEvidenceReview(fixture({ ocrConfidence: value }));
            expect(result.confidenceLabel).toContain('미산정');
        }
    });

    it('does not mutate the source record and never independently saves or approves', () => {
        const frozen = complete.map((item) => Object.freeze({ ...item }));
        const original = JSON.stringify(frozen);
        buildPsiOcrEvidenceReview(fixture({ answers: frozen }));
        expect(JSON.stringify(frozen)).toBe(original);
        const logic = read('utils/psiOcrEvidenceReview.ts');
        const panel = read('components/ocr/PsiOcrEvidenceReviewPanel.tsx');
        const modal = read('components/modals/RecordDetailModal.tsx');
        expect(logic).toContain('buildFiveQuestionReviewItems(answers)');
        expect(panel).toContain('OCR 인식 문장은 원본 사진 자체가 아닙니다');
        expect(panel).toContain('canInspectOriginal &&');
        expect(modal).toContain('<PsiOcrEvidenceReviewPanel');
        expect(modal).toContain('data-psi-original-document="true"');
        expect(modal).toContain('source?.scrollIntoView');
        expect(modal).toContain('getPsiQuestionLabel(ans.questionNumber)');
        expect(logic).not.toMatch(/fetch\s*\(|setInterval\s*\(|localStorage|sessionStorage|indexedDB/i);
        expect(panel).not.toMatch(/fetch\s*\(|setInterval\s*\(|localStorage|sessionStorage|indexedDB/i);
    });
});
