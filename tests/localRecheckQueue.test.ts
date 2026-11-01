import {describe,it,expect} from 'vitest';
import {
 buildLocalRecheckQueue,localCalendarDate,summarizeLocalRecheckQueue,
 LOCAL_RECHECK_BUCKETS,
} from '../lib/inspector/localRecheckQueue.mjs';

const now=new Date(2026,10,1,11,0,0);
const recheck=(result:string,nextCheckDate:string,extra:Record<string,unknown>={})=>({
 id:'123e4567-e89b-12d3-a456-426614174000',
 result,reason:'공정 지연 사유',note:'접근 통제 유지 기록',
 nextCheckDate,at:'2026-10-31T11:00:00.000Z',
 photoSha256:null,followupStatus:'in_progress',...extra,
});
const followup=(status='in_progress',dueDate='')=>({
 status,assignee:'',dueDate,temporaryMeasure:'',
 history:[],
});
const row=(id:string,extra:Record<string,unknown>={})=>({
 id,note:'시스템비계 발판 지지 상태 추가 확인',...extra,
});

describe('F10 offline reinspection priority without automatic safety decisions',()=>{
 it('uses the local device calendar, including end of month',()=>{
  expect(localCalendarDate(now)).toBe('2026-11-01');
  expect(localCalendarDate(new Date(2026,11,31,23,59))).toBe('2026-12-31');
 });
 it('prioritizes overdue, today, 3-day horizon and later calendar dates',()=>{
  const records=[
   row('future',{followup:followup('pending','2026-11-05')}),
   row('today',{followup:followup('pending','2026-11-01')}),
   row('past',{followup:followup('in_progress','2026-10-30')}),
   row('soon',{followup:followup('pending','2026-11-04')}),
  ];
  const items=buildLocalRecheckQueue(records,now);
  expect(items.map((item:any)=>item.bucket)).toEqual(['overdue','today','soon','scheduled']);
  expect(items.map((item:any)=>item.daysRemaining)).toEqual([-2,0,3,4]);
  expect(items.every((item:any)=>item.dateSource==='조치 목표 기한')).toBe(true);
 });
 it('uses the latest recheck date rather than stale history or an older action deadline',()=>{
  const items=buildLocalRecheckQueue([
   row('r1',{
    followup:followup('in_progress','2026-10-15'),
    rechecks:[recheck('delayed','2026-10-20'),recheck('temporary_checked','2026-11-03')],
   }),
  ],now);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
   date:'2026-11-03',bucket:'soon',daysRemaining:2,dateSource:'재점검 예정일',
   lastRecheckResult:'temporary_checked',
  });
 });
 it('never uses an old follow-up due date when latest recheck explicitly leaves date undetermined',()=>{
  const items=buildLocalRecheckQueue([
   row('r1',{followup:followup('pending','2026-10-01'),rechecks:[recheck('delayed','')]}),
  ],now);
  expect(items[0]).toMatchObject({bucket:'unscheduled',date:'',daysRemaining:null});
 });
 it('raises a contradiction between a manually verified status and unfinished latest recheck',()=>{
  const items=buildLocalRecheckQueue([
   row('r1',{followup:followup('verified','2026-10-10'),rechecks:[recheck('needs_more','2026-11-06')]}),
   row('r2',{followup:followup('verified','2026-10-10'),rechecks:[recheck('review_requested','2026-11-06')]}),
  ],now);
  expect(items.map((item:any)=>item.bucket)).toEqual(['conflict','verified']);
  expect(items[0].followupStatus).toBe('verified');
 });
 it('does not accuse a newer human verification of conflicting with older unfinished recheck',()=>{
  const manual=followup('verified','2026-11-05');
  manual.history=[{
   status:'verified',assignee:'점검 확인자',dueDate:'2026-11-05',
   temporaryMeasure:'접근 통제 유지',note:'추후 검토로 직접 확인함',
   at:'2026-11-01T03:00:00.000Z',
  }];
  const record=row('resolved',{
   followup:manual,
   rechecks:[recheck('needs_more','2026-11-03',{at:'2026-10-30T02:00:00.000Z'})],
  });
  expect(buildLocalRecheckQueue([record],now)[0].bucket).toBe('verified');
  // An actually newer "needs work" finding reopens the conflict.
  const reopened=row('reopened',{
   followup:manual,
   rechecks:[recheck('needs_more','2026-11-03',{at:'2026-11-01T04:00:00.000Z'})],
  });
  expect(buildLocalRecheckQueue([reopened],now)[0].bucket).toBe('conflict');
 });
 it('keeps point-inspection and individual actions independently; no inherited owner or completion',()=>{
  const items=buildLocalRecheckQueue([
   row('r1',{
    followup:followup('verified','2026-10-29'),
    additionalActions:[
     {id:'a1',title:'개구부 덮개 고정',followup:followup('pending','2026-10-31')},
     {id:'a2',title:'동바리 받침 확인',rechecks:[recheck('delayed','2026-11-01')]},
    ],
   }),
  ],now);
  expect(items).toHaveLength(3);
  expect(items.map((item:any)=>item.bucket)).toEqual(['overdue','today','verified']);
  const action=items.find((item:any)=>item.actionId==='a2');
  expect(action).toMatchObject({
   label:'동바리 받침 확인',bucket:'today',
   followupStatus:'unrecorded',hasAssignee:false,hasTemporaryMeasure:false,
  });
  expect(items.find((item:any)=>item.actionId===null)?.bucket).toBe('verified');
 });
 it('does not invent records for unrelated legacy photos or empty records',()=>{
  const items=buildLocalRecheckQueue([row('legacy'),row('legacy2',{additionalActions:[{id:'a1',title:'old'}]})],now);
  expect(items).toEqual([]);
  expect(summarizeLocalRecheckQueue(items).total).toBe(0);
 });
 it('counts target records, not recheck events or inspected photos, and does not mutate input',()=>{
  const record=row('r1',{followup:followup('pending','2026-11-01'),rechecks:[
   recheck('delayed','2026-10-31'),recheck('needs_more','2026-11-01'),
  ]});
  const original=JSON.stringify(record);
  const queue=buildLocalRecheckQueue([record],now);
  expect(queue).toHaveLength(1);
  expect(summarizeLocalRecheckQueue(queue)).toMatchObject({total:1,today:1,overdue:0});
  expect(JSON.stringify(record)).toBe(original);
  expect(LOCAL_RECHECK_BUCKETS).toHaveLength(7);
 });
 it('keeps invalid or missing deadlines visibly unscheduled rather than inferring safe completion',()=>{
  const queue=buildLocalRecheckQueue([
   row('bad',{followup:followup('pending','2026-02-30')}),
   row('missing',{followup:followup('in_progress','')}),
  ],now);
  expect(queue.every((item:any)=>item.bucket==='unscheduled')).toBe(true);
 });
});
