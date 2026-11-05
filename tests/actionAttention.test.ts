import {describe,it,expect} from 'vitest';
import {actionAttentionBoard} from '../lib/inspector/actionAttention';
import type {InspectorAction} from '../lib/inspector/types';

const aid=(i:number)=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
const action=(i:number,status:InspectorAction['status']='open',dueDate='2026-11-10',scheduleContext?:string):InspectorAction=>({
 id:aid(i),title:'현장 조치 '+i,owner:'형틀반',dueDate,status,completionPhotoId:'',
 note:'확인할 현장 조치',sourcePhotoIds:[],
 ...(scheduleContext?{scheduleContext}:{}),
});
const plan=(date:string)=>'즉시 조치 곤란(미조치 유지): 자재 반입 대기\n임시 보호조치 계획(시행 미확인): 작업구역 통제 검토\n다음 현장 확인 예정: '+date;
describe('R117 attention board: saved inspection-only followthrough without completion claims',()=>{
 it('separates deadline elapsed, today-or-past field check, received evidence and today due',()=>{
  const arr=[
   action(1,'open','2026-11-05',plan('2026-11-06')),
   action(2,'review-requested','2026-11-05',plan('2026-11-04')),
   action(3,'open','2026-11-12',plan('2026-11-06')),
   action(4,'open','2026-11-06'),
   action(5,'verified','2026-11-04',plan('2026-11-04')),
   action(6,'open','2026-11-12',plan('2026-11-07')),
  ];
  const before=JSON.stringify(arr),v=actionAttentionBoard(arr,'2026-11-06');
  expect(v.unresolved).toBe(5);
  expect(v.groups.overdue.map(x=>x.actionId)).toEqual([aid(2),aid(1)]);
  expect(v.groups.check.map(x=>x.actionId)).toEqual([aid(2),aid(1),aid(3)]);
  expect(v.groups.reinspection.map(x=>x.actionId)).toEqual([aid(2)]);
  expect(v.groups.due.map(x=>x.actionId)).toEqual([aid(4)]);
  expect(v.uniqueAttention).toBe(4);
  expect(v.overlap).toBe(3);
  expect(v.groups.reinspection[0].evidenceSubmitted).toBe(true);
  expect(v.groups.check[0].checkLate).toBe(true);
  expect(v.groups.check[1].checkLate).toBe(false);
  expect(JSON.stringify(arr)).toBe(before);
 });
 it('ignores invalid next-check dates, arbitrary notes and verified actions',()=>{
  const arr=[action(1,'open','2026-11-10',plan('2026-02-30')),
   action(2,'open','2026-11-10','확인 예정일 협의 중'),
   action(3,'verified','2026-11-04',plan('2026-11-04'))];
  const v=actionAttentionBoard(arr,'2026-11-06');
  expect(v.uniqueAttention).toBe(0);
  expect(v.overlap).toBe(0);
  for(const kind of ['overdue','check','reinspection','due'] as const)expect(v.groups[kind]).toHaveLength(0);
 });
 it('does not mistake future checks or future deadlines as a today alert',()=>{
  const v=actionAttentionBoard([action(1,'open','2026-11-08',plan('2026-11-07'))],'2026-11-06');
  expect(v.uniqueAttention).toBe(0);
  expect(v.unresolved).toBe(1);
 });
 it('does not multiply unique work items when the same action has three alert reasons',()=>{
  const v=actionAttentionBoard([action(1,'review-requested','2026-11-05',plan('2026-11-04'))],'2026-11-06');
  expect(v.uniqueAttention).toBe(1);
  expect(v.overlap).toBe(2);
  expect(v.groups.overdue).toHaveLength(1);
  expect(v.groups.check).toHaveLength(1);
  expect(v.groups.reinspection).toHaveLength(1);
 });
 it('empty saved record does not imply site safety',()=>{
  const v=actionAttentionBoard([],'2026-11-06');
  expect(v.unresolved).toBe(0);
  expect(v.uniqueAttention).toBe(0);
 });
});
