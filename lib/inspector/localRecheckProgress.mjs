/**
 * NEW-PSI F10 integrated history: local follow-up snapshots + independent
 * on-site reinspection entries. A chronological view of inspector INPUT,
 * not a verified chain of custody, legal finding or work-resumption approval.
 *
 * No DB migration, network request, notification or changes to v17 backups.
 */
import {analyzeFollowupChangeTrace} from './localFollowupChangeTrace.mjs';

export const F10_PROGRESS_EXPORT_LIMIT=1500;
export const F10_PROGRESS_NOTICE='시간은 사용 기기에서 기록한 시각이며 공인된 시각이 아닙니다. 완료·임시조치 확인은 점검자 입력으로, 안전조치 이행이나 작업 재개 승인을 증명하지 않습니다.';
const resultLabels={
 delayed:'조치 지연·미완료',
 temporary_checked:'임시 안전조치 현장 확인이라고 기록',
 needs_more:'재점검 결과 추가 보완 필요',
 review_requested:'조치 완료 여부 확인 요청',
};
const stateLabels={
 pending:'미조치 기록',
 in_progress:'조치 진행 기록',
 review_requested:'완료 확인 요청 기록',
 needs_work:'보완 필요 기록',
 verified:'확인 완료 입력 (안전 승인 아님)',
 unrecorded:'후속 상태 기록 없음',
};
const str=value=>typeof value==='string'?value:'';
const validAt=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)
 &&Number.isFinite(Date.parse(value+'T00:00:00Z'))
 &&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const cleanReason=(value,max=500)=>str(value).trim().slice(0,max);

/**
 * Builds a single target's timeline. Original arrays are never mutated.
 * Both histories are sorted by *untrusted device timestamps* with
 * deterministic source-order ties. It does not assert the true event order.
 */
export function buildLocalRecheckProgress(record,actionId=null,options={}){
 if(!record||typeof record.id!=='string')throw new Error('점검 기록이 없습니다.');
 const item=actionId==null?null:(Array.isArray(record.additionalActions)
  ?record.additionalActions.find(a=>a.id===actionId):null);
 if(actionId!==null&&!item)throw new Error('해당 조치 항목을 찾지 못했습니다.');
 const followup=item?item.followup:record.followup;
 const rechecks=item?item.rechecks:record.rechecks;
 const followups=Array.isArray(followup?.history)?followup.history:[];
 const inspections=Array.isArray(rechecks)?rechecks:[];
 const trace=analyzeFollowupChangeTrace(followup);
 const includeReasons=options.includeReasons===true;
 const events=[];
 for(const [index,entry] of followups.entries()){
  const detail=trace.entries[index];
  const kinds=[
   ...(detail?.dueChanged?['목표 기한 변경']:[]),
   ...(detail?.controlChanged?['임시 안전조치 변경']:[]),
  ];
  const title=kinds.length?kinds.join(' · '):
   index===0?'후속 조치 최초 입력':'후속 조치 진행 기록';
  events.push({
   id:'followup:'+index,kind:'followup',at:validAt(entry.at)?entry.at:'',
   sortAt:validAt(entry.at)?Date.parse(entry.at):Infinity,
   sequence:index,
   title,
   status:stateLabels[entry.status]||'후속 상태 확인 필요',
   dueDate:validDate(entry.dueDate)?entry.dueDate:'',
   nextCheckDate:null,
   dueBefore:detail?.dueChanged?detail.beforeDate:null,
   dueAfter:detail?.dueChanged?detail.afterDate:null,
   temporaryChanged:detail?.controlChanged===true,
   temporaryRecorded:!!str(entry.temporaryMeasure).trim(),
   controlReview:str(detail?.controlReview)||'임시조치 확인 수준 미기록',
   evidenceLinked:false,
   reason:includeReasons?[
    ...(detail?.dueChanged?[detail.dueReason?('기한 변경: '+cleanReason(detail.dueReason)):'기한 변경 사유 확인 불가 (과거 기록)']:[]),
    ...(detail?.controlChanged?[detail.controlReason?('임시조치 변경: '+cleanReason(detail.controlReason)):'임시조치 변경 사유 확인 불가 (과거 기록)']:[]),
   ].join(' / '):'',
   // Use only fields already recorded. Never infer actual verification.
  });
 }
 for(const [index,entry] of inspections.entries()){
  events.push({
   id:'recheck:'+index,kind:'recheck',at:validAt(entry.at)?entry.at:'',
   sortAt:validAt(entry.at)?Date.parse(entry.at):Infinity,
   sequence:followups.length+index,
   title:'재점검 · '+(resultLabels[entry.result]||'확인 필요'),
   status:stateLabels[entry.followupStatus]||'후속 상태 미기록',
   dueDate:null,
   nextCheckDate:validDate(entry.nextCheckDate)?entry.nextCheckDate:'',
   dueBefore:null,dueAfter:null,
   temporaryChanged:false,temporaryRecorded:null,
   controlReview:null,
   evidenceLinked:typeof entry.photoSha256==='string'&&entry.photoSha256.length>0,
   reason:includeReasons?cleanReason(entry.reason,500):'',
  });
 }
 events.sort((a,b)=>a.sortAt-b.sortAt||a.sequence-b.sequence);
 for(const e of events)delete e.sortAt;
 const latest=inspections.at(-1);
 return {
  recordId:record.id,
  actionId:item?.id||null,
  label:item?.title||'점검 전체',
  currentDueDate:validDate(followup?.dueDate)?followup.dueDate:'',
  // "no next recheck date" is never silently replaced with completion due.
  nextCheckDate:latest?(validDate(latest.nextCheckDate)?latest.nextCheckDate:''):null,
  latestRecheckStatus:latest?(resultLabels[latest.result]||'결과 확인 필요'):'재점검 이력 없음',
  lastControlReview:trace.latestControlReview,
  dueChangeCount:trace.dueChangeCount,
  temporaryChangeCount:trace.controlChangeCount,
  followupCount:followups.length,
  recheckCount:inspections.length,
  inconsistentFollowup:trace.inconsistent,
  total:events.length,
  events,
  notice:F10_PROGRESS_NOTICE,
 };
}
export function buildLocalRecheckProgressForTargets(records,queue,options={}){
 const byId=new Map((Array.isArray(records)?records:[]).filter(r=>r&&typeof r.id==='string').map(r=>[r.id,r]));
 const items=[];
 let totalEvents=0;
 for(const target of queue){
  const source=byId.get(target.recordId);
  if(!source)throw new Error('점검 기록이 변경돼 경과 이력을 만들 수 없습니다.');
  const timeline=buildLocalRecheckProgress(source,target.actionId,options);
  totalEvents+=timeline.total;
  if(totalEvents>F10_PROGRESS_EXPORT_LIMIT)
   throw new Error('경과 이력이 1,500건을 넘었습니다. 상태별로 보고 대상을 나누어 저장해 주세요.');
  items.push(timeline);
 }
 return {items,totalEvents};
}
