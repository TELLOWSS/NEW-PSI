/**
 * F10/56: informational four-step workflow for deferred field corrections.
 * Existing offline data only; no saved-schema change, automatic contact,
 * safety judgment, completion approval, or network call.
 */
import {buildLocalRecheckQueue,localCalendarDate} from './localRecheckQueue.mjs';
import {analyzeFollowupChangeTrace,TEMPORARY_CONTROL_REVIEWS} from './localFollowupChangeTrace.mjs';

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
   detail:dueDate?'계획된 조치 목표일: '+dueDate:'목표 기한 미정 · 재점검 예정일과 별개'},
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

/**
 * F10/57: transparent recording-gap and schedule attention, not risk ranking.
 * Reuses the F10 read-only queue's conflict/overdue rules, including its
 * verification-after-recheck precedence and device-local calendar date.
 * A recorded control is NOT considered physically implemented.
 */
export function buildDeferredActionAttention(followup,rechecks=[],now=new Date()){
 const history=Array.isArray(rechecks)?rechecks:[];
 const guide=buildDeferredActionGuide(followup,history);
 const controlReview=analyzeFollowupChangeTrace(followup).latestControlReview;
 const siteChecked=controlReview===TEMPORARY_CONTROL_REVIEWS.site_checked;
 const flags=[];
 const add=(key,label,detail,kind='missing')=>flags.push({key,label,detail,kind});
 if(!guide.stages[0].recorded)
  add('assignee','담당자 미지정','기기 기록에 담당자가 없습니다. 담당자 연락·수신 여부는 별도 확인하세요.');
 if(!guide.stages[1].recorded)
  add('temporary','임시 안전조치 미기록','실제 임시통제 실시 여부는 이 기록만으로 알 수 없습니다.');
 else if(!siteChecked)
  add('temporary-unverified','임시 안전조치 확인 기록 미흡','임시조치 내용은 있으나 점검자 현장 유지 확인 기록이 없습니다. 실제 시행·유지는 자동 확인되지 않습니다.','review');
 if(!guide.stages[2].recorded)
  add('due','조치 목표 기한 미정','조치 목표일은 재점검 예정일과 별개로 기록해야 합니다.');
 if(!guide.stages[3].recorded)
  add('recheck','재점검 이력 미기록','후속 확인·지연 사유 이력이 아직 없습니다.','review');
 const rows=buildLocalRecheckQueue([{id:'local-guide-preview',followup,rechecks:history}],now);
 const queue=rows[0]||null;
 if(queue?.bucket==='conflict')
  add('conflict','완료 입력·재점검 내용 상충','완료 상태와 최신 미완료 재점검 기록이 다릅니다. 점검자가 이력 순서와 현장 상태를 다시 확인하세요.','conflict');
 else if(queue?.bucket==='overdue'){
  const src=queue.dateSource==='재점검 예정일'?'재점검 예정일':'조치 목표일';
  add('overdue',src+' 경과','기기 날짜 '+localCalendarDate(now)+' 기준, 기록된 '+src+' '+queue.date+'이 지났습니다. 실제 조치 완료·연락 여부는 확인되지 않았습니다.','overdue');
 }else if(queue?.bucket==='today'){
  add('today',queue.dateSource+' 오늘 도래','기기 날짜 기준 확인 예정입니다. 담당자에게 자동 통보되지 않습니다.','review');
 }
 // A manually entered "verified" value can only be represented as recorded,
 // never as an automatic approval, even when no flags are returned.
 return {flags,queueBucket:queue?.bucket||'unrecorded',asOf:localCalendarDate(now),
  controlReview:siteChecked?'inspector-reported':'not-site-confirmed',verifiedByDevice:false};
}
