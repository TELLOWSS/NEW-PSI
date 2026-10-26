import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    inspectLayaReviewReadiness, verifyLayaRunMatchesCurrentPack,
} from '../utils/layaReviewReadiness';
import {
    buildLayaExtendedReferencePack, type LayaV2Pack,
} from '../utils/layaExtendedSafetyBenchmark';

const fixture = (): LayaV2Pack => {
    const source = buildLayaExtendedReferencePack();
    return {
        ...source,
        cases: source.cases.map(row => row.language === 'ko-KR' ? {...row} : {
            ...row, text: 'SIMULATED NOT-A-TRANSLATION ' + row.id,
            translationReview: 'reviewed' as const,
            reviewerCode: 'SIMULATED-REVIEWER',
            reviewedAt: '2026-10-26T07:30:00.000Z',
        }),
    };
};
const asRun = (pack: LayaV2Pack) => ({
    ...pack, engine: 'laya', runtime: 'local-offline',
    checkpoint: 'placeholder', checkpointRevision: 'example-revision',
    predictions: [],
});

describe('ATLAS safety review readiness / imported-result alignment', () => {
    it('shows no false certification from an entirely untranslated fresh 132-case pack', () => {
        const state = inspectLayaReviewReadiness(buildLayaExtendedReferencePack());
        expect(state.total).toBe(132);
        expect(state.reviewed).toBe(12);
        expect(state.awaiting).toBe(120);
        expect(state.languagesComplete).toBe(1);
        expect(state.possibleCopyPasteCases).toBe(0);
        expect(state.semanticReviewVerified).toBe(false);
        expect(state.modelValidated).toBe(false);
        expect(state.operationallyApproved).toBe(false);
    });
    it('shows individual language status and full 132-case review bookkeeping', () => {
        const pack = fixture();
        const state = inspectLayaReviewReadiness(pack);
        expect(state.reviewed).toBe(132);
        expect(state.awaiting).toBe(0);
        expect(state.languagesComplete).toBe(11);
        expect(state.rows.every(row => row.reviewed === 12 && row.missing === 0)).toBe(true);
        expect(state.possibleCopyPasteCases).toBe(0);
    });
    it('warns on suspect repeated translation text but does not assert mistranslation', () => {
        const pack = fixture();
        const two = pack.cases.filter(row => row.language === 'vi-VN');
        const first = two[0];
        if (!first || !two[1]) throw new Error('Fixture incomplete');
        two[1].text = '  ' + first.text.toUpperCase().replace(/ /g,'   ') + '  ';
        const state = inspectLayaReviewReadiness(pack);
        expect(state.rows.find(row => row.language === 'vi-VN')?.suspiciousDuplicates).toBe(2);
        expect(state.possibleCopyPasteCases).toBe(2);
        expect(state.operationallyApproved).toBe(false);
    });
    it('allows exact current fixture metadata independently of row ordering', () => {
        const pack = fixture();
        const run = asRun({...pack,cases:[...pack.cases].reverse()});
        expect(() => verifyLayaRunMatchesCurrentPack(run,pack)).not.toThrow();
    });
    it('rejects imported results from a prior different review revision', () => {
        const pack = fixture();
        const stale = fixture();
        const row = stale.cases.find(x=>x.language === 'vi-VN');
        if(!row) throw new Error('Fixture incomplete');
        row.text = 'SIMULATED DIFFERENT CONTENT FOR VI CASE';
        expect(() => verifyLayaRunMatchesCurrentPack(asRun(stale),pack)).toThrow('1건');
        row.text = pack.cases.find(x=>x.id===row.id)!.text;
        row.reviewedAt = '2026-10-26T08:30:00.000Z';
        expect(() => verifyLayaRunMatchesCurrentPack(asRun(stale),pack)).toThrow('1건');
        row.reviewedAt = '2026-10-26T07:30:00.000Z';
        row.reviewerCode = 'OTHER-REVIEWER';
        expect(() => verifyLayaRunMatchesCurrentPack(asRun(stale),pack)).toThrow('1건');
    });
    it('does not trust a renamed source id or unreviewed output to match the current pack', () => {
        const pack = fixture();
        const invalid = fixture();
        invalid.cases[0].id = 'forged-record-id';
        expect(() => verifyLayaRunMatchesCurrentPack(asRun(invalid),pack)).toThrow();
        const changed=fixture();
        const foreign=changed.cases.find(c=>c.language==='vi-VN')!;
        foreign.translationReview='pending';
        foreign.reviewerCode='';
        foreign.reviewedAt=null;
        expect(() => verifyLayaRunMatchesCurrentPack(asRun(changed),pack)).toThrow('1건');
    });
    it('rejects each of 132 independently modified review cases', () => {
        const original = fixture();
        for (let n=0;n<132;n++) {
            const old = original.cases[n];
            const changed = {...original,cases:original.cases.map((row,i)=>i===n?{
                ...row, text: row.language==='ko-KR'?row.text+' tampered':row.text+' edited',
            }:row)};
            expect(() => verifyLayaRunMatchesCurrentPack(asRun(changed),original)).toThrow();
        }
    });
    it('supports 1000 reproducible random review changes without silently accepting a mismatch', () => {
        const original=fixture();
        let seed=0xace12026;
        for(let round=0;round<1000;round++){
            seed=(Math.imul(seed,1664525)+1013904223)>>>0;
            const n=seed%132;
            const bad={...original,cases:original.cases.map((row,index)=>index===n?{
                ...row,reviewerCode: row.language==='ko-KR'?'changed':'ALTERED-REVIEWER',
            }:row)};
            expect(() => verifyLayaRunMatchesCurrentPack(asRun(bad),original)).toThrow();
        }
    });
    it('does not create Vercel API calls, cron jobs or new model runtime costs', () => {
        const source=readFileSync('utils/layaReviewReadiness.ts','utf8');
        const panel=readFileSync('components/tbm/LayaExtendedReviewPanel.tsx','utf8');
        for(const text of [source,panel]){
            expect(text).not.toMatch(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|\/api\/|onnxruntime|@huggingface/i);
        }
        const config=JSON.parse(readFileSync('vercel.json','utf8')) as {
            fluid:boolean;functions:Record<string,{maxDuration:number}>;crons?:unknown[];
        };
        expect(config.fluid).toBe(true);
        expect(config.crons||[]).toEqual([]);
        expect(Object.keys(config.functions).sort()).toEqual(
            ['api/admin.ts','api/gateway.ts','api/inspection-share.ts'].sort(),
        );
        expect(Object.values(config.functions).every(f=>f.maxDuration<=300)).toBe(true);
    });
});
