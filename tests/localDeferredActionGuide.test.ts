import {describe,it,expect} from 'vitest';
import {buildDeferredActionGuide,buildDeferredActionAttention} from '../lib/inspector/localDeferredActionGuide.mjs';

describe('F10-56 deferred correction field guide',()=>{
 it('does not invent assigned staff, temporary controls, deadline or reinspection',()=>{
  const guide=buildDeferredActionGuide(undefined,[]);
  expect(guide.recorded).toBe(0);
  expect(guide.next).toBe('담당자 지정');
  expect(guide.stages.map(s=>s.recorded)).toEqual([false,false,false,false]);
  expect(guide.isPhysicalWorkVerified).toBe(false);
 });
 it('tracks four separately recorded steps without claiming actual safety',()=>{
  const followup={status:'in_progress',assignee:'합성 관리자',temporaryMeasure:'점검자가 통제선 설치를 기록',dueDate:'2026-11-05'};
  const rechecks=[{result:'delayed',nextCheckDate:'2026-11-06'}];
  const guide=buildDeferredActionGuide(followup,rechecks);
  expect(guide.recorded).toBe(4);
  expect(guide.next).toBeNull();
  expect(guide.stages[2].detail).toContain('2026-11-05');
  expect(guide.stages[3].detail).toContain('2026-11-06');
  expect(guide.lastRecheckResult).toBe('delayed');
  expect(guide.isPhysicalWorkVerified).toBe(false);
 });
 it('never treats a pending or verified state as evidence of controls',()=>{
  const pending=buildDeferredActionGuide({status:'pending',assignee:'',temporaryMeasure:'',dueDate:''});
  const verified=buildDeferredActionGuide({status:'verified',assignee:'',temporaryMeasure:'',dueDate:''});
  expect(pending.stages).toEqual(verified.stages);
  expect(verified.recorded).toBe(0);
  expect(verified.isPhysicalWorkVerified).toBe(false);
 });
 it('does not confuse planned controls or recheck dates with completed work',()=>{
  const guide=buildDeferredActionGuide({assignee:'  ',temporaryMeasure:'안전난간 보수 예정',dueDate:''},
   [{result:'delayed',nextCheckDate:''}]);
  expect(guide.stages.map(x=>x.recorded)).toEqual([false,true,false,true]);
  expect(guide.next).toBe('담당자 지정');
  expect(guide.stages[1].detail).toContain('실제 시행·유지 여부 별도 확인');
  expect(guide.stages[3].detail).toContain('다음 확인: 미정');
 });
});

describe('F10-57 attention from already recorded offline facts',()=>{
 const now=new Date('2026-11-03T13:00:00+09:00');
 const state=(extra={})=>({status:'in_progress',assignee:'',temporaryMeasure:'',dueDate:'',...extra});
 const recheck=(date,result='delayed',at='2026-11-01T12:00:00Z')=>({
  id:'synthetic',result,nextCheckDate:date,at,reason:'합성 지연',
 });
 it('separates unknown assignee, unrecorded temporary controls, missing due and recheck',()=>{
  const attention=buildDeferredActionAttention(undefined,[],now);
  expect(attention.flags.map(f=>f.key)).toEqual(['assignee','temporary','due','recheck']);
  expect(attention.verifiedByDevice).toBe(false);
  expect(attention.asOf).toBe('2026-11-03');
  expect(attention.queueBucket).toBe('unrecorded');
 });
 it('keeps an entered but unconfirmed temporary measure distinct from no entry',()=>{
  const guide=buildDeferredActionAttention(state({assignee:'합성 책임자',temporaryMeasure:'출입통제 예정',dueDate:'2026-11-08'}),[],now);
  expect(guide.flags.map(f=>f.key)).toEqual(['temporary-unverified','recheck']);
  expect(guide.controlReview).toBe('not-site-confirmed');
  expect(guide.flags.some(f=>f.key==='temporary')).toBe(false);
  expect(guide.flags.some(f=>f.key==='overdue')).toBe(false);
 });
 it('detects a genuinely overdue recheck date, not an unrelated work due date',()=>{
  const followup=state({assignee:'합성 담당',temporaryMeasure:'출입통제',dueDate:'2026-11-10'});
  const info=buildDeferredActionAttention(followup,[recheck('2026-11-02')],now);
  expect(info.queueBucket).toBe('overdue');
  expect(info.flags.find(f=>f.key==='overdue').label).toBe('재점검 예정일 경과');
  expect(info.flags.find(f=>f.key==='overdue').detail).toContain('2026-11-02');
  expect(info.verifiedByDevice).toBe(false);
 });
 it('does not label an absent recheck as an overdue recheck when only the correction due date elapsed',()=>{
  const info=buildDeferredActionAttention(state({assignee:'담당',temporaryMeasure:'임시조치',dueDate:'2026-11-02'}),[],now);
  expect(info.queueBucket).toBe('overdue');
  expect(info.flags.find(f=>f.key==='overdue').label).toBe('조치 목표일 경과');
  expect(info.flags.some(f=>f.key==='recheck')).toBe(true);
 });
 it('keeps a missing next-recheck date unknown rather than reverting to the work deadline',()=>{
  const info=buildDeferredActionAttention(state({dueDate:'2026-10-01'}),[recheck('')],now);
  expect(info.queueBucket).toBe('unscheduled');
  expect(info.flags.some(f=>f.key==='overdue')).toBe(false);
 });
 it('does not mark future/today dates as overdue or mark completed work from 4/4 fields',()=>{
  const followup=state({assignee:'합성 담당',temporaryMeasure:'점검자 기록',dueDate:'2026-11-10'});
  const future=buildDeferredActionAttention(followup,[recheck('2026-11-10')],now);
  const today=buildDeferredActionAttention(followup,[recheck('2026-11-03')],now);
  expect(future.flags.some(f=>f.key==='overdue')).toBe(false);
  expect(today.flags.some(f=>f.key==='today')).toBe(true);
  expect(future.verifiedByDevice).toBe(false);
 });
 it('surfaces contradictory completed input and later incomplete recheck without approving work',()=>{
  const followup=state({status:'verified',assignee:'합성 책임자',temporaryMeasure:'임시조치',dueDate:'2026-11-02',history:[{
   status:'verified',assignee:'합성 책임자',temporaryMeasure:'임시조치',
   dueDate:'2026-11-02',note:'기기 확인 상태 기록',at:'2026-10-31T00:00:00Z',
  }]});
  const info=buildDeferredActionAttention(followup,[recheck('2026-11-01','delayed','2026-11-02T00:00:00Z')],now);
  expect(info.queueBucket).toBe('conflict');
  expect(info.flags.some(f=>f.key==='conflict')).toBe(true);
  expect(info.verifiedByDevice).toBe(false);
 });
 it('distinguishes an inspector-written site check from actual verified work',()=>{
  const followup=state({status:'in_progress',assignee:'담당자',temporaryMeasure:'통제선 기록',dueDate:'2026-11-10',history:[{
   status:'in_progress',assignee:'담당자',temporaryMeasure:'통제선 기록',
   dueDate:'2026-11-10',note:'[PSI F10-29 기기 변경 기록]\n임시조치 확인 수준: 점검자가 현장 유지 상태 직접 확인했다고 기록\n진행·확인 내용: 현장기록',at:'2026-11-02T11:00:00Z',
  }]});
  const info=buildDeferredActionAttention(followup,[recheck('2026-11-06')],now);
  expect(info.controlReview).toBe('inspector-reported');
  expect(info.flags.some(f=>f.key==='temporary-unverified')).toBe(false);
  expect(info.verifiedByDevice).toBe(false);
 });
});
