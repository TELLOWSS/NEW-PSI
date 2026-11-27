import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import {
    applyOcrDocumentGate,
    getLowConfidenceOcrFields,
    normalizeOcrDocumentMetadata,
} from '../utils/ocrDocumentValidation';

const baseRecord = (): WorkerRecord => ({
    id: 'record-1',
    name: '테스트',
    jobField: '철근',
    date: '2026-07-17',
    nationality: '대한민국',
    language: 'ko',
    handwrittenAnswers: [],
    fullText: '',
    koreanTranslation: '',
    safetyScore: 80,
    safetyLevel: '고급',
    strengths: [],
    strengths_native: [],
    weakAreas: [],
    weakAreas_native: [],
    improvement: '',
    improvement_native: '',
    suggestions: [],
    suggestions_native: [],
    aiInsights: '',
    aiInsights_native: '',
    selfAssessedRiskLevel: '중',
});

describe('OCR document validation gate', () => {
    it('normalizes document and field confidence metadata', () => {
        const result = normalizeOcrDocumentMetadata({
            documentType: 'psi-risk-assessment',
            isPsiForm: true,
            documentValidationReason: 'Q1~Q5 확인',
            documentMarkers: ['NEW-PSI', '공종', '현장 등록 한글이름', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
            handwrittenAnswers: [1, 2, 3, 4, 5].map((questionNumber) => ({ questionNumber })),
            fieldConfidences: { name: 1.2, jobField: 0.65, date: 95 },
        });

        expect(result.validation.isPsiForm).toBe(true);
        expect(result.fieldConfidences.name).toBe(1);
        expect(result.fieldConfidences.jobField).toBe(0.65);
        expect(result.fieldConfidences.date).toBe(0.95);
    });

    it('blocks scoring and approval for a non-PSI document', () => {
        const record = baseRecord();
        record.ocrDocumentValidation = {
            documentType: 'other-safety-document',
            isPsiForm: false,
            reason: '문항 구조 없음',
            detectedMarkers: [],
        };
        const gated = applyOcrDocumentGate(record);

        expect(gated.safetyScore).toBe(0);
        expect(gated.ocrFailureCode).toBe('FORMAT');
        expect(gated.approvalState).toBe('REQUIRED');
        expect(gated.riskDecision).toBe('IMMEDIATE_ATTENTION');
    });

    it('fails closed when model-declared PSI lacks title and Q1-Q5 evidence', () => {
        const result = normalizeOcrDocumentMetadata({
            documentType: 'psi-risk-assessment',
            isPsiForm: true,
            documentMarkers: [],
            fullText: '일반 메모 문서',
        });

        expect(result.validation.isPsiForm).toBe(false);
        expect(result.validation.reason).toContain('증거가 충분하지 않습니다');
    });

    it('accepts handwritten legacy Form 1 (1안) without NEW-PSI code or Q1-Q5 labels', () => {
        const result = normalizeOcrDocumentMetadata({
            documentType: 'psi-risk-assessment',
            isPsiForm: true,
            documentValidationReason: '기존 수기 위험성평가 기록지 확인',
            documentMarkers: [],
            handwrittenAnswers: [
                { questionNumber: '1', answerText: '거푸집 해체 작업', koreanTranslation: '거푸집 해체 작업' },
                { questionNumber: '2', answerText: '개구부 주변 추락 위험', koreanTranslation: '개구부 주변 추락 위험' },
                { questionNumber: '4', answerText: '안전대 고리 체결 후 작업', koreanTranslation: '안전대 고리 체결 후 작업' },
            ],
            fullText: '근로자 위험성평가 기록지 성명 홍길동 공종 형틀 작업내용 거푸집 해체 유해위험요인 추락 감소대책 안전대 체결 서명 완료',
        });

        expect(result.validation.isPsiForm).toBe(true);
        expect(result.validation.formVariant).toBe('form-1-legacy');
        expect(result.validation.detectedMarkers).toContain('위험성평가(1안)');
    });

    it('rejects generic safety memo even if handwritten text exists without risk-assessment structure', () => {
        const result = normalizeOcrDocumentMetadata({
            documentType: 'psi-risk-assessment',
            isPsiForm: true,
            documentMarkers: ['식당 영수증'],
            handwrittenAnswers: [
                { questionNumber: '1', answerText: '김밥 2줄', koreanTranslation: '김밥 2줄' },
            ],
            fullText: '영수증 합계 12,000원 부가세 포함',
        });

        expect(result.validation.isPsiForm).toBe(false);
    });

    it('accepts multilingual or slightly cropped legacy Form 1 (1안) tables while still rejecting generic memos', () => {
        const multilingualForm1 = normalizeOcrDocumentMetadata({
            documentType: 'psi-risk-assessment',
            isPsiForm: true,
            documentMarkers: [],
            handwrittenAnswers: [
                { questionNumber: '1', answerText: '支模架拆除', koreanTranslation: '거푸집 해체', nativeTranslation: '支模架拆除' },
                { questionNumber: '2', answerText: '高处坠落风险', koreanTranslation: '추락 위험', nativeTranslation: '高处坠落风险' },
            ],
            fullText: '每日危险性评价表 姓名 王磊 工种 형틀 作业内容 거푸집 해체 유해위험요인 추락 감소대책 안전대 체결 서명',
        });
        expect(multilingualForm1.validation.isPsiForm).toBe(true);
        expect(multilingualForm1.validation.formVariant).toBe('form-1-legacy');

        const croppedTitleForm1 = normalizeOcrDocumentMetadata({
            documentType: 'psi-risk-assessment',
            isPsiForm: true,
            documentMarkers: [],
            handwrittenAnswers: [
                { questionNumber: '1', answerText: '슬래브 철근 배근', koreanTranslation: '슬래브 철근 배근' },
                { questionNumber: '2', answerText: '단부 추락 위험', koreanTranslation: '단부 추락 위험' },
                { questionNumber: '4', answerText: '안전난간 설치 및 안전대 체결', koreanTranslation: '안전난간 설치 및 안전대 체결' },
            ],
            fullText: '성명 이철근 공종 철근 작업내용 슬래브 철근 배근 유해위험요인 단부 추락 위험등급 중 감소대책 안전난간 설치 서명 완료',
        });
        expect(croppedTitleForm1.validation.isPsiForm).toBe(true);
        expect(croppedTitleForm1.validation.formVariant).toBe('form-1-legacy');
    });

    it('returns only fields below the review threshold', () => {
        const lowFields = getLowConfidenceOcrFields({ name: 0.92, jobField: 0.55, date: 0.79 });
        expect(lowFields.map((item) => item.field)).toEqual(['jobField', 'date']);
    });
});
