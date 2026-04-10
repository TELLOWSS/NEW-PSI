import type { HarnessPolicySnapshot } from './workflowTypes.js';

export const DEFAULT_HARNESS_POLICY: HarnessPolicySnapshot = {
    version: 'psi-harness-policy-2026-04-10',
    minTextLength: 24,
    minOcrConfidence: 0.85,
    criticalOcrConfidence: 0.65,
    highRiskJobTypes: [
        '거푸집 동바리',
        '동바리',
        '시스템 비계',
        '이동식 비계',
        '고소작업',
        '개구부 작업',
        '타워크레인',
        '중량물 인양',
        '굴착',
        '흙막이',
        '데크플레이트',
        '갱폼',
    ],
};

export const HIGH_RISK_KEYWORD_GROUPS = {
    fall: ['추락', '개구부', '안전대', '안전고리', '안전난간', '구명줄', '작업발판'],
    scaffold: ['비계', '이동식 비계', '아웃트리거', '작업대 탑승'],
    crane: ['타워크레인', '작업반경', '신호수', '유도자', '중량물', '인양'],
    shoring: ['동바리', '장선', '멍에', '수평연결재', '깔판', '깔목'],
    weather: ['강풍', '폭우', '강우', '침하'],
};

export const PROMPT_VERSION = 'psi-harness-prompt-2026-04-10';

export function getDefaultHarnessPolicy(): HarnessPolicySnapshot {
    return DEFAULT_HARNESS_POLICY;
}
