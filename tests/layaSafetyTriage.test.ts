import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildLayaExtendedReferencePack, evaluateLayaExtendedRun, type LayaV2Prediction } from '../utils/layaExtendedSafetyBenchmark';

const simulate = (mode: 'perfect' | 'miss-all' | 'wrong-type' | 'no-predictions') => {
    const original=buildLayaExtendedReferencePack();
    const cases=original.cases.map(c=>c.language==='ko-KR'?c:{...c,text:'SIMULATED TRANSLATION '+c.id,translationReview:'reviewed' as const,reviewerCode:'SIMULATION',reviewedAt:'2026-10-26T09:00:00.000Z'});
    const predictions: LayaV2Prediction[]=mode==='no-predictions'?[]:cases.map(c=>({
        caseId:c.id,
        predictedLabel:mode==='miss-all'?'none':mode==='wrong-type'?'fall':c.expectedLabel,
        confidence:null,
    }));
    return evaluateLayaExtendedRun({...original,cases,engine:'laya',runtime:'local-offline',checkpoint:'synthetic-test',checkpointRevision:'not-verified',predictions});
};

describe('ATLAS priority triage of 132 synthetic research cases',()=>{
    it('zero errors in synthetic perfect result does not approve model',()=>{
        const r=simulate('perfect');
        expect([r.falseNegative,r.wrongType,r.noPrediction,r.falsePositive]).toEqual([0,0,0,0]);
        expect(r.safetyApproved).toBe(false);
    });
    it('110 missed hazards take highest visual priority',()=>{
        const r=simulate('miss-all');
        expect(r.falseNegative).toBe(110);
        expect(r.wrongType).toBe(0);
    });
    it('88 wrong types are not incorrectly described as missing hazards',()=>{
        const r=simulate('wrong-type');
        expect(r.wrongType).toBe(88);
        expect(r.falsePositive).toBe(22);
    });
    it('missing predictions cannot be counted as successful detection',()=>{
        const r=simulate('no-predictions');
        expect(r.noPrediction).toBe(132);
        expect(r.predicted).toBe(0);
        expect(r.hazardDetectionRecall).toBe(0);
    });
    it('panel displays severity triage without AI/server/network calls',()=>{
        const s=readFileSync('components/tbm/LayaExtendedReviewPanel.tsx','utf8');
        expect(s).toContain('1순위 · 위험 미탐지');
        expect(s).toContain('2순위 · 위험 유형 오류');
        expect(s).toContain('3순위 · 예측 누락');
        expect(s).toContain('4순위 · 위험 오경보');
        expect(s).toContain('모델을 현장 안전판정에 사용하지 마세요');
        expect(s).not.toMatch(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|\/api\//);
    });
});
