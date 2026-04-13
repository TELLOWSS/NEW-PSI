import type { HarnessAnalyzeRequest, HarnessAnalyzerOutput, HarnessContextSnapshot } from '../workflowTypes.js';

const HAZARD_PATTERNS: Array<{
    keywords: string[];
    label: string;
    action: string;
}> = [
    {
        keywords: ['추락', '개구부', '고소작업', '슬래브', '옥상', '외벽'],
        label: '추락·개구부 위험',
        action: '추락 방호구 착용·개구부 덮개·안전망 설치 여부 재확인',
    },
    {
        keywords: ['비계', '이동식 비계', '아웃트리거'],
        label: '비계 작업 위험',
        action: '비계 난간·아웃트리거·작업발판 설치 여부 재확인',
    },
    {
        keywords: ['타워크레인', '인양', '작업반경', '중량물'],
        label: '인양·크레인 작업 위험',
        action: '작업반경 통제 인원 및 신호수 배치, 준수 확인',
    },
    {
        keywords: ['동바리', '장선', '멍에', '수평연결재'],
        label: '동바리·가설 구조 위험',
        action: '동바리 수평연결재·깔판·강우 후 침하 여부 재확인',
    },
    {
        keywords: ['굴착', '흙막이', '토사', '사면'],
        label: '굴착·흙막이 위험',
        action: '버팀대·띄장·어스앙카 등 토압 지지 조치 확인',
    },
    {
        keywords: ['카덴뢰', '갔폼', '데크플레이트'],
        label: '가설구조물·특수공종 위험',
        action: '가설 구조물 입준 전 부재 확인 및 구조 개판도 찹0a확인',
    },
];

export function buildDeterministicAnalyzerOutput(payload: HarnessAnalyzeRequest, context: HarnessContextSnapshot): HarnessAnalyzerOutput {
    const text = String(payload.documentText || '');
    const lowerText = text.toLowerCase();

    const matchedHazards = HAZARD_PATTERNS.filter((h) =>
        h.keywords.some((kw) => lowerText.includes(kw) || text.includes(kw)),
    );

    const extractedHazards = matchedHazards.map((h) => h.label);
    const recommendedActions = matchedHazards.map((h) => h.action);

    const windSpeed = context.weather.windSpeedMps ?? 0;
    const precipitation = context.weather.rainfallMm ?? 0;

    if (windSpeed >= 10) {
        recommendedActions.push(`강풍 ${windSpeed}m/s 감지—고소·인양 작업을 즉시 재검토`);
        if (!extractedHazards.includes('인양·크레인 작업 위험')) {
            extractedHazards.push('강풍에 의한 고소 작업 위험');
        }
    }
    if (precipitation > 10) {
        recommendedActions.push(`우천 ${precipitation}mm 감지—굴착·동바리 침하 재확인`);
    }

    const hasHazard = extractedHazards.length > 0;
    const ocrConfidence = payload.ocrConfidence ?? 0.7;

    return {
        summary: hasHazard
            ? `고위험 신호 ${extractedHazards.length}건 감지(${extractedHazards.join(', ')})—보호 조치 확인이 필요합니다.`
            : 'OCR 문서내 명시적 고위험 키워드는 제한적이지만 고위험 공종 표시시 관리자 관감 필요합니다.',
        extractedHazards,
        recommendedActions,
        confidence: ocrConfidence,
    };
}
