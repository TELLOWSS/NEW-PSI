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
    '고위험 작업군(동바리, 비계, 고소작업, 타워크레인, 중량물 인양, 굴착)은 보수적으로 해석합니다.',
    '추락, 개구부, 비계, 안전대, 작업반경, 신호수, 장선, 멍에 등 핵심 키워드 누락 여부를 반드시 확인합니다.',
    `현재 정책 버전은 ${DEFAULT_HARNESS_POLICY.version}이며 OCR 최소 신뢰도 기준은 ${Math.round(DEFAULT_HARNESS_POLICY.minOcrConfidence * 100)}%입니다.`,
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
