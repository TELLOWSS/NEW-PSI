import {describe,it,expect} from 'vitest';
import type {Inspection,InspectorAction} from '../lib/inspector/types';
import {buildGlobalActionRegisterCsv,filterGlobalActionsWithCriteria,globalRegisterCriteriaError,globalActionCheckCounts,globalActionDimensions,globalActionNextStep,projectGlobalActionRows,type GlobalRegisterCriteria} from '../lib/inspector/globalActionRegister';

const check=(date:string)=>'즉시 조치 곤란(미조치 유지): 자재 공급 대기\n임시 보호조치 계획(시행 미확인): 접근통제 계획\n다음 현장 확인 예정: '+date;
const inspection=(id:string,site:string,actions:InspectorAction[]):Inspection=>({
 id,revision:4,created_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-05T00:00:00Z',
 document:{title:'월간 현장점검',siteName:site,location:'2002동 2층',workType:'형틀',eventAt:'2026-11-01T00:00:00Z',urgent:false,notes:'',photoIds:[],analyses:{},reviews:{},ocrResults:{},actions},
});
const action=(id:string,owner:string,dueDate:string,status:InspectorAction['status']='open',scheduleContext=''):InspectorAction=>({
 id,title:'발판 이격 점검',owner,dueDate,status,completionPhotoId:'',note:'',
 ...(scheduleContext?{scheduleContext}:{}),
});
const rows=()=>projectGlobalActionRows([
 inspection('a','용인 A현장',[
  action('a1','형틀반장','2026-11-05','open',check('2026-11-06')),
  action('a2','철근반장','2026-11-09','review-requested',check('2026-11-04')),
 ]),
 inspection('b','용인 B현장',[
  action('b1','형틀반장','2026-11-06','open',check('2026-11-07')),
  action('b2','도장반장','2026-11-04','verified',check('2026-11-03')),
 ]),
]);
const all:GlobalRegisterCriteria={site:'',owner:'',dueFrom:'',dueTo:''};
describe('R118 paged administrator register filters without rescanning or rewriting original inspections',()=>{
 it('classifies next site checks due today or past, never treats verified actions as waiting',()=>{
  const data=rows(),today='2026-11-06';
  const counts=globalActionCheckCounts(data,today);
  expect(counts).toEqual({due:2,past:1,overlapWithOverdue:1,overlapWithReinspection:1});
  expect(filterGlobalActionsWithCriteria(data,'check','',today,all).map(x=>x.actionId)).toEqual(['a1','a2']);
  expect(globalActionDimensions(data.find(x=>x.actionId==='b2')!,today).check).toBe(false);
  expect(globalActionDimensions(data.find(x=>x.actionId==='a2')!,today)).toMatchObject({check:true,checkLate:true,reinspection:true,overdue:false});
  expect(globalActionNextStep({...data.find(x=>x.actionId==='b1')!,scheduleContext:check('2026-11-06')},today)).toMatch(/임시 보호조치 계획의 실제 이행 여부/);
 });
 it('combines exact site, exact owner, and inclusive agreed due date interval',()=>{
  const data=rows(),today='2026-11-06';
  expect(filterGlobalActionsWithCriteria(data,'all','',today,{...all,site:'용인 A현장'}).map(x=>x.actionId)).toEqual(['a1','a2']);
  expect(filterGlobalActionsWithCriteria(data,'unresolved','',today,{...all,owner:'형틀반장'}).map(x=>x.actionId)).toEqual(['a1','b1']);
  expect(filterGlobalActionsWithCriteria(data,'all','',today,{...all,site:'용인 A현장',owner:'형틀반장',dueFrom:'2026-11-05',dueTo:'2026-11-05'}).map(x=>x.actionId)).toEqual(['a1']);
  expect(filterGlobalActionsWithCriteria(data,'all','철근반장',today,{...all,site:'용인 A현장',dueFrom:'2026-11-09',dueTo:'2026-11-09'}).map(x=>x.actionId)).toEqual(['a2']);
  expect(filterGlobalActionsWithCriteria(data,'all','',today,{...all,dueFrom:'2026-11-10'})).toHaveLength(0);
 });
 it('invalid and reversed date ranges have an explicit error and no accidental broad query',()=>{
  const data=rows(),today='2026-11-06';
  for(const spec of [{dueFrom:'2026-11-15',dueTo:'2026-11-01'},{dueFrom:'2026-02-30',dueTo:''},{dueFrom:'not-date',dueTo:''}]){
   const criteria={...all,...spec};
   expect(globalRegisterCriteriaError(criteria)).toBeTruthy();
   expect(filterGlobalActionsWithCriteria(data,'all','',today,criteria)).toHaveLength(0);
  }
 });
 it('keeps dates independent and preserves all original actions and source scopes',()=>{
  const data=rows(),before=JSON.stringify(data);
  const filtered=filterGlobalActionsWithCriteria(data,'check','', '2026-11-06',{...all,site:'용인 A현장'});
  expect(filtered).toHaveLength(2);
  expect(filtered.every(x=>x.inspectionId==='a')).toBe(true);
  expect(globalActionCheckCounts(filtered,'2026-11-06').due).toBe(2);
  const csv=buildGlobalActionRegisterCsv(filtered,'2026-11-06');
  expect(csv).toContain('다음 현장 확인 예정일');
  expect(csv).toContain('확인 예정일 도래 여부');
  expect(csv).toContain('2026-11-04');
  expect(csv).toContain('2026-11-06');
  expect(csv).not.toContain('용인 B현장');
  expect(csv.split('\r\n').filter(Boolean)).toHaveLength(3);
  expect(JSON.stringify(data)).toBe(before);
 });
 it('does not turn a plan into an alert when the date is malformed or lies in the future',()=>{
  const data=rows(),today='2026-11-06';
  data[0].scheduleContext=check('2026-02-30');
  expect(globalActionDimensions(data[0],today).check).toBe(false);
  expect(globalActionDimensions(data[2],today).check).toBe(false);
 });
});
