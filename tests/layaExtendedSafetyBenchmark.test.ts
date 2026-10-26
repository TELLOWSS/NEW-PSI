import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    LAYA_EXTENDED_SCHEMA, LAYA_V2_CASES_PER_LANGUAGE, LAYA_V2_EXPECTED_CASES,
    buildLayaExtendedReferencePack, evaluateLayaExtendedRun, validateLayaExtendedPack,
    type LayaV2Pack, type LayaV2Prediction,
} from '../utils/layaExtendedSafetyBenchmark';
import { LAYA_HAZARD_LABELS, type LayaHazardLabel } from '../utils/layaSafetyBenchmark';

const experiment = () => {
    const pack=buildLayaExtendedReferencePack();
    return {
        ...pack, engine:'laya', runtime:'local-offline',
        checkpoint:'convaiinnovations/laya-multilingual', checkpointRevision:'test-revision-not-verified',
        predictions:[] as LayaV2Prediction[],
    };
};
const makeReviewed = () => {
    const run=experiment();
    run.cases=run.cases.map(c=>c.language==='ko-KR'?{...c}:({
        ...c,text:'SYNTHETIC NON-TRANSLATED MOCK STRING FOR '+c.id,
        translationReview:'reviewed' as const,reviewerCode:'SIMULATOR',reviewedAt:'2026-10-26T07:00:00.000Z',
    }));
    return run;
};
const predict = (input: ReturnType<typeof makeReviewed>, decide:(label:LayaHazardLabel,id:string)=>LayaHazardLabel|null) => {
    input.predictions=input.cases.flatMap(c=>{
        const outcome=decide(c.expectedLabel,c.id);
        return outcome===null?[]:[{caseId:c.id,predictedLabel:outcome,confidence:null}];
    });
    return input;
};
const partition = (run:ReturnType<typeof makeReviewed>) => {
    const r=evaluateLayaExtendedRun(run);
    expect(r.predicted).toBe(r.correct+r.falseNegative+r.falsePositive+r.wrongType);
    expect(r.reviewed).toBe(r.predicted+r.noPrediction);
    expect(r.safetyApproved).toBe(false);
    expect(r.provenanceVerified).toBe(false);
    expect(r.reviewerIdentityVerified).toBe(false);
    expect(r.languages.length).toBe(11);
    expect(r.languages.reduce((v,x)=>v+x.reviewed,0)).toBe(r.reviewed);
    expect(r.languages.reduce((v,x)=>v+x.predicted,0)).toBe(r.predicted);
    return r;
};

describe('ATLAS v2 132-case 11-language 6-hazard offline quality gates',()=>{
    it('has all 6 labels, two synthetic references each, 11 languages without forged translations',()=>{
        const pack=buildLayaExtendedReferencePack();
        expect(pack.schema).toBe(LAYA_EXTENDED_SCHEMA);
        expect(pack.cases.length).toBe(LAYA_V2_EXPECTED_CASES);
        expect(pack.cases.length).toBe(132);
        for(const language of new Set(pack.cases.map(c=>c.language))){
            const cases=pack.cases.filter(c=>c.language===language);
            expect(cases.length).toBe(LAYA_V2_CASES_PER_LANGUAGE);
            for(const label of LAYA_HAZARD_LABELS)expect(cases.filter(c=>c.expectedLabel===label)).toHaveLength(2);
            if(language==='ko-KR')expect(cases.every(c=>c.translationReview==='reviewed'&&c.text===c.referenceKo)).toBe(true);
            else expect(cases.every(c=>c.text===''&&c.translationReview==='pending'&&c.reviewerCode==='')).toBe(true);
        }
    });
    it('perfect synthetic predictor never implies actual model approval',()=>{
        const r=partition(predict(makeReviewed(),(label)=>label));
        expect(r.correct).toBe(132);
        expect(r.predictedLanguagesComplete).toBe(11);
        expect(r.coverageAllCases).toBe(1);
        expect(r.accuracy).toBe(1);
        expect(r.hazardDetectionRecall).toBe(1);
    });
    it('every true hazard mapped to none produces 110 false negatives, no artificial approval',()=>{
        const r=partition(predict(makeReviewed(),()=> 'none'));
        expect(r.falseNegative).toBe(110);
        expect(r.correct).toBe(22);
        expect(r.falsePositive).toBe(0);
        expect(r.hazardDetectionRecall).toBe(0);
    });
    it('all predicted fall distinguishes 22 false positives and 88 wrong types',()=>{
        const r=partition(predict(makeReviewed(),()=> 'fall'));
        expect(r.correct).toBe(22);
        expect(r.falsePositive).toBe(22);
        expect(r.wrongType).toBe(88);
        expect(r.falseNegative).toBe(0);
        expect(r.hazardDetectionRecall).toBe(1);
    });
    it('no predictions do not lead to high coverage or high recall',()=>{
        const r=partition(makeReviewed());
        expect(r.reviewed).toBe(132);
        expect(r.predicted).toBe(0);
        expect(r.coverageAllCases).toBe(0);
        expect(r.hazardDetectionRecall).toBe(0);
        expect(r.accuracy).toBe(null);
    });
    it('missing one prediction makes the language incomplete and counts missed output',()=>{
        const r=partition(predict(makeReviewed(),(label,id)=>id==='vi-VN:fall-opening'?null:label));
        expect(r.predicted).toBe(131);
        expect(r.noPrediction).toBe(1);
        expect(r.predictedLanguagesComplete).toBe(10);
        expect(r.hazardDetectionRecall).toBeCloseTo(109/110);
    });
    it('native-review absence stays missing even if forged predictions are perfect',()=>{
        const run=experiment();
        run.predictions=run.cases.map(c=>({caseId:c.id,predictedLabel:c.expectedLabel,confidence:null}));
        const r=partition(run);
        expect(r.reviewed).toBe(12);
        expect(r.predicted).toBe(12);
        expect(r.reviewedLanguagesComplete).toBe(1);
        expect(r.coverageAllCases).toBeCloseTo(12/132);
        expect(r.safetyApproved).toBe(false);
    });
    it('rejects changed labels, dropped cases, duplicate ids, invalid/forged reviewer records and Korean source changes',()=>{
        const altered=makeReviewed();altered.cases[0].expectedLabel='none';
        expect(()=>validateLayaExtendedPack(altered)).toThrow('기대 위험유형');
        const missing=makeReviewed();missing.cases.pop();
        expect(()=>validateLayaExtendedPack(missing)).toThrow('132건');
        const duplicate=makeReviewed();duplicate.cases[1]={...duplicate.cases[0]};
        expect(()=>validateLayaExtendedPack(duplicate)).toThrow('중복');
        const forged=makeReviewed();const foreign=forged.cases.find(c=>c.language==='vi-VN')!;
        foreign.text=foreign.referenceKo;
        expect(()=>validateLayaExtendedPack(forged)).toThrow('현지어');
        foreign.text='COMPLETED MOCK TRANSLATION NOT REAL';
        foreign.reviewerCode='';
        expect(()=>validateLayaExtendedPack(forged)).toThrow('검수자');
        const korean=makeReviewed();korean.cases[0].text='changed';
        expect(()=>validateLayaExtendedPack(korean)).toThrow('한국어');
    });
    it('rejects impossible prediction values and maliciously invented case ids',()=>{
        const dup=predict(makeReviewed(),v=>v);
        dup.predictions.push({...dup.predictions[0]});
        expect(()=>evaluateLayaExtendedRun(dup)).toThrow('예측');
        const invalid=predict(makeReviewed(),v=>v);
        invalid.predictions[0].predictedLabel='fake-label' as LayaHazardLabel;
        expect(()=>evaluateLayaExtendedRun(invalid)).toThrow('위험유형');
        const badId=predict(makeReviewed(),v=>v);
        badId.predictions[0].caseId='not a known id';
        expect(()=>evaluateLayaExtendedRun(badId)).toThrow('예측');
        const conf=predict(makeReviewed(),v=>v);
        conf.predictions[0].confidence=2.3;
        expect(()=>evaluateLayaExtendedRun(conf)).toThrow('신뢰도');
    });
    it('2,000 deterministic independent synthetic permutations keep metric partitions invariant',()=>{
        let seed=0x20261026;
        const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
        let totalMisses=0,totalFalseAlarms=0;
        for(let round=0;round<2000;round++){
            const run=predict(makeReviewed(),()=>{
                const n=random();
                return n%17===0?null:LAYA_HAZARD_LABELS[n%LAYA_HAZARD_LABELS.length];
            });
            const r=partition(run);
            totalMisses+=r.falseNegative;
            totalFalseAlarms+=r.falsePositive;
        }
        expect(totalMisses).toBeGreaterThan(0);
        expect(totalFalseAlarms).toBeGreaterThan(0);
    },30000); // Vercel Hobby shared CPU may exceed the generic 5s threshold for 2,000 full evaluations.
    it('250 case and prediction ordering changes never modify language-level metrics',()=>{
        const original=predict(makeReviewed(),(label,id)=>id.endsWith('fire-welding')?'none':label);
        const baseline=evaluateLayaExtendedRun(original);
        for(let n=0;n<250;n++){
            const move=n%132,movePredict=(n*7)%132;
            const reshuffled={
                ...original,cases:[...original.cases.slice(move),...original.cases.slice(0,move)],
                predictions:[...original.predictions.slice(movePredict),...original.predictions.slice(0,movePredict)],
            };
            expect(evaluateLayaExtendedRun(reshuffled)).toEqual(baseline);
        }
    });
    it('Vercel Hobby stays without new API cron model or paid inference function',()=>{
        const v=JSON.parse(readFileSync('vercel.json','utf8')) as {
            fluid:boolean;functions:Record<string,{maxDuration:number}>;crons?:unknown[];
        };
        expect(v.fluid).toBe(true);
        expect(v.crons||[]).toEqual([]);
        expect(Object.keys(v.functions).sort()).toEqual(['api/admin.ts','api/gateway.ts','api/inspection-share.ts'].sort());
        expect(Object.values(v.functions).every(x=>x.maxDuration<=300)).toBe(true);
        const panel=readFileSync('components/tbm/LayaExtendedReviewPanel.tsx','utf8');
        expect(panel).not.toMatch(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|\/api\/|onnxruntime/i);
        const runner=readFileSync('scripts/laya_safety_offline_runner_v2.py','utf8');
        expect(runner).toContain('HF_HUB_OFFLINE');
        expect(runner).toContain('TRANSFORMERS_OFFLINE');
    });
});
