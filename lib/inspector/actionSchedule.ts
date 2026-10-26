import type {InspectorAction} from './types.js';
import {actionDeadlinePhase,actionDeadlineText,overdueAction} from './workQueue.js';

/**
 * Read-only follow-through schedule for one saved inspection. An agreed deadline
 * is not an order to resume work or proof that a hazard was controlled.
 * All rows are per action, not deduplicated by person or inspection.
 */
export type ScheduledCorrectionRow={
 actionId:string;
 title:string;
 owner:string;
 dueDate:string;
 kind:'deadline-passed'|'reinspection'|'due-today'|'assignment-needed'|'scheduled';
 statusLabel:string;
 deadlineLabel:string;
 nextStep:string;
 deadlinePassed:boolean;
 evidenceSubmitted:boolean;
};
const validOwner=(action:InspectorAction)=>Boolean(action.owner?.trim());
const openDeadlinePhase=(action:InspectorAction,today:string)=>
 actionDeadlinePhase({...action,status:'open'},today);
const sortPriority:Record<ScheduledCorrectionRow['kind'],number>={
 'deadline-passed':0,reinspection:1,'due-today':2,'assignment-needed':3,scheduled:4,
};
export function scheduledCorrectionRows(
 actions:readonly InspectorAction[],today:string,
):ScheduledCorrectionRow[]{
 return actions.filter(action=>action.status!=='verified').map(action=>{
  const phase=openDeadlinePhase(action,today);
  const expired=overdueAction(action,today);
  const submitted=action.status==='review-requested';
  const missing=!validOwner(action)||phase==='unknown';
  const kind:ScheduledCorrectionRow['kind']=expired?'deadline-passed':
   submitted?'reinspection':phase==='today'?'due-today':missing?'assignment-needed':'scheduled';
  const deadlineLabel=phase==='unknown'?'약정기한 확인 필요':
   submitted?
    (expired?'기한 경과 · 개선사진 접수 · 재점검 대기':
     phase==='today'?'오늘 기한 · 개선사진 접수 · 재점검 대기':
     '기한 내 · 개선사진 접수 · 재점검 대기'):
    actionDeadlineText(action,today);
  const nextStep=submitted
   ? '현장 개선상태와 사진을 대조하고 재점검 결과를 기록하세요.'
   : !validOwner(action)||phase==='unknown'
   ? '담당자와 약정기한을 확인·보완하세요.'
   : expired?'약정기한 경과 사유·현재 보호조치·이행 상태를 현장에서 확인하세요.'
   : phase==='today'?'오늘 기한의 개선 진행상황과 임시 보호조치를 확인하세요.'
   : '약정기한까지 진행상황과 임시 보호조치를 확인하세요.';
  return {
   actionId:action.id,title:action.title,owner:action.owner,dueDate:action.dueDate,
   kind,statusLabel:submitted?'개선사진 접수 · 현장 재점검 대기':'개선 진행 · 현장 확인 전',
   deadlineLabel,nextStep,deadlinePassed:expired,evidenceSubmitted:submitted,
  };
 }).sort((a,b)=>sortPriority[a.kind]-sortPriority[b.kind]
     ||(a.dueDate||'9999').localeCompare(b.dueDate||'9999')
     ||a.actionId.localeCompare(b.actionId));
}
export function scheduledCorrectionTotals(rows:readonly ScheduledCorrectionRow[]){
 return {
  unresolved:rows.length,
  deadlinePassed:rows.filter(r=>r.deadlinePassed).length,
  awaitingReinspection:rows.filter(r=>r.evidenceSubmitted).length,
  overlappingPastDueReinspection:rows.filter(r=>r.deadlinePassed&&r.evidenceSubmitted).length,
  dueToday:rows.filter(r=>r.kind==='due-today').length,
  scheduled:rows.filter(r=>r.kind==='scheduled').length,
  missingAssignment:rows.filter(r=>r.kind==='assignment-needed').length,
 };
}
