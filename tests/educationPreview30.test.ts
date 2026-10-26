import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildEducationPreview30, selectEducationPreviewScene } from '../utils/educationPreview30';
import type { TbmEducationDraft } from '../utils/tbmEducationStudio';

const makeDraft = (): TbmEducationDraft => ({
    month:'2026-11', workType:'형틀',title:'5분 교육', coreMessage:'주의',
    opening:'안전', risks:[], accidentCases:[], focusPoints:[], notices:[],
    checklist:[], confirmationQuestions:[], closingCommitment:'확인', sourceCount:0,
    generatedAt:'2026-10-26T00:00:00Z',
    videoScenes:[
        { id:'a', title:'고소작업', narration:'안전대 확인', visualGuide:'작업발판', seconds:60 },
        { id:'b', title:'양중작업', narration:'출입통제 확인', visualGuide:'인양 동선', seconds:90 },
        { id:'c', title:'작업중지', narration:'이상 시 작업중지', visualGuide:'통제선', seconds:150 },
    ],
});

describe('local 30-second education preview', () => {
    it('compresses a human-reviewed 300-second manifest to 30 seconds without inventing content', () => {
        const scenes=buildEducationPreview30(makeDraft());
        expect(scenes.map(x=>x.previewDuration)).toEqual([6,9,15]);
        expect(scenes.reduce((a,x)=>a+x.previewDuration,0)).toBe(30);
        expect(selectEducationPreviewScene(scenes,0)?.title).toBe('고소작업');
        expect(selectEducationPreviewScene(scenes,7)?.title).toBe('양중작업');
        expect(selectEducationPreviewScene(scenes,29)?.title).toBe('작업중지');
        expect(selectEducationPreviewScene(scenes,30)?.title).toBe('작업중지');
        expect(JSON.stringify(scenes)).not.toContain('worker');
    });
    it('rejects source scenes that are incomplete or not 300 seconds',()=>{
        const draft=makeDraft();
        draft.videoScenes[2].seconds=120;
        expect(()=>buildEducationPreview30(draft)).toThrow('300초');
        draft.videoScenes[2].seconds=150;
        draft.videoScenes[2].visualGuide='';
        expect(()=>buildEducationPreview30(draft)).toThrow('화면 지시');
    });
    it('keeps the existing serverless limits within Hobby Fluid Compute and adds no endpoint', () => {
        const config=JSON.parse(readFileSync('vercel.json','utf8')) as {
            fluid?:boolean; functions:Record<string,{maxDuration:number}>; crons?:unknown[]
        };
        expect(config.fluid).toBe(true);
        expect(config.crons || []).toEqual([]);
        expect(Object.keys(config.functions).sort()).toEqual(
            ['api/admin.ts','api/gateway.ts','api/inspection-share.ts'].sort(),
        );
        Object.values(config.functions).forEach((f)=>{
            expect(f.maxDuration).toBeGreaterThan(0);
            expect(f.maxDuration).toBeLessThanOrEqual(300);
        });
        const component=readFileSync('components/tbm/EducationPreview30.tsx','utf8');
        const helper=readFileSync('utils/educationPreview30.ts','utf8');
        for (const source of [component,helper]) {
            expect(source).not.toMatch(/\\bfetch\\s*\\(|XMLHttpRequest|WebSocket|sendBeacon|\/api\//);
        }
    });
});
