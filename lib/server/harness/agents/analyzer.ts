import type { HarnessAnalyzeRequest, HarnessAnalyzerOutput, HarnessContextSnapshot } from '../workflowTypes.js';

export function buildDeterministicAnalyzerOutput(payload: HarnessAnalyzeRequest, context: HarnessContextSnapshot): HarnessAnalyzerOutput {
    const text = String(payload.documentText || '');
    const extractedHazards = [
        ...(text.includes('추락') || text.includes('개구부') ? ['추락 위험'] : []),
        ...(text.includes('비계') ? ['비계 작업 위험'] : []),
        ...(text.includes('타워크레인') || text.includes('인양') ? ['인양 작업 위험'] : []),
        ...(text.includes('동바리') ? ['동바리/가설 구조 위험'] : []),
    ];

    const recommendedActions = [
        ...(extractedHazards.includes('추락 위험') ? ['추락 방호구 체결 및 개구부 통제 재확인'] : []),
        ...(extractedHazards.includes('비계 작업 위험') ? ['비계 난간·아웃트리거·작업발판 설치 여부 재확인'] : []),
        ...(extractedHazards.includes('인양 작업 위험') ? ['작업반경 통제 인원 및 신호수 배치 확인'] : []),
        ...(extractedHazards.includes('동바리/가설 구조 위험') ? ['동바리 수평연결재·깔판·강우 후 침하 여부 재확인'] : []),
    ];

    if (context.weather.windSpeedMps && context.weather.windSpeedMps >= 10) {
        recommendedActions.push('강풍 조건이므로 고소·인양 작업은 즉시 재검토');
    }

    return {
        summary: extractedHazards.length > 0
            ? `고위험 신호 ${extractedHazards.length}건이 감지되어 보호 조치 확인이 필요합니다.`
            : '명시적 고위험 키워드는 제한적이지만 추가 근거 확인이 필요할 수 있습니다.',
        extractedHazards,
        recommendedActions,
        confidence: payload.ocrConfidence ?? 0.7,
    };
}
