/**
 * Integrity Utilities
 * Functions for analyzing the integrity of worker handwriting assessments
 * by comparing handwritten text against past violation history.
 */

export interface ViolationRecord {
    type: 'fall' | 'struck_by' | 'electrocution' | 'caught_in' | 'other';
    date: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
}

export interface IntegrityResult {
    score: number; // 0-100, where 100 is perfect integrity
    warning: string | null;
    inconsistencies: string[];
    confidence: number; // 0-1 range
}

/**
 * Calculates the integrity score of handwritten text against past violation history.
 * Detects inconsistencies like writing about safety equipment they never violated,
 * or claiming awareness of risks they've been cited for.
 * 
 * @param handwritingText - The text written by the worker
 * @param pastViolationHistory - Array of past violations
 * @returns IntegrityResult with score, warning, and inconsistencies
 */
export function calculateIntegrityScore(
    handwritingText: string,
    pastViolationHistory: ViolationRecord[]
): IntegrityResult {
    const inconsistencies: string[] = [];
    let score = 100;
    let confidence = 0.8; // Default confidence

    if (!handwritingText || handwritingText.trim().length === 0) {
        return {
            score: 0,
            warning: 'No handwriting text provided',
            inconsistencies: ['빈 텍스트 - 분석 불가'],
            confidence: 0
        };
    }

    if (!pastViolationHistory || pastViolationHistory.length === 0) {
        return {
            score: 100,
            warning: null,
            inconsistencies: [],
            confidence: 1.0
        };
    }

    const text = handwritingText.toLowerCase();
    
    // Define keywords for different safety topics
    const safetyKeywords = {
        fall: ['추락', '낙하', '안전고리', '안전대', '안전난간', '개구부', 'fall', 'harness', 'safety belt'],
        struck_by: ['협착', '충돌', '낙하물', '비래', '보호구', 'struck', 'collision', 'falling object'],
        electrocution: ['감전', '전기', '누전', '접지', 'electric', 'shock', 'ground'],
        caught_in: ['끼임', '말림', '협착', 'caught', 'pinch', 'entangle']
    };

    // Check for inconsistencies
    pastViolationHistory.forEach(violation => {
        const violationType = violation.type;
        const keywords = safetyKeywords[violationType] || [];
        
        // Check if worker wrote about this safety topic
        const mentionedTopic = keywords.some(keyword => text.includes(keyword));
        
        if (mentionedTopic && violation.severity === 'high') {
            // Worker wrote about safety equipment/procedure they previously violated
            const message = `이전 ${getViolationTypeKorean(violationType)} 위반 이력 있음 (${violation.date})`;
            inconsistencies.push(message);
            score -= 15; // Deduct points for high severity violations
            confidence = 0.6; // Lower confidence
        } else if (mentionedTopic && violation.severity === 'medium') {
            score -= 8;
            confidence = 0.7;
        }
    });

    // Special case: Multiple fall-related violations but wrote about "안전고리"
    const fallViolations = pastViolationHistory.filter(v => v.type === 'fall');
    const mentionsFallSafety = safetyKeywords.fall.some(keyword => text.includes(keyword));
    
    if (fallViolations.length >= 2 && mentionsFallSafety) {
        inconsistencies.push('다수의 추락 위반 이력에도 안전고리 사용을 강조 - 거짓 기재 가능성');
        score -= 20;
        confidence = 0.5;
    }

    // Check for generic/template responses
    const genericPhrases = ['안전수칙 준수', '안전제일', '조심하겠습니다', 'i will be careful', 'safety first'];
    const genericCount = genericPhrases.filter(phrase => text.includes(phrase)).length;
    
    if (genericCount >= 2) {
        inconsistencies.push('일반적인 답변 - 구체성 부족');
        score -= 5;
    }

    // Ensure score is within bounds
    score = Math.max(0, Math.min(100, score));

    const warning = score < 70 
        ? '⚠️ 낮은 무결성 점수 - 거짓 기재 또는 형식적 작성 가능성' 
        : score < 85 
        ? '⚡ 주의 필요 - 일부 불일치 감지됨' 
        : null;

    return {
        score,
        warning,
        inconsistencies,
        confidence
    };
}

/**
 * Formats an IntegrityResult for display
 * @param result - IntegrityResult to format
 * @returns Formatted string for display
 */
export function formatIntegrityResult(result: IntegrityResult): string {
    const lines: string[] = [];
    
    lines.push(`무결성 점수: ${result.score}/100`);
    lines.push(`신뢰도: ${(result.confidence * 100).toFixed(0)}%`);
    
    if (result.warning) {
        lines.push(`\n${result.warning}`);
    }
    
    if (result.inconsistencies.length > 0) {
        lines.push('\n불일치 사항:');
        result.inconsistencies.forEach(inc => {
            lines.push(`  • ${inc}`);
        });
    }
    
    return lines.join('\n');
}

/**
 * Helper function to get Korean name for violation type
 */
function getViolationTypeKorean(type: ViolationRecord['type']): string {
    const typeMap: Record<ViolationRecord['type'], string> = {
        fall: '추락',
        struck_by: '충돌/협착',
        electrocution: '감전',
        caught_in: '끼임',
        other: '기타'
    };
    return typeMap[type] || '미분류';
}
