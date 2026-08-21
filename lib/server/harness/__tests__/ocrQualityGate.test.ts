import { describe, expect, it } from 'vitest';
import { validateHarnessInput } from '../inputValidators';
import { buildHarnessDecision } from '../router';

const longPsiText = '위험성평가 작업 내용과 위험요인 및 감소대책을 작업자가 직접 작성했습니다. '.repeat(4);

describe('harness OCR quality gate', () => {
    it('keeps a field-level OCR quality failure in manual review even when overall confidence is high', () => {
        const validation = validateHarnessInput({
            recordId: 'ocr-quality-review',
            documentText: longPsiText,
            ocrConfidence: 0.97,
            ocrQualityScore: 0.71,
            ocrQualityReasons: ['low-critical-field-confidence'],
            requiresManualReview: true,
        });

        expect(validation.ok).toBe(false);
        expect(validation.issues).toContainEqual(expect.objectContaining({
            code: 'OCR_QUALITY_GATE_REVIEW',
            severity: 'critical',
        }));

        const decision = buildHarnessDecision({
            validation,
            evaluation: {
                evidenceSufficiency: 0.95,
                requiresHumanApproval: false,
                flags: [],
            },
            decision: 'SAFE_TO_PROCEED',
            overrides: [],
        });

        expect(decision.workflowState).toBe('manual_review_required');
        expect(decision.approvalState).toBe('PENDING');
        expect(decision.secondPassStatus).toBe('NEEDED');
        expect(decision.requiresManagerApproval).toBe(true);
    });

    it('does not add the OCR quality issue to a passing payload', () => {
        const validation = validateHarnessInput({
            recordId: 'ocr-quality-pass',
            documentText: longPsiText,
            ocrConfidence: 0.94,
            ocrQualityScore: 0.91,
            requiresManualReview: false,
        });

        expect(validation.issues.some((issue) => issue.code === 'OCR_QUALITY_GATE_REVIEW')).toBe(false);
    });
});
