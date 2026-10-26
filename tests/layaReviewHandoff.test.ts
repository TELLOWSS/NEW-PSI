import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildLayaExtendedReferencePack, validateLayaExtendedPack, type LayaV2Pack } from '../utils/layaExtendedSafetyBenchmark';
import { buildLayaReviewHandoff, findNextPendingLayaLanguage, restoreLayaReviewHandoff } from '../utils/layaReviewHandoff';

const sourcePack = () => buildLayaExtendedReferencePack();
const working = () => sourcePack();
const state = {
    selectedLanguage: 'vi-VN' as const,
    selectedCaseId: 'vi-VN:caught-drill',
    focusedMode: true,
    pendingOnly: false,
};

describe('ATLAS 9th iteration portable 132-case review and handoff QA', () => {
    it('exports exactly 132 unchanged synthetic cases and optional browser-only resume state', () => {
        const pack = working();
        const before = JSON.stringify(pack);
        const exported = buildLayaReviewHandoff(pack,state);
        expect(JSON.stringify(pack)).toBe(before);
        expect(exported.cases).toHaveLength(132);
        expect(exported.reviewSession.version).toBe(1);
        expect(exported.reviewSession.selectedCaseId).toBe(state.selectedCaseId);
        expect(validateLayaExtendedPack(exported).cases).toEqual(pack.cases);
    });
    it('loads resume state after JSON round-trip on another device without saving PII', () => {
        const exported = buildLayaReviewHandoff(working(), {...state,pendingOnly:true});
        const restore = restoreLayaReviewHandoff(JSON.parse(JSON.stringify(exported)));
        expect(restore.ignoredSession).toBe(false);
        expect(restore.session?.selectedLanguage).toBe('vi-VN');
        expect(restore.session?.selectedCaseId).toBe('vi-VN:caught-drill');
        expect(restore.session?.pendingOnly).toBe(true);
        expect(restore.pack.cases).toHaveLength(132);
    });
    it('legacy 132-case files without session still work unchanged', () => {
        const fromOld = restoreLayaReviewHandoff(sourcePack());
        expect(fromOld.pack.cases).toHaveLength(132);
        expect(fromOld.session).toBeNull();
        expect(fromOld.ignoredSession).toBe(false);
    });
    it('ignore an invalid session object without deleting any valid safety translation records', () => {
        const pack = sourcePack();
        const malformed = {...pack, reviewSession:{version:999, selectedLanguage:'xx-XX',selectedCaseId:'x',pendingOnly:false,focusedMode:true}};
        const restored = restoreLayaReviewHandoff(malformed);
        expect(restored.pack.cases).toEqual(pack.cases);
        expect(restored.session).toBeNull();
        expect(restored.ignoredSession).toBe(true);
    });
    it('reject cross-language or nonexistent requested cursor and preserve safe default', () => {
        const p = working();
        const exported = buildLayaReviewHandoff(p,{...state,selectedCaseId:'ko-KR:fall-opening'});
        expect(exported.reviewSession.selectedCaseId).toBe('');
        const corrupted = {...p,reviewSession:{
            version:1,selectedLanguage:'vi-VN',selectedCaseId:'zh-CN:fall-opening',focusedMode:true,pendingOnly:false
        }};
        const read = restoreLayaReviewHandoff(corrupted);
        expect(read.session).toBeNull();
        expect(read.ignoredSession).toBe(true);
    });
    it('scans for the next unfinished foreign language, never falsely treating Korean baseline as pending', () => {
        const p = sourcePack();
        expect(findNextPendingLayaLanguage(p,'vi-VN')).not.toBe('ko-KR');
        const languages = new Set(p.cases.map(x => x.language));
        for(const language of languages){
            if(language === 'ko-KR') continue;
            const next=findNextPendingLayaLanguage(p,language);
            expect(next).not.toBeNull();
            expect(next).not.toBe('ko-KR');
        }
    });
    it('skips completed languages and reports no next language once all 120 foreign records reviewed', () => {
        const pack=working();
        pack.cases = pack.cases.map(item=>item.language==='vi-VN'? {
            ...item,text:'SIMULATED NONTRANSLATION REVIEW TEST '+item.id,
            translationReview:'reviewed',reviewerCode:'TEST-CODE',
            reviewedAt:'2026-10-26T12:00:00.000Z',
        }:item);
        expect(findNextPendingLayaLanguage(pack,'ko-KR')).not.toBe('vi-VN');
        const fully=working();
        fully.cases=fully.cases.map(item=>item.language==='ko-KR'?item:{
            ...item,text:'SIMULATED NONTRANSLATION REVIEW TEST '+item.id,
            translationReview:'reviewed',reviewerCode:'TEST-CODE',
            reviewedAt:'2026-10-26T12:00:00.000Z',
        });
        expect(findNextPendingLayaLanguage(fully,'vi-VN')).toBeNull();
        expect(validateLayaExtendedPack(fully).cases).toHaveLength(132);
    });
    it('remains deterministic across 1000 arbitrary resume states and never loses original cases', () => {
        let seed=0x20261026;
        const pack=working();
        const original=JSON.stringify(pack);
        for(let iteration=0;iteration<1000;iteration++){
            seed=(Math.imul(seed,1664525)+1013904223)>>>0;
            const item=pack.cases[seed%pack.cases.length];
            const session={
                selectedLanguage:item.language,selectedCaseId:item.id,
                focusedMode:Boolean(seed&1),pendingOnly:Boolean(seed&2),
            };
            const saved=buildLayaReviewHandoff(pack,session);
            const restored=restoreLayaReviewHandoff(saved);
            expect(restored.session?.selectedCaseId).toBe(item.id);
            expect(restored.session?.selectedLanguage).toBe(item.language);
            expect(restored.pack.cases).toEqual(pack.cases);
        }
        expect(JSON.stringify(pack)).toBe(original);
    });
    it('file download is not claimed successful before the user confirms its existence', () => {
        const panel=readFileSync('components/tbm/LayaExtendedReviewPanel.tsx','utf8');
        expect(panel).toContain('setSaveRequested(needsSave)');
        expect(panel).toContain('다운로드 파일 확인 완료');
        expect(panel).toContain('restoreLayaReviewHandoff(data)');
        expect(panel).toContain('findNextPendingLayaLanguage');
        expect(panel).toContain('beforeunload');
        expect(panel).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|\/api\//i);
    });
    it('does not change Vercel Hobby function boundaries or load Laya model weights', () => {
        const config=JSON.parse(readFileSync('vercel.json','utf8')) as {
            fluid:boolean;functions:Record<string,{maxDuration:number}>;crons?:unknown[];
        };
        expect(config.fluid).toBe(true);
        expect(config.crons||[]).toEqual([]);
        expect(Object.keys(config.functions).sort()).toEqual(['api/admin.ts','api/gateway.ts','api/inspection-share.ts'].sort());
        expect(Object.values(config.functions).every(x=>x.maxDuration<=300)).toBe(true);
        const helper=readFileSync('utils/layaReviewHandoff.ts','utf8');
        expect(helper).not.toMatch(/\/api\/|onnxruntime|fetch\s*\(|localStorage/);
    });
});
