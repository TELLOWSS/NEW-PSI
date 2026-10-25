import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {calendarDueDate,buildRegisteredActionRequest} from '../lib/inspector/actionPlan';
import {actionDeadlinePhase,actionDeadlineText} from '../lib/inspector/workQueue';
import {summarizeActionRadar} from '../lib/inspector/actionRadar';
import {validateDocument} from '../lib/inspector/validation';
import {changeActionAssignment} from '../lib/inspector/actionAssignment';
import {newInspectionDocument,type InspectorAction} from '../lib/inspector/types';
const photo='aabbccdd-1234-4567-8901-123456789abc',insId='bbaaccdd-1234-4567-8901-123456789abc',aid='ccaabbdd-1234-4567-8901-123456789abc';
const action=(dueDate:string,extra:Partial<InspectorAction>={}):InspectorAction=>({
 id:aid,title:'난간 보완',owner:'형틀반장',dueDate,status:'open',completionPhotoId:'',note:'조치 전 사진 1건',sourcePhotoIds:[photo],...extra
});
const makeDoc=(a:InspectorAction)=>{
 const doc=newInspectionDocument();doc.photoIds=[photo];doc.actions=[a];return doc;
};
const evidence=[{id:photo,inspection_id:insId,sha256:'a'.repeat(64),mime_type:'image/jpeg',byte_size:123,created_at:'2026-10-25T01:00:00Z'}];
const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
describe('scheduled/consulting inspection remedies preserve deadline and safety distinction',()=>{
 it('supports same-day, one-day, two-day and custom deadlines over month and year boundaries',()=>{
  expect(calendarDueDate('2026-10-26',0)).toBe('2026-10-26');
  expect(calendarDueDate('2026-10-26',1)).toBe('2026-10-27');
  expect(calendarDueDate('2026-10-26',2)).toBe('2026-10-28');
  expect(calendarDueDate('2026-12-31',2)).toBe('2027-01-02');
  expect(calendarDueDate('2028-02-28',2)).toBe('2028-03-01');
 });
 it('shows scheduled, today, overdue, review-pending and verified as separate dimensions',()=>{
  const now='2026-10-26';
  expect(actionDeadlinePhase(action('2026-10-28'),now)).toBe('scheduled');
  expect(actionDeadlineText(action('2026-10-28'),now)).toContain('D-2');
  expect(actionDeadlinePhase(action('2026-10-26'),now)).toBe('today');
  expect(actionDeadlinePhase(action('2026-10-25'),now)).toBe('overdue');
  expect(actionDeadlinePhase(action('2026-10-25',{status:'review-requested',completionPhotoId:photo}),now)).toBe('reinspection');
  expect(actionDeadlinePhase(action('2026-10-25',{status:'verified',verifiedAt:'2026-10-26T09:00:00Z'}),now)).toBe('verified');
  expect(actionDeadlinePhase(action('bad'),now)).toBe('unknown');
 });
 it('does not turn an agreed future due date into a late or immediate work-stop determination',()=>{
  const rows=[action('2026-10-27'),{...action('2026-10-28'),id:'ddaaccbb-1234-4567-8901-123456789abc'}];
  const before=JSON.stringify(rows),s=summarizeActionRadar(rows,'2026-10-26');
  expect(s).toMatchObject({scheduled:2,overdue:0,dueToday:0,open:2,awaitingReinspection:0});
  expect(s.immediateMessage).toContain('약정기한 내 진행 중');
  expect(s.immediateMessage).toContain('임시 보호조치');
  expect(JSON.stringify(rows)).toBe(before);
 });
 it('persists original worksite due-date reason without breaking legacy actions',()=>{
  const reason='자재 반입 후 이틀 이내 조치하고 그 전까지 출입 통제 유지';
  const next=makeDoc(action('2026-10-28',{scheduleContext:reason}));
  expect(validateDocument(next,insId,evidence)).toBe(next);
  expect(validateDocument(makeDoc(action('2026-10-28')),insId,evidence).actions[0].scheduleContext).toBeUndefined();
  expect(()=>validateDocument(makeDoc(action('2026-10-28',{scheduleContext:'x'.repeat(301)})),insId,evidence)).toThrow();
  const dispatch=buildRegisteredActionRequest(next.actions,'정기점검',next.photoIds);
  expect(dispatch).toContain('기한 설정 근거·현장 여건: '+reason);
  const update=changeActionAssignment(next,{before:next.actions[0],owner:'비계반장',dueDate:'2026-10-29',reason:'예정 자재 입고 일정이 변경되었습니다'});
  expect(update.actions[0].scheduleContext).toBe(reason);
  expect(update.actions[0].note).toContain('변경');
 });
 it('keeps immediate danger assessment separate, while all four output surfaces show due-date context',()=>{
  const planner=read('components/inspector/InspectorActionPlanner.tsx');
  const assignment=read('components/inspector/InspectorAssignmentEditor.tsx');
  for(const s of [planner,assignment]){expect(s).toContain("[2,'2일']");expect(s).toContain("[7,'7일']");}
  expect(planner).toContain('현장 여건·기한 설정 근거');
  expect(planner).toContain('급박한 위험은 기한과 별개');
  expect(read('components/inspector/InspectorActionRadar.tsx')).toContain('기한 내 진행');
  expect(read('components/inspector/InspectorReport.tsx')).toContain('최초 약정기한 설정 근거');
  expect(read('lib/inspector/educationHandoff.ts')).toContain('최초 기한 설정 근거');
 });
});
