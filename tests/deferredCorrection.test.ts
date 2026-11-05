import {describe,it,expect} from 'vitest';
import {deferredCorrectionContext,deferredCheckDate} from '../lib/inspector/deferredCorrection.js';

const base={
 enabled:true,
 reason:'안전난간 자재 입고 일정 확인 필요',
 temporaryPlan:'작업구역 접근통제와 출입 제한 방안 현장 검토',
 nextCheckDate:'2026-11-06',
 today:'2026-11-05',
 dueDate:'2026-11-09',
 deadlineRationale:'자재 입고 후 설치 예정',
};
describe('R116 deferred correction plan is open, unverified, and date-bounded',()=>{
 it('preserves the existing schedule field and the explicit plan without claiming that controls were implemented',()=>{
  const r=deferredCorrectionContext(base);
  expect(r.ready).toBe(true);
  expect(r.error).toBe('');
  expect(r.text).toContain('자재 입고 후 설치 예정');
  expect(r.text).toContain('즉시 조치 곤란(미조치 유지)');
  expect(r.text).toContain('임시 보호조치 계획(시행 미확인)');
  expect(r.text).toContain('다음 현장 확인 예정: 2026-11-06');
  expect(deferredCheckDate(r.text)).toBe('2026-11-06');
  expect(r.text.length).toBeLessThanOrEqual(300);
 });
 it('requires an explicit substantive reason, a provisional safety plan, and a next inspection date',()=>{
  for(const edit of [
   {reason:'자재'}, {temporaryPlan:'미확인'},
   {nextCheckDate:''},{nextCheckDate:'2026-11-04'},{nextCheckDate:'2026-11-10'},{nextCheckDate:'2026-02-30'},
  ])expect(deferredCorrectionContext({...base,...edit}).ready).toBe(false);
 });
 it('rejects combined text longer than the server schedule field limit rather than truncating evidence',()=>{
  const r=deferredCorrectionContext({...base,deadlineRationale:'현장'.repeat(135)});
  expect(r.ready).toBe(false);
  expect(r.error).toMatch(/300자/);
 });
 it('does not invent delayed status or a next-check date for non-delayed records',()=>{
  const r=deferredCorrectionContext({...base,enabled:false});
  expect(r).toEqual({ready:true,text:base.deadlineRationale,error:''});
  expect(deferredCheckDate(r.text)).toBe('');
 });
 it('does not interpret arbitrary notes as scheduled checks',()=>{
  expect(deferredCheckDate('다음 현장 확인 예정일이 미정입니다.')).toBe('');
  expect(deferredCheckDate('다음 현장 확인 예정: 2026-02-30')).toBe('');
 });
});
