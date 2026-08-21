import { describe, expect, it } from 'vitest';
import {
    assessOcrRoutingQuality,
    OCR_AUTO_ACCEPTANCE_THRESHOLD,
    shouldPreferOcrQualityCandidate,
} from '../utils/ocrRoutingQuality';

const completeAnswers = Array.from({ length: 5 }, (_, index) => ({
    questionNumber: String(index + 1),
    answerText: `답변 ${index + 1}`,
    koreanTranslation: `답변 ${index + 1}`,
}));
const psiMarkers = ['NEW-PSI', '위험성평가', '공종', '현장 등록 한글이름', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5'];

describe('OCR cost/quality routing gate', () => {
    it('accepts a complete high-confidence PSI result without an expensive retry', () => {
        const result = assessOcrRoutingQuality({
            isPsiForm: true,
            documentMarkers: psiMarkers,
            name: '김현장',
            jobField: '철근',
            date: '2026-08-22',
            nationality: '대한민국',
            ocrConfidence: 0.94,
            fieldConfidences: { name: 0.93, jobField: 0.91, date: 0.92, nationality: 0.94, handwrittenAnswers: 0.92 },
            handwrittenAnswers: completeAnswers,
            fullText: 'PSI 위험성평가 Q1 Q2 Q3 Q4 Q5',
        });

        expect(result.score).toBeGreaterThanOrEqual(OCR_AUTO_ACCEPTANCE_THRESHOLD);
        expect(result.shouldEscalate).toBe(false);
        expect(result.requiresManualReview).toBe(false);
    });

    it('escalates missing confidence instead of assuming 0.9', () => {
        const result = assessOcrRoutingQuality({
            isPsiForm: true,
            documentMarkers: psiMarkers,
            name: '김현장',
            jobField: '철근',
            date: '2026-08-22',
            nationality: '대한민국',
            handwrittenAnswers: completeAnswers,
            fullText: 'PSI 위험성평가 Q1 Q2 Q3 Q4 Q5',
        });

        expect(result.ocrConfidence).toBe(0);
        expect(result.shouldEscalate).toBe(true);
        expect(result.requiresManualReview).toBe(true);
    });

    it('escalates incomplete Q1-Q5 and low critical fields', () => {
        const result = assessOcrRoutingQuality({
            isPsiForm: true,
            name: '김현장',
            jobField: '철근',
            date: '2026-08-22',
            nationality: '대한민국',
            ocrConfidence: 0.92,
            fieldConfidences: { name: 0.9, jobField: 0.61, date: 0.9, nationality: 0.9, handwrittenAnswers: 0.7 },
            handwrittenAnswers: completeAnswers.slice(0, 3),
            fullText: '일부 답변만 추출됨',
        });

        expect(result.shouldEscalate).toBe(true);
        expect(result.reasons).toContain('low-critical-field-confidence');
        expect(result.reasons).toContain('incomplete-q1-q5');
    });

    it('does not spend a precision call on a confirmed wrong document', () => {
        const result = assessOcrRoutingQuality({
            isPsiForm: false,
            ocrConfidence: 0.2,
            handwrittenAnswers: [],
        });

        expect(result.shouldEscalate).toBe(false);
        expect(result.requiresManualReview).toBe(true);
        expect(result.reasons).toContain('wrong-document');
    });

    it('fails closed when the provider omits the PSI document flag', () => {
        const result = assessOcrRoutingQuality({
            documentMarkers: psiMarkers,
            name: '김현장',
            jobField: '철근',
            date: '2026-08-22',
            nationality: '대한민국',
            ocrConfidence: 0.99,
            fieldConfidences: { name: 0.99, jobField: 0.99, date: 0.99, nationality: 0.99, handwrittenAnswers: 0.99 },
            handwrittenAnswers: completeAnswers,
            fullText: 'PSI로 보이지만 문서 판정 필드가 누락된 응답',
        });

        expect(result.shouldEscalate).toBe(true);
        expect(result.requiresManualReview).toBe(true);
        expect(result.reasons).toContain('wrong-document');
    });

    it('accepts the normalized WorkerRecord document validation shape', () => {
        const result = assessOcrRoutingQuality({
            ocrDocumentValidation: { isPsiForm: true, documentType: 'psi-risk-assessment', detectedMarkers: psiMarkers },
            name: '김현장',
            jobField: '철근',
            date: '2026-08-22',
            nationality: '대한민국',
            ocrConfidence: 0.94,
            ocrFieldConfidences: { name: 0.93, jobField: 0.91, date: 0.92, nationality: 0.94, handwrittenAnswers: 0.92 },
            handwrittenAnswers: completeAnswers,
            fullText: '정규화 이후 WorkerRecord의 PSI 원문',
        });

        expect(result.requiresManualReview).toBe(false);
        expect(result.reasons).not.toContain('wrong-document');
    });

    it('does not let a high weighted average hide one low critical field', () => {
        const result = assessOcrRoutingQuality({
            isPsiForm: true,
            name: '김현장',
            jobField: '철근',
            date: '2026-08-22',
            nationality: '대한민국',
            ocrConfidence: 1,
            fieldConfidences: { name: 1, jobField: 1, date: 1, nationality: 0.8, handwrittenAnswers: 1 },
            handwrittenAnswers: completeAnswers,
            fullText: '전체 신뢰도는 높지만 국적 판독이 기준 미달인 문서',
        });

        expect(result.score).toBeGreaterThan(OCR_AUTO_ACCEPTANCE_THRESHOLD);
        expect(result.requiresManualReview).toBe(true);
        expect(result.shouldEscalate).toBe(true);
    });

    it('does not let high confidence hide incomplete Q1-Q5 answers', () => {
        const result = assessOcrRoutingQuality({
            isPsiForm: true,
            name: '김현장',
            jobField: '철근',
            date: '2026-08-22',
            nationality: '대한민국',
            ocrConfidence: 1,
            fieldConfidences: { name: 1, jobField: 1, date: 1, nationality: 1, handwrittenAnswers: 1 },
            handwrittenAnswers: completeAnswers.slice(0, 3),
            fullText: 'Q1~Q3만 추출된 문서',
        });

        expect(result.score).toBeGreaterThan(OCR_AUTO_ACCEPTANCE_THRESHOLD);
        expect(result.requiresManualReview).toBe(true);
        expect(result.reasons).toContain('incomplete-q1-q5');
    });

    it('never auto-accepts blank or placeholder critical identity values', () => {
        const result = assessOcrRoutingQuality({
            isPsiForm: true,
            name: '',
            jobField: '미분류',
            date: '',
            nationality: '미상',
            ocrConfidence: 1,
            fieldConfidences: { name: 1, jobField: 1, date: 1, nationality: 1, handwrittenAnswers: 1 },
            handwrittenAnswers: completeAnswers,
            fullText: '모델 신뢰도만 높고 실제 신원 핵심값은 비어 있는 문서',
        });

        expect(result.score).toBe(1);
        expect(result.requiresManualReview).toBe(true);
        expect(result.shouldEscalate).toBe(true);
        expect(result.reasons).toContain('missing-critical-value');
    });

    it('requires deterministic PSI title and question evidence even when the model says true', () => {
        const result = assessOcrRoutingQuality({
            isPsiForm: true,
            name: '김현장',
            jobField: '철근',
            date: '2026-08-22',
            nationality: '대한민국',
            documentMarkers: [],
            ocrConfidence: 1,
            fieldConfidences: { name: 1, jobField: 1, date: 1, nationality: 1, handwrittenAnswers: 1 },
            handwrittenAnswers: completeAnswers,
            fullText: '제목과 양식번호를 확인할 수 없는 일반 답변지',
        });

        expect(result.requiresManualReview).toBe(true);
        expect(result.reasons).toContain('insufficient-psi-markers');
    });

    it('rechecks a cheap-model false negative when deterministic PSI evidence is strong', () => {
        const result = assessOcrRoutingQuality({
            isPsiForm: false,
            documentMarkers: ['NEW-PSI', '공종', '현장 등록 한글이름', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
            name: '김현장',
            jobField: '철근',
            date: '2026-08-22',
            nationality: '대한민국',
            ocrConfidence: 0.9,
            fieldConfidences: { name: 0.9, jobField: 0.9, date: 0.9, nationality: 0.9, handwrittenAnswers: 0.9 },
            handwrittenAnswers: completeAnswers,
            fullText: 'NEW-PSI 위험성평가 Q1 Q2 Q3 Q4 Q5',
        });

        expect(result.requiresManualReview).toBe(true);
        expect(result.shouldEscalate).toBe(true);
        expect(result.reasons).toContain('wrong-document');
    });

    it('prefers an auto-acceptable precision result over a higher numeric score with missing identity', () => {
        const highButUnsafe = assessOcrRoutingQuality({
            isPsiForm: true,
            documentMarkers: ['NEW-PSI', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
            name: '', jobField: '미분류', date: '', nationality: '미상',
            ocrConfidence: 1,
            fieldConfidences: { name: 1, jobField: 1, date: 1, nationality: 1, handwrittenAnswers: 1 },
            handwrittenAnswers: completeAnswers,
            fullText: 'NEW-PSI Q1 Q2 Q3 Q4 Q5',
        });
        const lowerButSafe = assessOcrRoutingQuality({
            isPsiForm: true,
            documentMarkers: ['NEW-PSI', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
            name: '김현장', jobField: '철근', date: '2026-08-22', nationality: '대한민국',
            ocrConfidence: 0.95,
            fieldConfidences: { name: 0.95, jobField: 0.95, date: 0.95, nationality: 0.95, handwrittenAnswers: 0.95 },
            handwrittenAnswers: completeAnswers,
            fullText: 'NEW-PSI Q1 Q2 Q3 Q4 Q5',
        });

        expect(highButUnsafe.score).toBeGreaterThan(lowerButSafe.score);
        expect(highButUnsafe.requiresManualReview).toBe(true);
        expect(lowerButSafe.requiresManualReview).toBe(false);
        expect(shouldPreferOcrQualityCandidate(lowerButSafe, highButUnsafe)).toBe(true);
    });

    it('keeps a structurally verified PSI candidate when the precision pass returns a false-negative document flag', () => {
        const verifiedPsiCandidate = assessOcrRoutingQuality({
            isPsiForm: true,
            documentMarkers: psiMarkers,
            name: '김현장',
            jobField: '철근',
            date: '2026-08-22',
            nationality: '대한민국',
            ocrConfidence: 0.83,
            fieldConfidences: { name: 0.81, jobField: 0.8, date: 0.84, nationality: 0.83, handwrittenAnswers: 0.81 },
            handwrittenAnswers: completeAnswers,
            fullText: 'NEW-PSI 위험성평가 Q1 Q2 Q3 Q4 Q5',
        });
        const precisionFalseNegative = assessOcrRoutingQuality({
            isPsiForm: false,
            documentMarkers: psiMarkers,
            name: '김현장',
            jobField: '철근',
            date: '2026-08-22',
            nationality: '대한민국',
            ocrConfidence: 0.99,
            fieldConfidences: { name: 0.99, jobField: 0.99, date: 0.99, nationality: 0.99, handwrittenAnswers: 0.99 },
            handwrittenAnswers: completeAnswers,
            fullText: 'NEW-PSI 위험성평가 Q1 Q2 Q3 Q4 Q5',
        });

        expect(verifiedPsiCandidate.isVerifiedPsiForm).toBe(true);
        expect(verifiedPsiCandidate.requiresManualReview).toBe(true);
        expect(precisionFalseNegative.isVerifiedPsiForm).toBe(false);
        expect(precisionFalseNegative.reasons).toContain('wrong-document');
        expect(shouldPreferOcrQualityCandidate(precisionFalseNegative, verifiedPsiCandidate)).toBe(false);
        expect(shouldPreferOcrQualityCandidate(verifiedPsiCandidate, precisionFalseNegative)).toBe(true);
    });

    it('keeps a real wrong document fail-closed after candidate ranking', () => {
        const wrongDocument = assessOcrRoutingQuality({
            isPsiForm: false,
            documentMarkers: [],
            ocrConfidence: 0.99,
            fieldConfidences: { name: 0.99, jobField: 0.99, date: 0.99, nationality: 0.99, handwrittenAnswers: 0.99 },
            handwrittenAnswers: [],
            fullText: '일반 안전 메모',
        });

        expect(wrongDocument.isVerifiedPsiForm).toBe(false);
        expect(wrongDocument.requiresManualReview).toBe(true);
        expect(wrongDocument.reasons).toContain('wrong-document');
    });
});
