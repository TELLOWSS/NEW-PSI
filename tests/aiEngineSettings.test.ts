import { describe, expect, it } from 'vitest';
import {
    evaluateGeminiOcrCostGuard,
    estimateGeminiOcrCostUsd,
    GEMINI_OCR_MODEL_CATALOG,
    getOcrEngineLabel,
    resolveGeminiOcrModelChain,
} from '../utils/aiEngineSettings';

describe('AI engine routing', () => {
    it('routes clear bulk documents to the fast Gemini chain', () => {
        expect(resolveGeminiOcrModelChain('gemini-fast', { isPaidApiMode: true })).toEqual([
            'gemini-3.5-flash-lite',
            'gemini-2.5-flash',
        ]);
    });

    it('routes difficult documents to the precise model first', () => {
        expect(resolveGeminiOcrModelChain('gemini-precise', { isPaidApiMode: true })[0]).toBe('gemini-3.7-flash');
    });

    it('keeps automatic routing to at most one precision escalation', () => {
        expect(resolveGeminiOcrModelChain('auto', { isPaidApiMode: true })).toEqual([
            'gemini-3.5-flash-lite',
            'gemini-3.7-flash',
        ]);
    });

    it('never routes a free automatic request to the preview Pro model', () => {
        expect(resolveGeminiOcrModelChain('auto', { isPaidApiMode: false })).not.toContain('gemini-3.1-pro-preview');
    });

    it('estimates provider cost from actual token usage', () => {
        expect(estimateGeminiOcrCostUsd('gemini-3.5-flash-lite', {
            inputTokens: 1_000_000,
            outputTokens: 1_000_000,
        })).toBeCloseTo(2.8, 8);
    });

    it('labels the automatic mode for non-technical users', () => {
        expect(getOcrEngineLabel('auto')).toBe('자동 추천');
    });
});

describe('Gemini OCR hard cost guard', () => {
    it('allows an economy call only when its counted-input worst case fits', () => {
        const decision = evaluateGeminiOcrCostGuard({
            modelId: GEMINI_OCR_MODEL_CATALOG.economy.id,
            countedInputTokens: 2_000,
            maxBillableOutputTokens: 6_144,
            spentUsd: 0,
            maxUsd: 0.05,
        });

        expect(decision.allowed).toBe(true);
        expect(decision.projectedAttemptCostUsd).toBeCloseTo(0.01596, 6);
    });

    it('blocks every second-model path when remaining budget is insufficient', () => {
        const decision = evaluateGeminiOcrCostGuard({
            modelId: GEMINI_OCR_MODEL_CATALOG.exceptionalPrecision.id,
            countedInputTokens: 2_000,
            maxBillableOutputTokens: 6_144,
            spentUsd: 0.01,
            maxUsd: 0.05,
        });

        expect(decision.allowed).toBe(false);
        expect(decision.projectedTotalCostUsd).toBeGreaterThan(0.05);
        expect(decision.remainingBudgetUsd).toBeCloseTo(0.04, 8);
    });
});
