import { describe, expect, it } from 'vitest';
import { buildLayaSafetyReferencePack, evaluateLayaOfflineRun, LAYA_HAZARD_LABELS, LAYA_RESEARCH_SCHEMA } from '../utils/layaSafetyBenchmark';
import type { LayaHazardLabel } from '../utils/layaSafetyBenchmark';

const fixture = () => {
    const pack = buildLayaSafetyReferencePack();
    return {
        schema: LAYA_RESEARCH_SCHEMA, engine: 'laya', runtime: 'local-offline',
        checkpoint: 'convaiinnovations/laya-multilingual', checkpointRevision: 'simulated-revision-not-a-real-model-run',
        cases: pack.cases.map(item => ({
            ...item,
            // Synthetic placeholder text is explicitly not an authenticated translation.
            text: item.language === 'ko-KR' ? item.referenceKo : 'NON-LINGUISTIC STRESS TEST CASE ' + item.id,
            translationReview: 'reviewed' as 'reviewed' | 'pending',
        })),
        predictions: [] as Array<{caseId: string; predictedLabel: LayaHazardLabel; confidence: number | null}>,
    };
};
const predict = (input: ReturnType<typeof fixture>, choose: (label: LayaHazardLabel, id: string) => LayaHazardLabel | null) => {
    input.predictions = input.cases.flatMap(c => {
        const selected = choose(c.expectedLabel, c.id);
        return selected === null ? [] : [{ caseId:c.id, predictedLabel:selected, confidence:null }];
    });
    return input;
};
const verifyPartition = (data: ReturnType<typeof fixture>) => {
    const report = evaluateLayaOfflineRun(data);
    expect(report.predicted).toBe(report.correct + report.missedHazard + report.falsePositive + report.wrongType);
    expect(report.eligible).toBe(report.predicted + report.unmatched);
    expect(report.predicted).toBe(report.languageMetrics.reduce((n,x)=>n+x.predicted,0));
    expect(report.missedHazard).toBe(report.languageMetrics.reduce((n,x)=>n+x.missedHazard,0));
    expect(report.falsePositive).toBe(report.languageMetrics.reduce((n,x)=>n+x.falsePositive,0));
    expect(report.wrongType).toBe(report.languageMetrics.reduce((n,x)=>n+x.wrongType,0));
    expect(report.fullyPredictedLanguages).toBe(report.languageMetrics.filter(x=>x.predicted===3).length);
    expect(report.fixturePredictionCoverage).toBeCloseTo(report.predicted/33);
    expect(report.safetyApproved).toBe(false);
    expect(report.provenanceVerified).toBe(false);
    return report;
};

describe('ATLAS independent benchmark score engine stress simulation (not a Laya model accuracy test)', () => {
    it('perfect synthetic predictor: 33/33 across 11 languages remains research-only', () => {
        const result = verifyPartition(predict(fixture(), expected => expected));
        expect(result.total).toBe(33);
        expect(result.eligible).toBe(33);
        expect(result.correct).toBe(33);
        expect(result.missedHazard).toBe(0);
        expect(result.falsePositive).toBe(0);
        expect(result.fullyReviewedLanguages).toBe(11);
        expect(result.fullyPredictedLanguages).toBe(11);
        expect(result.fixtureReviewCoverage).toBe(1);
        expect(result.coverage).toBe(1);
        expect(result.accuracy).toBe(1);
    });
    it('all true hazards ignored: catches 22 critical false negatives and no false positives', () => {
        const result = verifyPartition(predict(fixture(), () => 'none'));
        expect(result.missedHazard).toBe(22);
        expect(result.falsePositive).toBe(0);
        expect(result.wrongType).toBe(0);
        expect(result.correct).toBe(11);
        for (const language of result.languageMetrics) expect(language.missedHazard).toBe(2);
    });
    it('all predicted as fall: distinguishes 11 false positives from 11 wrong accident types', () => {
        const result = verifyPartition(predict(fixture(), () => 'fall'));
        expect(result.falsePositive).toBe(11);
        expect(result.wrongType).toBe(11);
        expect(result.missedHazard).toBe(0);
        expect(result.correct).toBe(11);
    });
    it('omitting one prediction stops a false impression of complete language coverage', () => {
        const result = verifyPartition(predict(fixture(), (_type,id) => id==='vi-VN:fall' ? null : _type));
        expect(result.predicted).toBe(32);
        expect(result.unmatched).toBe(1);
        expect(result.fullyPredictedLanguages).toBe(10);
        expect(result.fixturePredictionCoverage).toBeCloseTo(32/33);
    });
    it('every single-case corruption among 33 cases produces precisely one classification error', () => {
        const ids=buildLayaSafetyReferencePack().cases.map(c=>c.id);
        for(const target of ids){
            const run=predict(fixture(), (expected,id) =>
                id!==target ? expected : expected==='none' ? 'fall' : 'none'
            );
            const result=verifyPartition(run);
            expect(result.correct).toBe(32);
            const label=run.cases.find(c=>c.id===target)?.expectedLabel;
            expect(result.missedHazard).toBe(label==='none'?0:1);
            expect(result.falsePositive).toBe(label==='none'?1:0);
        }
    });
    it('1,000 deterministic multi-language perturbations preserve totals and never approve safety', () => {
        let state=0x5eed2026;
        const pick=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
        let riskOmissionsFound=0;
        let falseAlarmsFound=0;
        for(let simulation=0;simulation<1000;simulation++){
            const run=predict(fixture(), () => {
                const value=pick();
                if(value%19===0)return null;
                return LAYA_HAZARD_LABELS[value%LAYA_HAZARD_LABELS.length];
            });
            const result=verifyPartition(run);
            riskOmissionsFound+=result.missedHazard;
            falseAlarmsFound+=result.falsePositive;
            expect(result.eligible).toBe(33);
            expect(result.fullyReviewedLanguages).toBe(11);
        }
        expect(riskOmissionsFound).toBeGreaterThan(0);
        expect(falseAlarmsFound).toBeGreaterThan(0);
    });
    it('250 reordered input/prediction permutations cannot change the scoring result', () => {
        const input=predict(fixture(), (expected,id)=>id.endsWith('struck_by')?'none':expected);
        const baseline=evaluateLayaOfflineRun(input);
        for(let n=0;n<250;n++){
            const r=evaluateLayaOfflineRun({
                ...input,
                cases:[...input.cases.slice(n%33),...input.cases.slice(0,n%33)],
                predictions:[...input.predictions.slice((n*3)%33),...input.predictions.slice(0,(n*3)%33)],
            });
            expect(r).toEqual(baseline);
        }
    });
    it('rejects deletion, additional rows, duplicate case IDs and changed source risk labels', () => {
        const missing=fixture();missing.cases.pop();
        expect(()=>evaluateLayaOfflineRun(missing)).toThrow('33건');
        const extra=fixture();extra.cases.push({...extra.cases[0],id:'extra:fall'});
        expect(()=>evaluateLayaOfflineRun(extra)).toThrow('33건');
        const duplicate=fixture();duplicate.cases[1]={...duplicate.cases[0]};
        expect(()=>evaluateLayaOfflineRun(duplicate)).toThrow('중복');
        const tampered=fixture();tampered.cases[0].expectedLabel='none';
        expect(()=>evaluateLayaOfflineRun(tampered)).toThrow('원문');
    });
    it('rejects a forged reviewed translation containing the unchanged Korean source', () => {
        const forged=fixture();
        const row=forged.cases.find(c=>c.language==='vi-VN');
        if(!row)throw Error('fixture missing');
        row.text=row.referenceKo;
        expect(()=>evaluateLayaOfflineRun(forged)).toThrow('한국어 원문');
        const koreanTampered=fixture();
        koreanTampered.cases[0].text='A different fabricated Korean safety sentence';
        expect(()=>evaluateLayaOfflineRun(koreanTampered)).toThrow('한국어 원문');
    });
    it('blocks duplicate, unknown, impossible-confidence, and non-existent predictions', () => {
        const duplicate=predict(fixture(), expected=>expected);
        duplicate.predictions.push({...duplicate.predictions[0]});
        expect(()=>evaluateLayaOfflineRun(duplicate)).toThrow('예측');
        const unknown=predict(fixture(), expected=>expected);
        unknown.predictions[0].predictedLabel='invalid-label' as LayaHazardLabel;
        expect(()=>evaluateLayaOfflineRun(unknown)).toThrow('위험유형');
        const fake=predict(fixture(), expected=>expected);
        fake.predictions[0].caseId='unlisted';
        expect(()=>evaluateLayaOfflineRun(fake)).toThrow('예측');
        const confidence=predict(fixture(), expected=>expected);
        confidence.predictions[0].confidence=Number.POSITIVE_INFINITY;
        expect(()=>evaluateLayaOfflineRun(confidence)).toThrow('확률');
    });
    it('skips unreviewed foreign-language predictions even when the file claims they are all perfect', () => {
        const input=predict(fixture(), expected=>expected);
        for (const c of input.cases) {
            if(c.language!=='ko-KR')c.translationReview='pending';
        }
        const result=verifyPartition(input);
        expect(result.predicted).toBe(3);
        expect(result.eligible).toBe(3);
        expect(result.fullyPredictedLanguages).toBe(1);
        expect(result.fixturePredictionCoverage).toBeCloseTo(3/33);
        expect(result.accuracy).toBe(1);
        expect(result.safetyApproved).toBe(false);
    });
});
