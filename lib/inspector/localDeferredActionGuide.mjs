/**
 * F10/56: informational four-step workflow for deferred field corrections.
 * Existing offline data only; no saved-schema change, automatic contact,
 * safety judgment, completion approval, or network call.
 */
export function buildDeferredActionGuide(followup,rechecks=[]){
 const history=Array.isArray(rechecks)?rechecks:[];
 const last=history.at(-1)||null;
 const assignee=typeof followup?.assignee==='string'?followup.assignee.trim():'';
 const temporaryMeasure=typeof followup?.temporaryMeasure==='string'?followup.temporaryMeasure.trim():'';
 const dueDate=typeof followup?.dueDate==='string'?followup.dueDate:'';
 const stages=[
  {key:'assignee',label:'담당자 지정',recorded:!!assignee,
   detail:assignee?'기록된 담당자: '+assignee:'담당자를 기록하지 않았습니다'},
  {key:'temporary',label:'임시 안전조치',recorded:!!temporaryMeasure,
   detail:temporaryMeasure?'점검자 기록 있음 · 실제 시행·유지 여부 별도 확인':'미기록 · 시행 여부 추정 불가'},
  {key:'due',label:'조치 목표 기한',recorded:!!dueDate,
   detail:dueDate?'목표 기한: '+dueDate:'목표 기한 미정 · 재점검 예정일과 별개'},
  {key:'recheck',label:'지연 사유·재점검',recorded:history.length>0,
   detail:last?'재점검 이력 '+history.length+'건 · 다음 확인: '+(last.nextCheckDate||'미정'):'재점검 이력 없음 · 현장 확인 필요'},
 ];
 const outstanding=stages.filter(x=>!x.recorded).map(x=>x.label);
 return {
  stages,
  next:outstanding[0]||null,
  recorded:stages.filter(x=>x.recorded).length,
  total:stages.length,
  incomplete:outstanding,
  lastRecheckResult:last?.result||null,
  // Even four entered fields never prove physical completion or permission to resume.
  isPhysicalWorkVerified:false,
 };
}
