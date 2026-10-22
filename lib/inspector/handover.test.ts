import {describe,it,expect} from 'vitest';
import {buildInspectionHandover,reportReadiness} from './handover';
import {newInspectionDocument,type Inspection,type InspectorAction,type VisionImport} from './types';
const fixture=():Inspection=>({id:'synthetic-inspection',revision:8,created_at:'',updated_at:'',document:newInspectionDocument()});
const action=(id:string):InspectorAction=>({id,title:'개구부 보강',owner:'형틀반장',dueDate:'2026-10-24',status:'open',completionPhotoId:'',sourcePhotoIds:['a'],note:''});
describe('saved inspection handover and closing boundaries',()=>{
    it('blocks pending AI but permits manual, rejected and improvement evidence without declaring safety',()=>{
        const item=fixture(),d=item.document;d.photoIds=['a','b','c'];d.analyses.a={} as VisionImport;d.actions=[{...action('work'),completionPhotoId:'c'}];
        expect(reportReadiness(item)).toMatchObject({canReport:false,manual:1,improvement:1});
        d.reviews.a={decision:'rejected',note:'실측 결과 다른 위험 확인'};
        expect(reportReadiness(item)).toMatchObject({canReport:true,expert:1,unresolved:1});
        expect(reportReadiness(fixture()).canReport).toBe(false);
    });
    it('uses saved expert records and every action, excludes rejected or pending AI prose, never mutates the source',()=>{
        const item=fixture(),d=item.document;d.photoIds=['a','b'];d.photoNotes={a:'3층 개구부',b:'확인 전 사진'};
        d.analyses.a={recommended_controls:[{action:'REJECTED AI INSTRUCTION'}]} as VisionImport;d.analyses.b={observed_facts:[{text:'UNREVIEWED AI CLAIM'}]} as VisionImport;
        d.reviews.a={decision:'rejected',note:'난간 실측 후 발판 보완 요청'};d.actions=Array.from({length:8},(_,i)=>({...action(String(i)),title:`등록 조치 ${i+1}`}));
        const before=JSON.stringify(item),text=buildInspectionHandover(item);
        expect(text).toContain('난간 실측 후 발판 보완 요청');expect(text).toContain('등록 조치 8');expect(text).toContain('AI 검토 대기 1장');expect(text).not.toMatch(/REJECTED AI|UNREVIEWED AI/);expect(text).toContain('안전 승인');expect(JSON.stringify(item)).toBe(before);
    });
    it('reports the exact stored report selection including linked action evidence while handover numbering uses the full inspection',()=>{
        const item=fixture(),d=item.document;d.photoIds=['a','b','c','d'];d.materialCompletion={revision:5,completedAt:'2026-10-23T00:00:00Z',photoIds:['a']};d.actions=[{...action('work'),completionPhotoId:'d'}];
        expect(reportReadiness(item).reportPhotos).toBe(2);expect(buildInspectionHandover(item)).toContain('개선 후: 사진 4');
    });
    it('bounds maximal documents to one share packet without silently dropping later photos/actions',()=>{
        const item=fixture(),d=item.document;d.photoIds=Array.from({length:20},(_,i)=>String(i));
        for(const id of d.photoIds){d.photoNotes??={};d.photoNotes[id]='설명'.repeat(2000);d.reviews[id]={decision:'accepted',note:'검토'.repeat(1000)};}
        d.actions=Array.from({length:30},(_,i)=>({...action(String(i)),title:'제목'.repeat(500),owner:'담당'.repeat(50),note:'내용'.repeat(1000),sourcePhotoIds:[...d.photoIds],completionPhotoId:'19'}));
        const text=buildInspectionHandover(item);expect(text.length).toBeLessThan(50000);expect(text).toContain('사진 20 ·');expect(text).toContain('30. ');expect(text).toContain('…(요약)');
    });
});
