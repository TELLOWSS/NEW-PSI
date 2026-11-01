/**
 * NEW-PSI F10 · local, manual duty handover for deferred corrective actions.
 * Not an incident determination, an automatic notice, or a permit to resume.
 * Never includes photo bytes, worker names, free-text details or full digests.
 */
import {buildLocalRecheckQueue,LOCAL_RECHECK_LABELS,localCalendarDate} from './localRecheckQueue.mjs';
import {buildLocalRecheckReport,selectLocalRecheckReportTargets} from './localRecheckReport.mjs';

export const F10_HANDOFF_VERSION='psi-f10-local-handoff-v1';
export const F10_HANDOFF_MAX_ITEMS=40;
export const F10_HANDOFF_NOTICE=
 '관리용 인계 초안입니다. 이 기기에서 작성한 기록을 기반으로 하며 통보·수신·현장 재확인·위험 해소·작업 재개 승인을 의미하지 않습니다. 임시조치 미기록은 실제 조치 미실시를 뜻하지 않습니다. 급박한 위험은 작업중지·접근통제 필요성을 우선 검토하세요.';

const primaryBuckets=new Set(['conflict','overdue','today','soon','unscheduled']);
const isOpen=item=>item.bucket!=='verified';
/**
 * Handover includes every unscheduled or due item, plus later-scheduled
 * items that lack an assignee. Merely recorded as verified is excluded unless
 * it conflicts with a newer unfinished recheck.
 */
export function selectLocalHandoffTargets(queue){
 if(!Array.isArray(queue))return [];
 // Unknown next dates need an explicit owner/date decision before later planned tasks.
 // This is *administrative* triage, not an automatic risk-severity ranking.
 const order=new Map(['conflict','overdue','today','soon','unscheduled','scheduled']
  .map((bucket,index)=>[bucket,index]));
 return queue.filter(item=>primaryBuckets.has(item.bucket)||
   (isOpen(item)&&item.bucket==='scheduled'&&item.hasAssignee!==true))
  // Stable sort retains F10's earlier-due-date-first order within each bucket.
  .sort((a,b)=>(order.get(a.bucket)??99)-(order.get(b.bucket)??99));
}
const safeText=(value,max=200)=>typeof value==='string'?value.slice(0,max).trim():'';
const cleanLine=value=>safeText(String(value??''),320)
 .replace(/[\u0000-\u001f\u007f-\u009f]/g,' ')
 .replace(/\s+/g,' ');
const csvSafeShort=value=>{
 const text=cleanLine(value);
 // Literal text copied to chat/notes, never an untrusted protocol or formula.
 return /^[\s\u200b-\u200f\ufeff]*[=+\-@]/u.test(text)?"'"+text:text;
};

/**
 * Construct the plan from selected priorities and existing *local* records.
 * All downstream text/HTML is generated from these sanitized fields.
 */
export function buildLocalHandoffPlan(records,now=new Date(),filter='all',scope='all'){
 if(!Array.isArray(records)||!Number.isFinite(now.getTime()))
  throw new Error('기기 점검 기록이나 날짜를 확인할 수 없습니다.');
 const queue=buildLocalRecheckQueue(records,now);
 const selected=selectLocalRecheckReportTargets(records,queue,filter,scope,now);
 const targets=selectLocalHandoffTargets(selected);
 if(!targets.length)
  throw new Error('현재 선택한 범위에 인계 대상이 없습니다. 전체 관리대장을 확인하세요.');
 if(targets.length>F10_HANDOFF_MAX_ITEMS)
  throw new Error('인계 대상이 40건을 초과했습니다. 상태 필터로 나누어 인계하세요. 누락된 대상이 없도록 전체 관리대장도 확인하세요.');
 const report=buildLocalRecheckReport(targets,records,{
  generatedAt:now,scopeLabel:scope==='all'?'모든 점검의 인계 대상':'현재 필터의 인계 대상',
  includeAssignees:false,includeDetails:false,
 });
 const entries=report.entries.map((entry,index)=>{
  const source=targets[index];
  const missingAssignee=source.hasAssignee!==true;
  const missingTemporary=source.hasTemporaryMeasure!==true;
  const flags=[
   ...(source.bucket==='conflict'?['완료·재점검 기록 상충, 담당자 직접 확인']:[]),
   ...(missingAssignee?['담당자 기록 확인']:[]),
   ...(missingTemporary&&source.bucket!=='verified'?['임시 통제 기록 확인']:[]),
   ...(!source.date?['다음 확인일 결정']:[]),
  ];
  return {
   order:index+1,
   bucket:source.bucket,
   urgency:entry.bucketLabel,
   site:entry.site,
   action:entry.label,
   nextDate:entry.date||'미정',
   dateSource:entry.dateSource,
   status:entry.status,
   lastRecheck:entry.recheckResult,
   flags,
   assigneeRecorded:!missingAssignee,
   temporaryRecorded:!missingTemporary,
  };
 });
 const summary={
  total:entries.length,
  conflict:entries.filter(e=>e.bucket==='conflict').length,
  overdue:entries.filter(e=>e.bucket==='overdue').length,
  today:entries.filter(e=>e.bucket==='today').length,
  soon:entries.filter(e=>e.bucket==='soon').length,
  unscheduled:entries.filter(e=>e.bucket==='unscheduled').length,
  scheduledUnassigned:entries.filter(e=>e.bucket==='scheduled').length,
  missingAssignee:entries.filter(e=>!e.assigneeRecorded).length,
  missingTemporary:entries.filter(e=>!e.temporaryRecorded).length,
 };
 return {
  format:F10_HANDOFF_VERSION,
  createdAt:now.toISOString(),localDate:localCalendarDate(now),
  scope:report.scopeLabel,
  summary,entries,notice:F10_HANDOFF_NOTICE,
 };
}

export function formatLocalHandoffMessage(plan){
 const lines=[
  '[PSI F10] 지연 조치 · 재점검 인계 초안',
  '기준일(기기): '+cleanLine(plan.localDate),
  '조회: '+cleanLine(plan.scope),
  '인계 대상 '+plan.summary.total+'건 (상태 불일치 '+plan.summary.conflict+
   ', 초과 '+plan.summary.overdue+', 오늘 '+plan.summary.today+
   ', 3일 내 '+plan.summary.soon+', 일정 미정 '+plan.summary.unscheduled+
   ', 이후 예정 중 담당 미기록 '+plan.summary.scheduledUnassigned+')',
  '담당자 미기록 '+plan.summary.missingAssignee+
   '건 / 임시조치 미기록 '+plan.summary.missingTemporary+'건',
  '',
 ];
 for(const e of plan.entries){
  lines.push(e.order+'. ['+cleanLine(e.urgency)+'] '+csvSafeShort(e.site));
  lines.push('   조치: '+csvSafeShort(e.action)+' / 확인일: '+cleanLine(e.nextDate));
  lines.push('   현재 기록: '+cleanLine(e.status)+' / 최신 재점검: '+cleanLine(e.lastRecheck));
  if(e.flags.length)lines.push('   확인 필요: '+e.flags.map(cleanLine).join(' · '));
 }
 lines.push('',cleanLine(plan.notice));
 return lines.join('\n');
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
}[c]));
export function formatLocalHandoffHtml(plan){
 const lines=plan.entries.map(entry=>
  '<tr><td>'+escape(entry.order)+'</td>'+
  '<td>'+escape(entry.urgency)+'</td>'+
  '<td>'+escape(entry.site)+'</td>'+
  '<td>'+escape(entry.action)+'</td>'+
  '<td>'+escape(entry.nextDate)+'</td>'+
  '<td>'+escape(entry.status)+'</td>'+
  '<td>'+escape(entry.flags.join(' · ')||'추가 표시 없음')+'</td></tr>'
 ).join('\n');
 return '<!doctype html><html lang="ko"><head><meta charset="utf-8">'+
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src \'none\'; base-uri \'none\'; form-action \'none\'">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>PSI F10 지연 조치 인계표</title>'+
  '<style>@page{size:A4 landscape;margin:12mm}body{font:12px/1.5 system-ui,Arial,sans-serif;color:#162734;margin:12px auto;max-width:1100px}h1{font-size:18px;margin:3px 0}h2{font-size:12px}p{margin:6px 0;overflow-wrap:anywhere}.note{padding:9px;border:1px solid #87949a}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:10px}th,td{border:1px solid #a0aab0;padding:5px;overflow-wrap:anywhere;text-align:left;vertical-align:top}th{background:#eaeef1}tr{break-inside:avoid}thead{display:table-header-group}.summary{font-weight:700}@media print{body{margin:0}}</style>'+
  '</head><body><h1>PSI F10 · 지연 조치 현장 인계표</h1>'+
  '<p>기준일(기기) '+escape(plan.localDate)+' · '+escape(plan.scope)+
  ' · 조치 대상 '+escape(plan.summary.total)+'건</p>'+
  '<p class="summary">상태 불일치 '+escape(plan.summary.conflict)+
  ' / 초과 '+escape(plan.summary.overdue)+
  ' / 오늘 '+escape(plan.summary.today)+
  ' / 3일 내 '+escape(plan.summary.soon)+
  ' / 일정 미정 '+escape(plan.summary.unscheduled)+
  ' / 이후 예정 중 담당 미기록 '+escape(plan.summary.scheduledUnassigned)+'</p>'+
  '<p class="summary">담당 미기록 '+escape(plan.summary.missingAssignee)+
  '건 · 임시조치 미기록 '+escape(plan.summary.missingTemporary)+'건</p>'+
  '<p class="note">'+escape(plan.notice)+'</p>'+
  '<table><thead><tr>'+
  ['번호','관리 분류','현장 정보(점검자 입력)','대상 조치','다음 확인일','현재 상태','확인할 기록']
   .map(x=>'<th>'+escape(x)+'</th>').join('')+
  '</tr></thead><tbody>'+lines+'</tbody></table>'+
  '<p>담당자 실명·사진 파일·자유기입 지연 사유는 이 요약에 포함되지 않습니다. 전체 내용은 별도 원본 점검 및 관리대장을 검토하세요.</p>'+
  '</body></html>';
}

/** Only relevant non-photo fields are needed to detect a concurrent tab edit. */
export function handoffSourceSnapshot(records){
 return JSON.stringify((Array.isArray(records)?records:[]).map(record=>({
  id:record.id,note:record.note,action:record.action,
  siteContext:record.siteContext,
  followup:record.followup,
  rechecks:record.rechecks,
  actions:(record.additionalActions||[]).map(a=>({
   id:a.id,title:a.title,followup:a.followup,rechecks:a.rechecks,
  })),
 })));
}
