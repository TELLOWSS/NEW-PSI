import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import type {InspectorAction} from '../lib/inspector/types';
import {scheduledCorrectionRows,scheduledCorrectionTotals} from '../lib/inspector/actionSchedule';

const action=(id:string,date:string,status:InspectorAction['status']='open',add:Partial<InspectorAction>={}):InspectorAction=>({
 id,title:'비계 발판 점검 '+id,owner:'비계반장',dueDate:date,status,completionPhotoId:'',note:'',
 ...add,
});
const day='2026-10-27';
describe('Inspector scheduled regular/consulting corrections, preserved independent dimensions',()=>{
 it('shows an in-deadline regular-inspection correction without claiming immediate completion',()=>{
  const [row]=scheduledCorrectionRows([action('A','2026-10-29')],day);
  expect(row.kind).toBe('scheduled');
  expect(row.deadlineLabel).toContain('D-2');
  expect(row.nextStep).toContain('임시 보호조치');
  expect(row.evidenceSubmitted).toBe(false);
 });
 it('shows an overdue submitted correction as BOTH date-passed and reinspection-pending',()=>{
  const [row]=scheduledCorrectionRows([action('A','2026-10-25','review-requested',{completionPhotoId:'after-photo'})],day);
  expect(row.kind).toBe('deadline-passed');
  expect(row.deadlineLabel).toContain('기한 경과');
  expect(row.deadlineLabel).toContain('재점검 대기');
  expect(row.evidenceSubmitted).toBe(true);
  expect(row.deadlinePassed).toBe(true);
  expect(scheduledCorrectionTotals([row]).overlappingPastDueReinspection).toBe(1);
  expect(row.nextStep).not.toContain('위반');
 });
 it('submitted evidence before the due date is STILL pending human reinspection',()=>{
  const [row]=scheduledCorrectionRows([action('A','2026-10-29','review-requested')],day);
  expect(row.kind).toBe('reinspection');
  expect(row.deadlineLabel).toContain('기한 내');
  expect(row.deadlineLabel).toContain('재점검 대기');
  expect(row.nextStep).toContain('재점검');
 });
 it('a today-due open correction is not marked overdue',()=>{
  const [row]=scheduledCorrectionRows([action('A',day)],day);
  expect(row.kind).toBe('due-today');
  expect(row.deadlinePassed).toBe(false);
  expect(row.deadlineLabel).toContain('오늘');
 });
 it('invalid and empty dates or owners require confirmation, not invented deadlines',()=>{
  const rows=scheduledCorrectionRows([
   action('A','not-a-date'),action('B','2026-10-29','open',{owner:'  '}),
  ],day);
  expect(rows).toHaveLength(2);
  expect(rows.every(row=>row.kind==='assignment-needed')).toBe(true);
  expect(rows[0].nextStep).toContain('담당자와 약정기한');
 });
 it('a verified correction never returns to the outstanding schedule',()=>{
  const rows=scheduledCorrectionRows([action('A','2026-10-01','verified'),action('B','2026-10-29')],day);
  expect(rows.map(row=>row.actionId)).toEqual(['B']);
  expect(scheduledCorrectionTotals(rows).unresolved).toBe(1);
 });
 it('sorts past-due first, then submitted evidence, today, missing assignment, future',()=>{
  const rows=scheduledCorrectionRows([
   action('future','2026-10-30'),
   action('missing',''),
   action('review','2026-10-29','review-requested'),
   action('today',day),
   action('overdue','2026-10-23'),
  ],day);
  expect(rows.map(r=>r.actionId)).toEqual(['overdue','review','today','missing','future']);
 });
 it('clearly flags category overlap instead of summing double-counted metrics',()=>{
  const rows=scheduledCorrectionRows([
   action('one','2026-10-25','review-requested'),
   action('two','2026-10-25'),
   action('three','2026-10-29','review-requested'),
  ],day);
  expect(scheduledCorrectionTotals(rows)).toMatchObject({
   unresolved:3,deadlinePassed:2,awaitingReinspection:2,overlappingPastDueReinspection:1,
  });
 });
 it('never mutates inspection records and remains deterministic over 1000 reorders',()=>{
  const records=[
   action('A','2026-10-26','review-requested'),
   action('B','2026-10-30'),
   action('C','2026-10-25'),
   action('D','2026-10-29','review-requested'),
   action('E','2026-10-29','verified'),
  ];
  const before=JSON.stringify(records),baseline=scheduledCorrectionRows(records,day);
  let seed=0x20261027;
  for(let n=0;n<1000;n++){
   const copy=[...records];
   for(let k=copy.length-1;k>0;k--){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const i=seed%(k+1);[copy[k],copy[i]]=[copy[i],copy[k]];
   }
   expect(scheduledCorrectionRows(copy,day)).toEqual(baseline);
  }
  expect(JSON.stringify(records)).toBe(before);
 });
 it('uses only saved one-inspection action records and no extra API/PII transfer',()=>{
  const helper=readFileSync('lib/inspector/actionSchedule.ts','utf8');
  expect(helper).not.toMatch(/fetch\s*\(|\/api\/|localStorage|sessionStorage|setInterval|supabase/i);
  const ui=readFileSync('components/inspector/InspectorActionRadar.tsx','utf8');
  expect(ui).toContain('data-psi-correction-schedule="saved-only"');
  expect(ui).toContain('기한부 개선조치 일정 보기');
  expect(ui).toContain('onOpenPriorityAction(row.actionId)');
  expect(ui).toContain('사진의 실제 제출시점과 이행기한 준수 여부도 이 일정표만으로 판단할 수 없습니다.');
 });
 it('retains the existing free Vercel function contract without adding cron',()=>{
  const v=JSON.parse(readFileSync('vercel.json','utf8')) as {fluid:boolean;functions:Record<string,{maxDuration:number}>;crons?:unknown[]};
  expect(v.fluid).toBe(true);expect(v.crons||[]).toEqual([]);
  expect(Object.keys(v.functions).sort()).toEqual(['api/admin.ts','api/gateway.ts','api/inspection-share.ts'].sort());
  expect(Object.values(v.functions).every(x=>x.maxDuration<=300)).toBe(true);
 });
});