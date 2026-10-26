import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildGlobalActionRegisterCsv,filterGlobalActions,globalActionCounts,globalActionPhase,globalActionDimensions,globalActionStatusText,globalActionNextStep,projectGlobalActionRows} from '../lib/inspector/globalActionRegister';
import type {Inspection,InspectorAction} from '../lib/inspector/types';
const inspection=(id:string,actions:InspectorAction[]):Inspection=>({id,revision:3,created_at:'2026-10-25T00:00:00Z',updated_at:'2026-10-25T00:00:00Z',document:{title:'정기 안전점검',siteName:'테스트 현장',location:'2002동 2층',workType:'형틀',eventAt:'2026-10-25T00:00:00Z',urgent:false,notes:'',photoIds:[],analyses:{},reviews:{},ocrResults:{},actions}});
const action=(id:string,dueDate:string,status:InspectorAction['status']='open'):InspectorAction=>({id,title:'개구부 보강',owner:'형틀 반장',dueDate,status,completionPhotoId:'',note:''});
const sample=()=>{const a=inspection('a',[action('future','2026-10-28'),action('today','2026-10-26'),action('late','2026-10-25')]);a.document.actions[0].scheduleContext='내일 자재 입고 · 그 전까지 접근 제한';return projectGlobalActionRows([a,inspection('b',[action('review','2026-10-24','review-requested'),action('done','2026-10-01','verified')])]);};
const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
describe('admin global inspector action register',()=>{
 it('classifies deadlines and reinspection distinctly across multiple inspections',()=>{
  const rows=sample(),count=globalActionCounts(rows,'2026-10-26');
  expect(count).toEqual({unresolved:4,scheduled:1,today:1,overdue:2,reinspection:1,verified:1,overlappingOverdueReinspection:1});
  expect(filterGlobalActions(rows,'unresolved','','2026-10-26').map(r=>r.actionId)).toEqual(['late','review','today','future']);
  expect(globalActionPhase(rows[0],'2026-10-26')).toBe('scheduled');
 });

 it('shows overdue review-requested on both independent axes and in CSV',()=>{
  const rows=sample(),today='2026-10-26',review=rows.find(r=>r.actionId==='review')!;
  expect(filterGlobalActions(rows,'overdue','',today).map(r=>r.actionId)).toEqual(['late','review']);
  expect(filterGlobalActions(rows,'reinspection','',today).map(r=>r.actionId)).toEqual(['review']);
  expect(globalActionDimensions(review,today)).toMatchObject({overdue:true,reinspection:true,verified:false});
  expect(globalActionStatusText(review,today)).toContain('약정기한 경과');
  expect(globalActionStatusText(review,today)).toContain('현장 재점검 대기');
  expect(globalActionNextStep(review,today)).toContain('접수 증빙과 현장');
  expect(buildGlobalActionRegisterCsv([review],today)).toContain('약정기한 경과 여부');
  expect(buildGlobalActionRegisterCsv([review],today)).toContain('재점검 대기 여부');
  expect(buildGlobalActionRegisterCsv([review],today)).toContain('현장 확인할 다음 단계');
 });
 it('does not mistake evidence arrival for deadline compliance or verified completion',()=>{
  const today='2026-10-27',records=projectGlobalActionRows([inspection('a',[
   action('lateReview','2026-10-26','review-requested'),
   action('futureReview','2026-10-30','review-requested'),
   action('oldDone','2026-10-01','verified'),
   action('dueNow','2026-10-27'),
  ])]),counts=globalActionCounts(records,today);
  expect(counts).toMatchObject({unresolved:3,overdue:1,reinspection:2,today:1,verified:1,overlappingOverdueReinspection:1});
  expect(filterGlobalActions(records,'overdue','',today).map(r=>r.actionId)).toEqual(['lateReview']);
  expect(filterGlobalActions(records,'reinspection','',today).map(r=>r.actionId)).toEqual(['lateReview','futureReview']);
  expect(filterGlobalActions(records,'verified','',today).map(r=>r.actionId)).toEqual(['oldDone']);
  expect(globalActionDimensions(records.find(x=>x.actionId==='oldDone')!,today).overdue).toBe(false);
 });
 it('marks missing owner/date as confirmation needed, without a guessed due date',()=>{
  const today='2026-10-27',base=projectGlobalActionRows([inspection('a',[action('noOwner','bad-date')])])[0];
  const row={...base,owner:'  '};
  expect(globalActionDimensions(row,today)).toMatchObject({unknown:true,assignmentNeeded:true,overdue:false,scheduled:false});
  expect(globalActionNextStep(row,today)).toContain('임의로 지정하지 않습니다');
  expect(globalActionStatusText(row,today)).toContain('담당·기한 확인 필요');
 });
 it('shows distinct overlap warning and keeps old 20-inspection read boundary',()=>{
  const ui=read('components/inspector/InspectorGlobalActionRegister.tsx');
  expect(ui).toContain('counts.overlappingOverdueReinspection>0');
  expect(ui).toContain('globalActionStatusText(row,today)');
  expect(ui).toContain('globalActionNextStep(row,today)');
  expect(ui).toContain("data-deadline-passed={dimension.overdue?'yes':'no'}");
  expect(ui).toContain("data-reinspection-pending={dimension.reinspection?'yes':'no'}");
  expect(ui).toContain('사진 파일은 내려받지 않습니다');
  expect(ui).toContain('이전 점검 20건 더 보기');
  expect(ui).not.toContain("op:'photo'");
 });
 it('preserves original records and filter determinism under 1000 randomized orders',()=>{
  const input=sample(),today='2026-10-26',before=JSON.stringify(input);
  const baseline=Object.fromEntries(['unresolved','overdue','reinspection','today','verified'].map(k=>
   [k,filterGlobalActions(input,k as import('../lib/inspector/globalActionRegister').RegisterFilter,'',today).map(r=>r.actionId)]));
  let state=0x20261027;
  for(let i=0;i<1000;i++){
   const shuffled=[...input];
   for(let j=shuffled.length-1;j>0;j--){
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    const k=state%(j+1);
    [shuffled[j],shuffled[k]]=[shuffled[k],shuffled[j]];
   }
   for(const key of Object.keys(baseline)){
    expect(filterGlobalActions(shuffled,key as import('../lib/inspector/globalActionRegister').RegisterFilter,'',today).map(r=>r.actionId)).toEqual(baseline[key]);
   }
   expect(globalActionCounts(shuffled,today).overlappingOverdueReinspection).toBe(1);
  }
  expect(JSON.stringify(input)).toBe(before);
 });
 it('searches loaded site, task and trade only; never invents an AI-proposed action',()=>{
  const a=inspection('a',[action('one','2026-10-28')]);
  a.document.analyses['ai']={recommended_controls:[{action:'AI suggestion only'}]} as never;
  const rows=projectGlobalActionRows([a]);
  expect(rows).toHaveLength(1);expect(JSON.stringify(rows)).not.toContain('AI suggestion only');
  expect(filterGlobalActions(rows,'all','2002동','2026-10-26')).toHaveLength(1);
  expect(filterGlobalActions(rows,'all','철근','2026-10-26')).toHaveLength(0);
 });
 it('exports selected loaded records only, with spreadsheet formula guards and due rationale',()=>{
  const row={...sample()[0],title:'=HYPERLINK("https://bad")',owner:'@TASK',scheduleContext:'=Danger'};
  const csv=buildGlobalActionRegisterCsv([row],'2026-10-26');
  expect(csv.charCodeAt(0)).toBe(0xfeff);expect(csv).toContain("'=HYPERLINK");
  expect(csv).toContain("'@TASK");expect(csv).toContain("'=Danger");
  expect(csv).toContain('사용자가 불러온 점검 범위만');
 });
 it('does not mutate persisted data when a projected UI record is edited',()=>{
  const original=inspection('a',[action('one','2026-10-28')]),before=JSON.stringify(original);
  projectGlobalActionRows([original])[0].title='changed';
  expect(JSON.stringify(original)).toBe(before);
 });
 it('server caps explicit read and excludes deletion-locked inspections',()=>{
  const server=read('lib/server/admin/inspector.ts');
  expect(server).toContain("body.op === 'global-action-register'");
  expect(server).toContain("keys(body,['before','beforeId'])");
  expect(server).toContain('.limit(21)');
  expect(server).toContain('projectGlobalActionRows(active)');
  expect(server).toContain("x.state!=='active'");
  expect(server).toContain('isValidAdminAuthRequest(req)');
 });
 it('workspace opens exact original action and protects unsaved edits; no photos in overview',()=>{
  const quick=read('components/inspector/InspectorQuickWorkspace.tsx'),component=read('components/inspector/InspectorGlobalActionRegister.tsx');
  expect(quick).toContain("loadSaved(inspectionId,'actions',undefined,actionId)");
  expect(quick).toContain('focusedActionId');
  expect(quick).toContain('unsavedPhoto||actionDraftDirty');
  expect(component).toContain('onToggle=');
  expect(component).toContain('global-action-register');
  expect(component).toContain('이전 점검 20건 더 보기');
  expect(component).not.toContain("op:'photo'");
 });
});
