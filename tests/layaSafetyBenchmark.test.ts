import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    buildLayaSafetyReferencePack, evaluateLayaOfflineRun, LAYA_RESEARCH_SCHEMA,
} from '../utils/layaSafetyBenchmark';

const makeRun = () => {
    const pack = buildLayaSafetyReferencePack();
    return {
        schema: LAYA_RESEARCH_SCHEMA, engine: 'laya', runtime: 'local-offline',
        checkpoint: 'convaiinnovations/laya-multilingual', checkpointRevision: 'tested-pinned-revision',
        cases: pack.cases.map(item => ({ ...item })),
        predictions: [] as Array<{ caseId: string; predictedLabel: string; confidence: number | null }>,
    };
};

describe('ATLAS Laya offline-only construction risk benchmark', () => {
    it('has 33 synthetic examples across exactly 11 languages, foreign text awaits native review', () => {
        const pack = buildLayaSafetyReferencePack();
        expect(pack.schema).toBe(LAYA_RESEARCH_SCHEMA);
        expect(pack.languageCount).toBe(11);
        expect(pack.cases).toHaveLength(33);
        expect(pack.cases.filter(c => c.language === 'ko-KR' && c.translationReview === 'reviewed')).toHaveLength(3);
        expect(pack.cases.filter(c => c.language !== 'ko-KR').every(c => c.text === '' && c.translationReview === 'pending')).toBe(true);
        expect(new Set(pack.cases.map(c => c.language)).size).toBe(11);
    });
    it('reports only eligible model predictions; error labels do not grant safety approval', () => {
        const data = makeRun();
        data.predictions = [
            { caseId: 'ko-KR:fall', predictedLabel: 'none', confidence: null },
            { caseId: 'ko-KR:struck_by', predictedLabel: 'struck_by', confidence: 0.7 },
            { caseId: 'ko-KR:no_specific_hazard', predictedLabel: 'none', confidence: 0.6 },
        ];
        const result = evaluateLayaOfflineRun(data);
        expect(result.eligible).toBe(3);
        expect(result.predicted).toBe(3);
        expect(result.correct).toBe(2);
        expect(result.missedHazard).toBe(1);
        expect(result.accuracy).toBeCloseTo(2 / 3);
        expect(result.safetyApproved).toBe(false);
        expect(result.provenanceVerified).toBe(false);
        expect(result.languageMetrics.find(row => row.language === 'vi-VN')?.predicted).toBe(0);
    });
    it('does not count unreviewed foreign translations even if a prediction is supplied', () => {
        const data = makeRun();
        data.predictions.push({ caseId: 'vi-VN:fall', predictedLabel: 'fall', confidence: null });
        const result = evaluateLayaOfflineRun(data);
        expect(result.predicted).toBe(0);
        expect(result.accuracy).toBeNull();
        expect(result.coverage).toBe(0);
    });
    it('prevents source gold-label tampering, duplicate ids and out-of-range confidence', () => {
        const tampered = makeRun();
        tampered.cases[0].expectedLabel = 'none';
        expect(() => evaluateLayaOfflineRun(tampered)).toThrow('원문');
        const duplicate = makeRun();
        duplicate.predictions = [
            { caseId: 'ko-KR:fall', predictedLabel: 'fall', confidence: null },
            { caseId: 'ko-KR:fall', predictedLabel: 'fall', confidence: null },
        ];
        expect(() => evaluateLayaOfflineRun(duplicate)).toThrow('예측');
        const invalidConfidence = makeRun();
        invalidConfidence.predictions = [
            { caseId: 'ko-KR:fall', predictedLabel: 'fall', confidence: 1.7 },
        ];
        expect(() => evaluateLayaOfflineRun(invalidConfidence)).toThrow('확률');
    });
    it('keeps model runner offline and out of Vercel server functions', () => {
        const runner = readFileSync('scripts/laya_safety_offline_runner.py', 'utf-8');
        expect(runner).toContain('HF_HUB_OFFLINE');
        expect(runner).toContain('TRANSFORMERS_OFFLINE');
        const panel = readFileSync('components/tbm/LayaOfflineBenchmarkPanel.tsx', 'utf-8');
        expect(panel).not.toMatch(/fetch\s*\(|XMLHttpRequest|\/api\/|onnxruntime|WebSocket/);
        const cfg = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
            fluid: boolean; functions: Record<string, { maxDuration: number }>; crons?: unknown[];
        };
        expect(cfg.fluid).toBe(true);
        expect(cfg.crons || []).toEqual([]);
        expect(Object.keys(cfg.functions).sort()).toEqual(
            ['api/admin.ts', 'api/gateway.ts', 'api/inspection-share.ts'].sort(),
        );
        expect(Object.values(cfg.functions).every(f => f.maxDuration <= 300)).toBe(true);
    });
});
