/**
 * PSI Harness Engineering — Guardrail Rule Unit Tests
 * 대상: lib/server/harness/rules/ 하위 전체 룰 함수
 * 실행: npm run test
 */
import { describe, it, expect } from 'vitest';
import { evaluateFallProtectionRule } from '../fallProtectionRules.js';
import { evaluateOpeningRule } from '../openingRules.js';
import { evaluateScaffoldRule } from '../scaffoldRules.js';
import { evaluateCraneRule, evaluateCraneWeatherRule } from '../craneRules.js';
import { evaluateShoringRule, evaluateShoringWeatherRule } from '../shoringRules.js';
import { evaluateExcavationRule, evaluateExcavationRainRule } from '../excavationRules.js';
import { evaluateLiftingRule, evaluateLiftingWindRule } from '../liftingRules.js';
import type { HarnessContextSnapshot } from '../../workflowTypes.js';

// ─── 헬퍼 ────────────────────────────────────────────
function ctx(overrides: Partial<HarnessContextSnapshot['weather']> = {}): HarnessContextSnapshot {
    return {
        capturedAt: new Date().toISOString(),
        promptVersion: 'test',
        policyVersion: 'test',
        weather: {
            condition: null,
            windSpeedMps: null,
            rainfallMm: null,
            ...overrides,
        },
        workPlan: { taskName: null, concurrentHighRiskTasks: [] },
        sensorEvents: [],
    };
}

// ─── 1. 추락 방호 (FallProtection) ────────────────────
describe('evaluateFallProtectionRule', () => {
    it('추락 문맥 없으면 null 반환', () => {
        expect(evaluateFallProtectionRule('일반 도장 작업입니다.', 'SAFE_TO_PROCEED')).toBeNull();
    });

    it('추락 문맥 있고 안전대 없으면 CRITICAL_STOP', () => {
        const result = evaluateFallProtectionRule('개구부 작업 예정', 'SAFE_TO_PROCEED');
        expect(result?.ruleCode).toBe('FALL_PROTECTION_MISSING');
        expect(result?.overriddenDecision).toBe('CRITICAL_STOP');
    });

    it('추락 문맥 있어도 안전대 있으면 null', () => {
        expect(evaluateFallProtectionRule('개구부 작업 — 안전대 착용 확인 완료', 'SAFE_TO_PROCEED')).toBeNull();
    });
});

// ─── 2. 개구부·고소작업 (Opening) ─────────────────────
describe('evaluateOpeningRule', () => {
    it('개구부 키워드 없으면 null', () => {
        expect(evaluateOpeningRule('콘크리트 타설 작업', 'SAFE_TO_PROCEED')).toBeNull();
    });

    it('고소작업 감지 + 안전덮개 없으면 CRITICAL_STOP', () => {
        const result = evaluateOpeningRule('옥상 고소작업 진행 예정', 'SAFE_TO_PROCEED');
        expect(result?.ruleCode).toBe('OPENING_BARRIER_MISSING');
        expect(result?.overriddenDecision).toBe('CRITICAL_STOP');
    });

    it('이미 CRITICAL_STOP이면 null (중복 방지)', () => {
        expect(evaluateOpeningRule('고소작업 예정', 'CRITICAL_STOP')).toBeNull();
    });

    it('안전덮개 있으면 null', () => {
        expect(evaluateOpeningRule('고소작업 — 안전덮개 설치 완료', 'SAFE_TO_PROCEED')).toBeNull();
    });
});

// ─── 3. 비계 (Scaffold) ───────────────────────────────
describe('evaluateScaffoldRule', () => {
    it('비계 키워드 없으면 null', () => {
        expect(evaluateScaffoldRule('철근 배근 작업', 'SAFE_TO_PROCEED')).toBeNull();
    });

    it('이동식 비계 감지 + 아웃트리거 없으면 IMMEDIATE_ATTENTION', () => {
        const result = evaluateScaffoldRule('이동식 비계 설치 예정', 'SAFE_TO_PROCEED');
        expect(result?.ruleCode).toBe('SCAFFOLD_PROTECTION_MISSING');
        expect(result?.overriddenDecision).toBe('IMMEDIATE_ATTENTION');
    });

    it('아웃트리거 설치 언급 시 null', () => {
        expect(evaluateScaffoldRule('이동식 비계 — 아웃트리거 설치 확인', 'SAFE_TO_PROCEED')).toBeNull();
    });
});

// ─── 4. 크레인 (Crane) ───────────────────────────────
describe('evaluateCraneRule', () => {
    it('크레인 키워드 없으면 null', () => {
        expect(evaluateCraneRule('조적 작업 진행', 'SAFE_TO_PROCEED')).toBeNull();
    });

    it('타워크레인 감지 + 신호수 없으면 IMMEDIATE_ATTENTION', () => {
        const result = evaluateCraneRule('타워크레인 인양 작업 예정', 'SAFE_TO_PROCEED');
        expect(result?.ruleCode).toBe('CRANE_ACCESS_CONTROL_MISSING');
        expect(result?.overriddenDecision).toBe('IMMEDIATE_ATTENTION');
    });

    it('신호수 배치 언급 시 null', () => {
        expect(evaluateCraneRule('타워크레인 — 신호수 배치 완료', 'SAFE_TO_PROCEED')).toBeNull();
    });
});

describe('evaluateCraneWeatherRule', () => {
    it('풍속 10m/s 미만이면 null', () => {
        expect(evaluateCraneWeatherRule('타워크레인 작업', ctx({ windSpeedMps: 8 }), 'SAFE_TO_PROCEED')).toBeNull();
    });

    it('풍속 10m/s 이상 + 크레인 문맥이면 SUPPLEMENTARY_REVIEW', () => {
        const result = evaluateCraneWeatherRule('타워크레인 작업', ctx({ windSpeedMps: 12 }), 'SAFE_TO_PROCEED');
        expect(result?.ruleCode).toBe('HIGH_WIND_CONTEXT');
        expect(result?.overriddenDecision).toBe('SUPPLEMENTARY_REVIEW');
    });

    it('이미 SUPPLEMENTARY_REVIEW 이상이면 null', () => {
        expect(evaluateCraneWeatherRule('타워크레인 작업', ctx({ windSpeedMps: 15 }), 'IMMEDIATE_ATTENTION')).toBeNull();
    });
});

// ─── 5. 동바리 (Shoring) ─────────────────────────────
describe('evaluateShoringRule', () => {
    it('동바리 키워드 없으면 null', () => {
        expect(evaluateShoringRule('방수 작업 예정', 'SAFE_TO_PROCEED')).toBeNull();
    });

    it('동바리 감지 + 깔판 없으면 CRITICAL_STOP', () => {
        const result = evaluateShoringRule('동바리 조립 작업 예정', 'SAFE_TO_PROCEED');
        expect(result?.ruleCode).toBe('SHORING_SUPPORT_MISSING');
        expect(result?.overriddenDecision).toBe('CRITICAL_STOP');
    });

    it('깔판 언급 시 null', () => {
        expect(evaluateShoringRule('동바리 — 깔판 설치 확인 완료', 'SAFE_TO_PROCEED')).toBeNull();
    });

    it('이미 CRITICAL_STOP이면 null', () => {
        expect(evaluateShoringRule('동바리 조립 작업', 'CRITICAL_STOP')).toBeNull();
    });
});

describe('evaluateShoringWeatherRule', () => {
    it('동바리 키워드 없으면 null', () => {
        expect(evaluateShoringWeatherRule('방수 작업', ctx({ rainfallMm: 10 }), 'SAFE_TO_PROCEED')).toBeNull();
    });

    it('동바리 + 강우 문맥이면 SUPPLEMENTARY_REVIEW', () => {
        const result = evaluateShoringWeatherRule('동바리 장선 강우 침하 우려', ctx({ rainfallMm: 5 }), 'SAFE_TO_PROCEED');
        expect(result?.ruleCode).toBe('SHORING_WEATHER_RECHECK');
        expect(result?.overriddenDecision).toBe('SUPPLEMENTARY_REVIEW');
    });
});

// ─── 6. 굴착 (Excavation) ────────────────────────────
describe('evaluateExcavationRule', () => {
    it('굴착 키워드 없으면 null', () => {
        expect(evaluateExcavationRule('외벽 도장 작업', 'SAFE_TO_PROCEED')).toBeNull();
    });

    it('굴착 감지 + 버팀대 없으면 CRITICAL_STOP', () => {
        const result = evaluateExcavationRule('굴착 작업 및 흙막이 설치 예정', 'SAFE_TO_PROCEED');
        expect(result?.ruleCode).toBe('EXCAVATION_SUPPORT_MISSING');
        expect(result?.overriddenDecision).toBe('CRITICAL_STOP');
    });

    it('어스앙카 언급 시 null', () => {
        expect(evaluateExcavationRule('굴착 — 어스앙카 시공 계획 확인', 'SAFE_TO_PROCEED')).toBeNull();
    });
});

describe('evaluateExcavationRainRule', () => {
    it('굴착 + 강우량 없으면 null', () => {
        expect(evaluateExcavationRainRule('굴착 작업', ctx(), 'SAFE_TO_PROCEED')).toBeNull();
    });

    it('굴착 + rainfallMm > 0이면 IMMEDIATE_ATTENTION', () => {
        const result = evaluateExcavationRainRule('굴착 작업 예정', ctx({ rainfallMm: 3 }), 'SAFE_TO_PROCEED');
        expect(result?.ruleCode).toBe('EXCAVATION_RAIN_RISK');
        expect(result?.overriddenDecision).toBe('IMMEDIATE_ATTENTION');
    });

    it('굴착 + 강우 텍스트 키워드이면 IMMEDIATE_ATTENTION', () => {
        const result = evaluateExcavationRainRule('굴착 작업 — 폭우 예보', ctx(), 'SAFE_TO_PROCEED');
        expect(result?.ruleCode).toBe('EXCAVATION_RAIN_RISK');
    });
});

// ─── 7. 중량물 인양 (Lifting) ─────────────────────────
describe('evaluateLiftingRule', () => {
    it('인양 키워드 없으면 null', () => {
        expect(evaluateLiftingRule('내부 미장 작업', 'SAFE_TO_PROCEED')).toBeNull();
    });

    it('중량물 인양 감지 + 줄걸이 없으면 IMMEDIATE_ATTENTION', () => {
        const result = evaluateLiftingRule('중량물 인양 작업 예정', 'SAFE_TO_PROCEED');
        expect(result?.ruleCode).toBe('LIFTING_CONTROL_MISSING');
        expect(result?.overriddenDecision).toBe('IMMEDIATE_ATTENTION');
    });

    it('줄걸이 언급 시 null', () => {
        expect(evaluateLiftingRule('중량물 인양 — 줄걸이 점검 완료', 'SAFE_TO_PROCEED')).toBeNull();
    });
});

describe('evaluateLiftingWindRule', () => {
    it('풍속 10m/s 미만이면 null', () => {
        expect(evaluateLiftingWindRule('중량물 인양 작업', ctx({ windSpeedMps: 9 }), 'SAFE_TO_PROCEED')).toBeNull();
    });

    it('풍속 10m/s 이상 + 인양 문맥이면 CRITICAL_STOP', () => {
        const result = evaluateLiftingWindRule('중량물 인양 작업', ctx({ windSpeedMps: 12 }), 'SAFE_TO_PROCEED');
        expect(result?.ruleCode).toBe('LIFTING_HIGH_WIND');
        expect(result?.overriddenDecision).toBe('CRITICAL_STOP');
    });

    it('인양 키워드 없으면 null', () => {
        expect(evaluateLiftingWindRule('일반 작업', ctx({ windSpeedMps: 15 }), 'SAFE_TO_PROCEED')).toBeNull();
    });
});
