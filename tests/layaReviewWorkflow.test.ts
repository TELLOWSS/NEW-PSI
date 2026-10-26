import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildLayaExtendedReferencePack, validateLayaExtendedPack } from '../utils/layaExtendedSafetyBenchmark';
import {
    advanceLayaReviewCursor,
    findNextUnreviewedLayaCase,
    getLayaReviewQueue,
    resolveLayaReviewCursor,
} from '../utils/layaReviewWorkflow';

const base = () => buildLayaExtendedReferencePack();
const vi = 'vi-VN' as const;
const kr = 'ko-KR' as const;

describe('ATLAS mobile-first 132-case one-at-a-time reviewer workflow',()=>{
    it('starts with twelve pending Vietnamese cases, not a forged completed translation',()=>{
        const pack=base();
        const all=getLayaReviewQueue(pack,vi,false);
        const pending=getLayaReviewQueue(pack,vi,true);
        expect(all).toHaveLength(12);
        expect(pending).toHaveLength(12);
        expect(all.every(item=>item.translationReview==='pending'&&item.text==='')).toBe(true);
        expect(getLayaReviewQueue(pack,kr,true)).toHaveLength(0);
    });
    it('keeps the 132-source JSON entirely intact under client filtering',()=>{
        const pack=base();
        const original=JSON.stringify(pack);
        getLayaReviewQueue(pack,vi,true);
        getLayaReviewQueue(pack,kr,true);
        expect(JSON.stringify(pack)).toBe(original);
        expect(validateLayaExtendedPack(pack).cases).toHaveLength(132);
    });
    it('selects the first case when cursor is unset or stale and counts progress',()=>{
        const cases=getLayaReviewQueue(base(),vi,false);
        const start=resolveLayaReviewCursor(cases,'');
        expect(start.id).toBe(cases[0].id);
        expect(start.position).toBe(1);
        expect(start.total).toBe(12);
        expect(resolveLayaReviewCursor(cases,'missing').position).toBe(1);
        expect(resolveLayaReviewCursor(cases,cases[11].id).position).toBe(12);
    });
    it('keeps boundaries stable: cannot move before 1 or after 12',()=>{
        const cases=getLayaReviewQueue(base(),vi,false);
        expect(advanceLayaReviewCursor(cases,cases[0].id,-1)).toBe(cases[0].id);
        expect(advanceLayaReviewCursor(cases,cases[0].id,1)).toBe(cases[1].id);
        expect(advanceLayaReviewCursor(cases,cases[11].id,1)).toBe(cases[11].id);
        expect(advanceLayaReviewCursor(cases,cases[11].id,-1)).toBe(cases[10].id);
    });
    it('does not crash on an empty pending-only queue',()=>{
        const blank=getLayaReviewQueue(base(),kr,true);
        expect(resolveLayaReviewCursor(blank,'')).toEqual({id:null,position:0,total:0});
        expect(advanceLayaReviewCursor(blank,'irrelevant',1)).toBeNull();
        expect(findNextUnreviewedLayaCase(base(),kr,'ko-KR:fall-opening')).toBeNull();
    });
    it('advances after the current item to the next unreviewed case',()=>{
        const pack=base();
        const rows=getLayaReviewQueue(pack,vi,false);
        expect(findNextUnreviewedLayaCase(pack,vi,rows[0].id)).toBe(rows[1].id);
        pack.cases=pack.cases.map(x=>x.id===rows[1].id?{
            ...x,text:'SIMULATED LOCAL SAFETY TEXT',translationReview:'reviewed',
            reviewerCode:'SIM-1',reviewedAt:'2026-10-26T09:00:00.000Z',
        }:x);
        expect(findNextUnreviewedLayaCase(pack,vi,rows[0].id)).toBe(rows[2].id);
    });
    it('wraps inside the current language without skipping into another language',()=>{
        const pack=base();
        const cases=getLayaReviewQueue(pack,vi,false);
        expect(findNextUnreviewedLayaCase(pack,vi,cases[11].id)).toBe(cases[0].id);
        expect(findNextUnreviewedLayaCase(pack,vi,'not-a-real-case')).toBeNull();
    });
    it('does not incorrectly revisit the just-reviewed current item when no other items need review',()=>{
        const pack=base();
        const rows=getLayaReviewQueue(pack,vi,false);
        pack.cases=pack.cases.map(x=>x.language==='vi-VN'&&x.id!==rows[2].id?{
            ...x,text:'SIMULATED TEXT FOR '+x.id,translationReview:'reviewed',
            reviewerCode:'REVIEWER-A',reviewedAt:'2026-10-26T09:00:00.000Z',
        }:x);
        expect(findNextUnreviewedLayaCase(pack,vi,rows[2].id)).toBeNull();
        expect(getLayaReviewQueue(pack,vi,true)).toHaveLength(1);
    });
    it('handles all 11 languages consistently with no out-of-range cursor',()=>{
        const pack=base();
        for(const language of new Set(pack.cases.map(x=>x.language))){
            const rows=getLayaReviewQueue(pack,language,false);
            expect(rows).toHaveLength(12);
            for(let index=0;index<12;index++){
                const cursor=resolveLayaReviewCursor(rows,rows[index].id);
                expect(cursor.position).toBe(index+1);
                expect(cursor.total).toBe(12);
                expect(rows.every(x=>x.language===language)).toBe(true);
            }
        }
    });
    it('prevents unexpected network actions and protects Hobby function configuration',()=>{
        const ui=readFileSync('components/tbm/LayaExtendedReviewPanel.tsx','utf8');
        const helper=readFileSync('utils/layaReviewWorkflow.ts','utf8');
        for(const file of [ui,helper]){
            expect(file).not.toMatch(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|\/api\/|onnxruntime/i);
        }
        expect(ui).toContain('beforeunload');
        expect(ui).toContain('미검수만 보기');
        expect(ui).toContain('한 건씩');
        const config=JSON.parse(readFileSync('vercel.json','utf8')) as {fluid:boolean;functions:Record<string,{maxDuration:number}>;crons?:unknown[]};
        expect(config.fluid).toBe(true);
        expect(config.crons||[]).toEqual([]);
        expect(Object.keys(config.functions).sort()).toEqual(['api/admin.ts','api/gateway.ts','api/inspection-share.ts'].sort());
        expect(Object.values(config.functions).every(f=>f.maxDuration<=300)).toBe(true);
    });
});
