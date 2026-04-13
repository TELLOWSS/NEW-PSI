import { DEFAULT_HARNESS_POLICY, PROMPT_VERSION } from './policyRegistry.js';
import { buildDynamicContextPromptLines } from './contextProviders/dynamicContext.js';
import type { HarnessAnalyzeRequest, HarnessContextSnapshot, HarnessPromptLayerSnapshot } from './workflowTypes.js';

const SYSTEM_INSTRUCTION_LINES = [
    '산업안전보건법 및 현장 안전 기준을 우선 적용합니다.',
    '지정된 구조 외 자유 형식 출력은 허용하지 않습니다.',
    '근거 없는 추정, 의료/법률 최종 판단, 과도한 일반화를 금지합니다.',
    '고위험 판단은 룰 엔진 및 인간 승인 게이트를 통과해야 합니다.',
];

const STATIC_KNOWLEDGE_LINES = [
    'KOSHA 계열 기본 안전 수칙과 사내 보호구 기준을 우선 참조합니다.',
    '고위험 작업군(동바리, 비계, 고소작업, 타워크레인, 중량물 인양, 굴착·흙막이, 개구부, 갱폼·데크플레이트)은 보수적으로 해석합니다.',
    '추락·개구부: 안전덮개·안전망·추락방지망 등 차단 조치 언급이 없으면 CRITICAL_STOP 대상입니다.',
    '비계: 난간·아웃트리거·작업발판 설치 여부, 안전대 체결 여부를 확인합니다.',
    '타워크레인·인양: 작업반경 통제·신호수·줄걸이·와이어로프 언급이 없으면 IMMEDIATE_ATTENTION 대상입니다.',
    '굴착·흙막이: 버팀대·띠장·어스앙카 등 토압 지지 근거가 없으면 CRITICAL_STOP 대상입니다.',
    '강풍(10m/s↑) + 인양 또는 고소작업 = 즉시 CRITICAL_STOP. 강우 + 굴착 = IMMEDIATE_ATTENTION.',
    `현재 정책 버전 ${DEFAULT_HARNESS_POLICY.version} / OCR 최소 신뢰도 ${Math.round(DEFAULT_HARNESS_POLICY.minOcrConfidence * 100)}% / 최소 텍스트 분량 ${DEFAULT_HARNESS_POLICY.minTextLength}자`,
];

export function buildHarnessPromptSnapshot(
    payload: HarnessAnalyzeRequest,
    context: HarnessContextSnapshot,
): HarnessPromptLayerSnapshot {
    const dynamicContext = buildDynamicContextPromptLines(payload, context);
    const assembledPrompt = [
        '[System Instructions]',
        ...SYSTEM_INSTRUCTION_LINES.map((line) => `- ${line}`),
        '',
        '[Static Knowledge]',
        ...STATIC_KNOWLEDGE_LINES.map((line) => `- ${line}`),
        '',
        '[Dynamic Context]',
        ...(dynamicContext.length > 0 ? dynamicContext.map((line) => `- ${line}`) : ['- 동적 컨텍스트 없음']),
    ].join('\n');

    return {
        version: PROMPT_VERSION,
        systemInstruction: SYSTEM_INSTRUCTION_LINES,
        staticKnowledge: STATIC_KNOWLEDGE_LINES,
        dynamicContext,
        assembledPrompt,
    };
}
