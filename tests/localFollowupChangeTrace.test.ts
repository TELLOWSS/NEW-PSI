import {describe,it,expect} from 'vitest';
import {prepareFollowupChange,analyzeFollowupChangeTrace,TEMPORARY_CONTROL_REVIEWS} from '../lib/inspector/localFollowupChangeTrace.mjs';
import {validateFollowup} from '../lib/inspector/localFollowup.mjs';
const start=new Date('2026-10-30T12:00:00.000Z');
const later=new Date('2026-11-01T12:00:00.000Z');
const initial={
 status:'in_progress',assignee:'합성 관리자',
 dueDate:'2026-11-03',temporaryMeasure:'임시 접근통제 및 안전표지 유지',
 note:'작업 중 통제 유지 상태를 다시 살펴봄',
 controlReview:'unchecked',
};
const changed={
 ...initial,
 dueDate:'2026-11-07',
 dueChangeReason:'자재 입고가 지연되어 목표 완료일을 변경함',
 temporaryMeasure:'통제구역 범위 확대 및 표지 유지',
 temporaryChangeReason:'상부 작업과 간섭이 있어 통제구역을 넓혔음',
 controlReview:'site_checked',
 note:'변경된 통제구역 표시를 현장에서 직접 확인했음',
};

describe('F10 v17 follow-up change trace without new storage schema',()=>{
 it('initial follow-up saves without demanding a prior deadline change reason',()=>{
  const value=prepareFollowupChange(undefined,initial,start);
  expect(validateFollowup(value)).toBe(true);
  expect(value.history).toHaveLength(1);
  expect(value.history[0].note).toContain('현장 유지 여부 미확인');
  expect(value.history[0].dueDate).toBe('2026-11-03');
  expect(analyzeFollowupChangeTrace(value).dueChangeCount).toBe(0);
 });
 it('fails closed for a changed deadline without an explicit reason',()=>{
  const before=prepareFollowupChange(undefined,initial,start);
  expect(()=>prepareFollowupChange(before,{...changed,dueChangeReason:''},later))
   .toThrow('목표 기한 변경');
  expect(()=>prepareFollowupChange(before,{...changed,dueChangeReason:'짧음'},later))
   .toThrow('목표 기한 변경');
 });
 it('requires an explanation for changed, removed or cleared temporary controls',()=>{
  const before=prepareFollowupChange(undefined,initial,start);
  expect(()=>prepareFollowupChange(before,{...changed,temporaryChangeReason:''},later))
   .toThrow('임시 안전조치');
  expect(()=>prepareFollowupChange(before,{
   ...initial,temporaryMeasure:'',temporaryChangeReason:'',
  },later)).toThrow('임시 안전조치');
 });
 it('records actual before-after dates, reasons and inspector-supplied control confirmation',()=>{
  const before=prepareFollowupChange(undefined,initial,start);
  const after=prepareFollowupChange(before,changed,later);
  const trace=analyzeFollowupChangeTrace(after);
  expect(trace).toMatchObject({
   dueChangeCount:1,controlChangeCount:1,
   latestControlReview:TEMPORARY_CONTROL_REVIEWS.site_checked,
   inconsistent:false,
  });
  expect(trace.entries[1]).toMatchObject({
   beforeDate:'2026-11-03',afterDate:'2026-11-07',
   beforeControl:'임시 접근통제 및 안전표지 유지',
   afterControl:'통제구역 범위 확대 및 표지 유지',
   dueReason:changed.dueChangeReason,controlReason:changed.temporaryChangeReason,
   dueChanged:true,controlChanged:true,
  });
  expect(validateFollowup(after)).toBe(true);
  expect(before.history).toHaveLength(1);
  expect(after.history).toHaveLength(2);
  expect(JSON.parse(JSON.stringify(after)).history).toEqual(after.history);
 });
 it('allows updates to notes/status without inventing a deadline change',()=>{
  const before=prepareFollowupChange(undefined,initial,start);
  const next=prepareFollowupChange(before,{
   ...initial,note:'금일 점검자 보고 내용만 보강함',
   controlReview:'recheck_needed',
  },later);
  expect(analyzeFollowupChangeTrace(next)).toMatchObject({
   dueChangeCount:0,controlChangeCount:0,
   latestControlReview:TEMPORARY_CONTROL_REVIEWS.recheck_needed,
  });
 });
 it('does not fabricate change reasons in legacy snapshots',()=>{
  const old={
   status:'pending',assignee:'',dueDate:'2026-11-08',
   temporaryMeasure:'통제선 유지',
   history:[
    {status:'pending',assignee:'',dueDate:'2026-11-03',
     temporaryMeasure:'통제선 유지',note:'과거 현장 기록',at:'2026-10-30T10:00:00.000Z'},
    {status:'pending',assignee:'',dueDate:'2026-11-08',
     temporaryMeasure:'통제선 유지',note:'과거 변경 내용만 기록',at:'2026-11-01T10:00:00.000Z'},
   ],
  };
  const trace=analyzeFollowupChangeTrace(old);
  expect(trace.dueChangeCount).toBe(1);
  expect(trace.entries[1].dueReason).toBeNull();
  expect(trace.entries[1].legacyReasonMissing).toBe(true);
  expect(trace.latestControlReview).toContain('기존 기록');
 });
 it('detects inconsistent current status instead of silently declaring confirmed',()=>{
  const before=prepareFollowupChange(undefined,initial,start);
  expect(analyzeFollowupChangeTrace({...before,status:'verified'}).inconsistent).toBe(true);
 });
 it('rejects invalid dates, excessive note size, malformed checks and full history',()=>{
  const before=prepareFollowupChange(undefined,initial,start);
  expect(()=>prepareFollowupChange(before,{...initial,dueDate:'2026-02-30'},later))
   .toThrow('상태·담당·기한');
  expect(()=>prepareFollowupChange(before,{...initial,controlReview:'invalid'},later))
   .toThrow('상태·담당·기한');
  expect(()=>prepareFollowupChange(before,{...initial,note:'a'.repeat(1700)},later))
   .toThrow('진행·확인');
  const full={...before,history:Array(500).fill(before.history[0])};
  expect(()=>prepareFollowupChange(full,initial,later)).toThrow('500건');
 });
});
