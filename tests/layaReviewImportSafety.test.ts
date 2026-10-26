import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    buildLayaExtendedReferencePack, validateLayaExtendedPack,
    type LayaV2Pack,
} from '../utils/layaExtendedSafetyBenchmark';
import {
    compareLayaReviewImport, stageLayaReviewImport,
} from '../utils/layaReviewImportSafety';
import { buildLayaReviewHandoff } from '../utils/layaReviewHandoff';

const base = () => buildLayaExtendedReferencePack();
const reviewed = (): LayaV2Pack => {
    const pack=base();
    return {
        ...pack,
        cases:pack.cases.map(item=>item.language==='ko-KR'?{...item}:{
            ...item,text:'NOT A TRANSLATION; SYNTHETIC DETERMINISTIC TEST '+item.id,
            translationReview:'reviewed' as const,
            reviewerCode:'SIM-REVIEW-ONLY',
            reviewedAt:'2026-10-26T12:00:00.000Z',
        }),
    };
};
const changedAt = (pack:LayaV2Pack,index:number) => ({
    ...pack,
    cases:pack.cases.map((item,i)=> i===index ? {
        ...item,
        text:item.language==='ko-KR'?item.text:item.text+' changed',
        reviewerCode:item.language==='ko-KR'?item.reviewerCode:'DIFFERENT-SIM',
    }:item),
});

describe('ATLAS 10th release: prevent accidental overwrite when importing Laya review files',()=>{
    it('stages an identical 132-case fixture without mutating current pack or inventing safety approval',()=>{
        const current=reviewed();
        const before=JSON.stringify(current);
        const stage=stageLayaReviewImport(current,buildLayaReviewHandoff(current,{
            selectedLanguage:'vi-VN',selectedCaseId:'vi-VN:fall-opening',
            focusedMode:true,pendingOnly:false,
        }));
        expect(stage.preview.changedCases).toBe(0);
        expect(stage.preview.sameContent).toBe(true);
        expect(stage.preview.existingReviewed).toBe(132);
        expect(stage.preview.incomingReviewed).toBe(132);
        expect(stage.preview.reviewProvenanceVerified).toBe(false);
        expect(stage.restored.session?.selectedCaseId).toBe('vi-VN:fall-opening');
        expect(JSON.stringify(current)).toBe(before);
    });
    it('warns that loading an older unreviewed file discards 120 foreign-language review records',()=>{
        const preview=compareLayaReviewImport(reviewed(),base());
        expect(preview.changedCases).toBe(120);
        expect(preview.reviewsLostOnReplace).toBe(120);
        expect(preview.reviewsAddedOnReplace).toBe(0);
        expect(preview.conflictingReviewedCases).toBe(0);
        expect(preview.existingReviewed).toBe(132);
        expect(preview.incomingReviewed).toBe(12);
        expect(preview.pendingLanguagesAfter).toBe(10);
        expect(preview.changedLanguages).toHaveLength(10);
    });
    it('warns that newer file adds 120 review records without hiding uncertainty',()=>{
        const preview=compareLayaReviewImport(base(),reviewed());
        expect(preview.changedCases).toBe(120);
        expect(preview.reviewsAddedOnReplace).toBe(120);
        expect(preview.reviewsLostOnReplace).toBe(0);
        expect(preview.pendingLanguagesAfter).toBe(0);
        expect(preview.reviewProvenanceVerified).toBe(false);
    });
    it('detects changed reviewer attribution/timestamps as conflicting reviewed cases',()=>{
        const original=reviewed();
        const changed=changedAt(original,12);
        const summary=compareLayaReviewImport(original,changed);
        expect(summary.changedCases).toBe(1);
        expect(summary.conflictingReviewedCases).toBe(1);
        expect(summary.reviewsLostOnReplace).toBe(0);
        expect(summary.changedLanguages[0].code).toBe(changed.cases[12].language);
    });
    it('refuses incomplete, duplicated, tampered or unsupported schema files without mutating current',()=>{
        const current=reviewed();
        const before=JSON.stringify(current);
        const deleted=base();deleted.cases.pop();
        expect(()=>stageLayaReviewImport(current,deleted)).toThrow('132건');
        const duplicate=base();duplicate.cases[0]={...duplicate.cases[1]};
        expect(()=>stageLayaReviewImport(current,duplicate)).toThrow();
        const tampered=base();tampered.cases[0].expectedLabel='none';
        expect(()=>stageLayaReviewImport(current,tampered)).toThrow('기대 위험유형');
        expect(()=>stageLayaReviewImport(current,{schema:'other',cases:[]})).toThrow();
        expect(JSON.stringify(current)).toBe(before);
    });
    it('compares one edit at every index in the full 132-case universe',()=>{
        const fixture=reviewed();
        for(let i=0;i<fixture.cases.length;i++){
            const changed=changedAt(fixture,i);
            const preview=compareLayaReviewImport(fixture,changed);
            if(fixture.cases[i].language==='ko-KR'){
                expect(preview.changedCases).toBe(0);
            }else{
                expect(preview.changedCases).toBe(1);
                expect(preview.conflictingReviewedCases).toBe(1);
            }
        }
    });
    it('1000 deterministic review comparisons retain record counts and precisely count conflicts',()=>{
        const fixture=reviewed();
        let seed=0x752026;
        for(let round=0;round<1000;round++){
            seed=(Math.imul(seed,1664525)+1013904223)>>>0;
            const idx=12+seed%120; // 10 languages x 12 foreign synthetic cases
            const candidate=changedAt(fixture,idx);
            const preview=compareLayaReviewImport(fixture,candidate);
            expect(preview.changedCases).toBe(1);
            expect(preview.conflictingReviewedCases).toBe(1);
            expect(preview.existingReviewed).toBe(132);
            expect(preview.incomingReviewed).toBe(132);
            expect(preview.reviewProvenanceVerified).toBe(false);
        }
    });
    it('input ordering does not change the comparison, and older handoff JSON remains compatible',()=>{
        const current=reviewed();
        const imported={...current,cases:[...current.cases].reverse()};
        const result=stageLayaReviewImport(current,imported);
        expect(result.preview.sameContent).toBe(true);
        expect(validateLayaExtendedPack(result.restored.pack).cases).toHaveLength(132);
        expect(result.restored.session).toBeNull();
    });
    it('frontend can only commit through explicit review-and-replace, with dirty backup gate',()=>{
        const panel=readFileSync('components/tbm/LayaExtendedReviewPanel.tsx','utf8');
        expect(panel).toContain("setStagedImport(staged)");
        expect(panel).toContain("const applyStagedImport = () =>");
        expect(panel).toContain("if(!stagedImport || needsSave || (importHasOverwriteRisk && !reviewLossAcknowledged)) return;");
        expect(panel).toContain("disabled={needsSave || (importHasOverwriteRisk && !reviewLossAcknowledged)}");
        expect(panel).toContain('취소 · 기존 자료 유지');
        expect(panel).toContain('확인 후 이 파일로 교체');
        expect(panel).toContain('다운로드 파일 확인 완료');
        expect(panel).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|\/api\//i);
    });
    it('Vercel Hobby and human safety decisions remain outside this UX-only code',()=>{
        const helper=readFileSync('utils/layaReviewImportSafety.ts','utf8');
        expect(helper).not.toMatch(/fetch\s*\(|\/api\/|onnxruntime|localStorage|WebSocket/);
        const vercel=JSON.parse(readFileSync('vercel.json','utf8')) as {fluid:boolean;functions:Record<string,{maxDuration:number}>;crons?:unknown[]};
        expect(vercel.fluid).toBe(true);
        expect(vercel.crons||[]).toEqual([]);
        expect(Object.keys(vercel.functions).sort()).toEqual(['api/admin.ts','api/gateway.ts','api/inspection-share.ts'].sort());
        expect(Object.values(vercel.functions).every(x=>x.maxDuration<=300)).toBe(true);
    });
});
