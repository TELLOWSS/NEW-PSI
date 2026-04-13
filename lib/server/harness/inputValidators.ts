import { DEFAULT_HARNESS_POLICY, HIGH_RISK_KEYWORD_GROUPS } from './policyRegistry.js';
import type { HarnessAnalyzeRequest, HarnessInputValidationResult, HarnessValidationIssue } from './workflowTypes.js';

const ALL_HIGH_RISK_KEYWORDS = Object.values(HIGH_RISK_KEYWORD_GROUPS).flat();

function calculateSpecialCharacterRatio(input: string): number {
    if (!input) return 1;
    const specialChars = (input.match(/[^\p{L}\p{N}\s.,()/%-]/gu) || []).length;
    return specialChars / input.length;
}

function buildIssue(code: string, message: string, severity: HarnessValidationIssue['severity']): HarnessValidationIssue {
    return { code, message, severity };
}

export function validateHarnessInput(payload: HarnessAnalyzeRequest): HarnessInputValidationResult {
    const normalizedText = String(payload.documentText || '').replace(/\s+/g, ' ').trim();
    const textLength = normalizedText.length;
    const specialCharacterRatio = calculateSpecialCharacterRatio(normalizedText);
    const issues: HarnessValidationIssue[] = [];

    if (textLength < DEFAULT_HARNESS_POLICY.minTextLength) {
        issues.push(buildIssue('INPUT_TEXT_TOO_SHORT', 'OCR 추출 텍스트가 너무 짧아 안전 판단 근거가 부족합니다.', 'high'));
    }

    if (specialCharacterRatio > 0.35) {
        issues.push(buildIssue('INPUT_TEXT_LOW_SIGNAL', '특수문자 비율이 높아 OCR 품질이 낮을 수 있습니다.', 'warning'));
    }

    const ocrConfidence = typeof payload.ocrConfidence === 'number' ? payload.ocrConfidence : null;
    if (ocrConfidence !== null && ocrConfidence < DEFAULT_HARNESS_POLICY.criticalOcrConfidence) {
        issues.push(buildIssue('OCR_CONFIDENCE_CRITICAL', 'OCR 신뢰도가 치명적으로 낮아 수동 검토가 필요합니다.', 'critical'));
    } else if (ocrConfidence !== null && ocrConfidence < DEFAULT_HARNESS_POLICY.minOcrConfidence) {
        issues.push(buildIssue('OCR_CONFIDENCE_LOW', 'OCR 신뢰도가 기준 미만입니다.', 'high'));
    }

    const imageQualityScore = typeof payload.imageQualityScore === 'number' ? payload.imageQualityScore : null;
    if (imageQualityScore !== null && imageQualityScore < 0.6) {
        issues.push(buildIssue('IMAGE_QUALITY_LOW', '이미지 품질 점수가 낮아 원문 재확인이 필요합니다.', 'warning'));
    }

    const detectedKeywords = ALL_HIGH_RISK_KEYWORDS.filter((keyword) => normalizedText.includes(keyword));

    // 키워드가 전혀 없으면서 텍스트가 짧으면 → 경고
    // 키워드가 있어도 텍스트 분량이 너무 부족하면 → 별도 경고
    if (detectedKeywords.length === 0 && textLength < 120) {
        issues.push(buildIssue(
            'HIGH_RISK_CONTEXT_MISSING',
            '고위험 작업 판단에 필요한 핵심 키워드가 충분하지 않습니다. 문서 재확인이 필요합니다.',
            'warning',
        ));
    }

    if (detectedKeywords.length > 0 && textLength < DEFAULT_HARNESS_POLICY.minTextLength * 2) {
        issues.push(buildIssue(
            'HIGH_RISK_EVIDENCE_THIN',
            '고위험 키워드가 감지됐으나 판단 근거 텍스트 분량이 충분하지 않습니다.',
            'warning',
        ));
    }

    return {
        ok: !issues.some((issue) => issue.severity === 'critical' || issue.severity === 'high'),
        normalizedText,
        textLength,
        specialCharacterRatio,
        detectedKeywords,
        issues,
    };
}
