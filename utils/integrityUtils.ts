/**
 * Integrity Score Calculator
 * 
 * Evaluates worker consistency between their written safety commitments
 * and their past violation history.
 */

export interface ViolationRecord {
    type: string;
    date: string;
    description?: string;
}

export interface IntegrityResult {
    score: number; // 0-100 scale
    isSuspicious: boolean;
    warning: string;
    details: string[];
}

/**
 * Calculates integrity score by comparing handwriting text against past violations
 * 
 * @param handwritingText - Today's safety commitment text
 * @param pastViolationHistory - Array of past violation records
 * @returns IntegrityResult with score and warning
 */
export function calculateIntegrityScore(
    handwritingText: string,
    pastViolationHistory: ViolationRecord[]
): IntegrityResult {
    let score = 100; // Start with perfect score
    const details: string[] = [];
    let isSuspicious = false;
    let warning = '';

    // Normalize text for comparison
    const normalizedText = handwritingText.toLowerCase().trim();

    // Check for safety harness commitment vs. fall-related violations
    if (normalizedText.includes('안전고리') || normalizedText.includes('안전대')) {
        const fallViolations = pastViolationHistory.filter(v => 
            v.type.includes('추락') || 
            v.type.includes('안전대 미착용') ||
            v.type.includes('안전고리') ||
            v.description?.includes('추락') ||
            v.description?.includes('안전대')
        );

        if (fallViolations.length > 0) {
            // Major penalty for writing about safety harness with past fall violations
            const penalty = Math.min(40, fallViolations.length * 15);
            score -= penalty;
            isSuspicious = true;
            details.push(`'안전고리' 언급했으나 과거 추락 위험 관련 위반 ${fallViolations.length}건 발견`);
            details.push(`신뢰도 감소: -${penalty}점`);
        }
    }

    // Check for helmet commitment vs. helmet violations
    if (normalizedText.includes('안전모') || normalizedText.includes('헬멧')) {
        const helmetViolations = pastViolationHistory.filter(v => 
            v.type.includes('안전모') || 
            v.type.includes('헬멧') ||
            v.description?.includes('안전모') ||
            v.description?.includes('헬멧')
        );

        if (helmetViolations.length > 0) {
            const penalty = Math.min(30, helmetViolations.length * 12);
            score -= penalty;
            isSuspicious = true;
            details.push(`'안전모' 언급했으나 과거 안전모 관련 위반 ${helmetViolations.length}건 발견`);
            details.push(`신뢰도 감소: -${penalty}점`);
        }
    }

    // Check for general safety awareness vs. repeated violations
    if (normalizedText.includes('안전') || normalizedText.includes('준수') || normalizedText.includes('지키겠')) {
        if (pastViolationHistory.length >= 5) {
            const penalty = Math.min(25, (pastViolationHistory.length - 4) * 5);
            score -= penalty;
            isSuspicious = true;
            details.push(`과거 위반 이력이 ${pastViolationHistory.length}건으로 많음`);
            details.push(`신뢰도 감소: -${penalty}점`);
        }
    }

    // Check for protective equipment commitment vs. PPE violations
    if (normalizedText.includes('보호구') || normalizedText.includes('장비')) {
        const ppeViolations = pastViolationHistory.filter(v => 
            v.type.includes('보호구') || 
            v.type.includes('PPE') ||
            v.type.includes('장비') ||
            v.description?.includes('보호구') ||
            v.description?.includes('장비')
        );

        if (ppeViolations.length > 0) {
            const penalty = Math.min(30, ppeViolations.length * 10);
            score -= penalty;
            isSuspicious = true;
            details.push(`'보호구' 언급했으나 과거 보호구 관련 위반 ${ppeViolations.length}건 발견`);
            details.push(`신뢰도 감소: -${penalty}점`);
        }
    }

    // Ensure score stays within 0-100 range
    score = Math.max(0, Math.min(100, score));

    // Generate warning message
    if (isSuspicious) {
        if (score < 40) {
            warning = '⚠️ 심각: 거짓 작성 의심 - 과거 위반 이력과 현재 다짐 간 심각한 불일치 발견';
        } else if (score < 60) {
            warning = '⚠️ 주의: 언행불일치 가능성 - 작성 내용과 과거 행동이 일치하지 않음';
        } else if (score < 80) {
            warning = '⚠️ 경고: 일관성 부족 - 과거 위반 이력 존재, 주의 깊은 모니터링 필요';
        } else {
            warning = '주의: 경미한 불일치 발견';
        }
    } else {
        if (pastViolationHistory.length === 0) {
            warning = '✅ 우수: 위반 이력 없음, 안전 다짐 일관성 확인';
        } else {
            warning = '✅ 양호: 특별한 불일치 사항 없음';
        }
    }

    return {
        score,
        isSuspicious,
        warning,
        details
    };
}

/**
 * Formats the integrity result for display
 */
export function formatIntegrityResult(result: IntegrityResult): string {
    let output = `언행일치 점수: ${result.score}/100\n`;
    output += `상태: ${result.warning}\n`;
    
    if (result.details.length > 0) {
        output += '\n상세 분석:\n';
        result.details.forEach(detail => {
            output += `  - ${detail}\n`;
        });
    }

    return output;
}
