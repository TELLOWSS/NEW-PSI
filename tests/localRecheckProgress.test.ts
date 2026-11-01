import {describe,it,expect} from 'vitest';
import {
 buildLocalRecheckProgress,
 buildLocalRecheckProgressForTargets,
 F10_PROGRESS_EXPORT_LIMIT,
} from '../lib/inspector/localRecheckProgress.mjs';
import {prepareFollowupChange} from '../lib/inspector/localFollowupChangeTrace.mjs';
import {buildLocalRecheckQueue} from '../lib/inspector/localRecheckQueue.mjs';

const first=new Date('2026-10-28T09:00:00.000Z');
const revised=new Date('2026-10-30T11:00:00.000Z');
const later=new Date('2026-10-31T07:00:00.000Z');
const firstFollowup=prepareFollowupChange(undefined,{
 status:'in_progress',assignee:'익명 담당자',
 dueDate:'2026-11-02',temporaryMeasure:'통제선 설치',
 note:'실제 완료 전 통제 유지 예정',
 controlReview:'unchecked',
},first);
const secondFollowup=prepareFollowupChange(firstFollowup,{
 status:'in_progress',assignee:'익명 담당자',
 dueDate:'2026-11-05',temporaryMeasure:'통제선 범위 확대',
 note:'통제선을 확인했으나 최종 조치는 미완료',
 dueChangeReason:'자재 반입이 예정보다 늦어진 상황',
 temporaryChangeReason:'상층 작업 범위를 추가로 통제하기 위함',
 controlReview:'site_checked',
},revised);
const synthetic={
 id:'inspection-1',note:'민감한 작업자 메모',followup:secondFollowup,
 rechecks:[
  {id:'synthetic-r-1',result:'delayed',reason:'자재 반입 지연 상세 기록',
   note:'중간에 미완료',nextCheckDate:'2026-11-01',
   at:'2026-10-29T12:00:00.000Z',photoSha256:null,followupStatus:'in_progress'},
  {id:'synthetic-r-2',result:'temporary_checked',reason:'임시 통제 확인 기록',
   note:'실제 완료와 별개',nextCheckDate:'',
   at:later.toISOString(),photoSha256:'f'.repeat(64),followupStatus:'in_progress'},
 ],
 additionalActions:[{
  id:'action-1',title:'발판 추가 고정',
  followup:prepareFollowupChange(undefined,{
   status:'pending',assignee:'',dueDate:'2026-11-06',temporaryMeasure:'',
   note:'발판 자재 반입 이후 시공 예정',controlReview:'unchecked',
  },first),
 }],
};

describe('F10 30th integrated local progress',()=>{
 it('chronologically joins due changes and reinspection while keeping their independent dates',()=>{
  const progress=buildLocalRecheckProgress(synthetic);
  expect(progress).toMatchObject({
   currentDueDate:'2026-11-05',
   nextCheckDate:'', // latest inspection explicitly left next visit undetermined
   dueChangeCount:1,temporaryChangeCount:1,
   followupCount:2,recheckCount:2,total:4,
   inconsistentFollowup:false,
  });
  expect(progress.events.map((e:any)=>e.kind)).toEqual([
   'followup','recheck','followup','recheck',
  ]);
  expect(progress.events[2]).toMatchObject({
   title:'목표 기한 변경 · 임시 안전조치 변경',
   dueBefore:'2026-11-02',dueAfter:'2026-11-05',
   controlReview:'점검자가 현장 유지 상태 직접 확인했다고 기록',
  });
  expect(progress.events[3]).toMatchObject({
   title:'재점검 · 임시 안전조치 현장 확인이라고 기록',
   nextCheckDate:'',evidenceLinked:true,
  });
  const defaultDump=JSON.stringify(progress);
  expect(defaultDump).not.toContain('익명 담당자');
  expect(defaultDump).not.toContain('자재 반입이 예정보다');
  expect(defaultDump).not.toContain('민감한 작업자 메모');
  expect(defaultDump).not.toContain('f'.repeat(64));
  expect(progress.notice).toContain('작업 재개');
 });
 it('includes reasons only after explicit details selection, without names or raw photo',()=>{
  const progress=buildLocalRecheckProgress(synthetic,null,{includeReasons:true});
  expect(progress.events[2].reason).toContain('자재 반입이 예정보다');
  expect(progress.events[2].reason).toContain('상층 작업 범위');
  expect(progress.events[3].reason).toContain('임시 통제 확인 기록');
  expect(JSON.stringify(progress)).not.toContain('익명 담당자');
  expect(JSON.stringify(progress)).not.toContain('f'.repeat(64));
 });
 it('keeps a specific individual action separate from whole-inspection events',()=>{
  const action=buildLocalRecheckProgress(synthetic,'action-1');
  expect(action).toMatchObject({
   label:'발판 추가 고정',currentDueDate:'2026-11-06',
   nextCheckDate:null,dueChangeCount:0,recheckCount:0,total:1,
  });
  expect(action.events).toHaveLength(1);
  expect(()=>buildLocalRecheckProgress(synthetic,'not-found')).toThrow('조치 항목');
 });
 it('does not manufacture change reasons for older records',()=>{
  const legacy={...synthetic,followup:{
   status:'pending',assignee:'',dueDate:'2026-11-06',temporaryMeasure:'',
   history:[
    {status:'pending',assignee:'',dueDate:'2026-11-02',temporaryMeasure:'',
     note:'기존 기록',at:'2026-10-28T09:00:00.000Z'},
    {status:'pending',assignee:'',dueDate:'2026-11-06',temporaryMeasure:'',
     note:'변경했다는 기록 없음',at:'2026-10-30T09:00:00.000Z'},
   ],
  },rechecks:[]};
  const timeline=buildLocalRecheckProgress(legacy,null,{includeReasons:true});
  expect(timeline.events[1].reason).toContain('과거 기록');
  expect(timeline.events[1].dueBefore).toBe('2026-11-02');
  expect(timeline.events[1].dueAfter).toBe('2026-11-06');
  expect(timeline.latestRecheckStatus).toBe('재점검 이력 없음');
 });
 it('keeps status conflicts visible instead of granting automatic clearance',()=>{
  const unusual={...synthetic,followup:{...secondFollowup,status:'verified'}};
  const timeline=buildLocalRecheckProgress(unusual);
  expect(timeline.inconsistentFollowup).toBe(true);
  expect(timeline.lastControlReview).toContain('직접 확인했다고 기록');
 });
 it('preserves original records and enforces a bounded report of 1500 events',()=>{
  const source=JSON.stringify(synthetic);
  const queue=buildLocalRecheckQueue([synthetic],new Date(2026,10,1));
  const result=buildLocalRecheckProgressForTargets([synthetic],queue);
  expect(result.items).toHaveLength(2);
  expect(result.totalEvents).toBe(5);
  expect(JSON.stringify(synthetic)).toBe(source);
  const whole=queue.find((item:any)=>item.actionId===null);
  expect(whole).toBeDefined();
  const atLimit=Array(F10_PROGRESS_EXPORT_LIMIT/4).fill(whole);
  expect(buildLocalRecheckProgressForTargets([synthetic],atLimit).totalEvents)
   .toBe(F10_PROGRESS_EXPORT_LIMIT);
  const beyond=[...atLimit,whole];
  expect(()=>buildLocalRecheckProgressForTargets([synthetic],beyond))
   .toThrow('1,500건');
 });
});
