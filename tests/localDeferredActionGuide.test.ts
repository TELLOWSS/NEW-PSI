import {describe,it,expect} from 'vitest';
import {buildDeferredActionGuide} from '../lib/inspector/localDeferredActionGuide.mjs';

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
