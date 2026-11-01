/**
 * F10 change trace for local deferred corrective actions.
 * Uses existing Followup.history snapshots: no new schema or cloud writes.
 * The source is inspector-entered records, not proof of physical controls.
 */
import {FOLLOWUP_STATES,validateFollowup} from './localFollowup.mjs';

export const TEMPORARY_CONTROL_REVIEWS={
  unchecked:'현장 유지 여부 미확인',
  record_only:'기록만 확인 · 현장 상태 미확인',
  site_checked:'점검자가 현장 유지 상태 직접 확인했다고 기록',
  recheck_needed:'재확인 필요 · 유지 상태 확정 불가',
};
const compact=value=>typeof value==='string'?value.trim().replace(/\s+/g,' '):'';
const normalized=value=>typeof value==='string'?value.trim():'';
const isDate=value=>value===''||
  typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  Number.isFinite(Date.parse(value+'T00:00:00Z'))&&
  new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const MARK='[PSI F10-29 기기 변경 기록]';
const NONE='미정';

/**
 * Explicit reason is mandatory for every change after the first snapshot.
 * A "site checked" selection remains the inspector's statement only.
 */
export function prepareFollowupChange(previous,input,at=new Date()){
 if(!(at instanceof Date)||!Number.isFinite(at.getTime()))
   throw new Error('기기의 날짜와 시간을 확인해 주세요.');
 const status=normalized(input.status),assignee=normalized(input.assignee);
 const dueDate=normalized(input.dueDate),temporaryMeasure=normalized(input.temporaryMeasure);
 const note=normalized(input.note);
 const dueReason=compact(input.dueChangeReason);
 const controlReason=compact(input.temporaryChangeReason);
 const review=input.controlReview||'unchecked';
 if(!FOLLOWUP_STATES.includes(status)||assignee.length>100||temporaryMeasure.length>1000||
  !isDate(dueDate)||!Object.hasOwn(TEMPORARY_CONTROL_REVIEWS,review))
  throw new Error('후속 조치의 상태·담당·기한·임시조치 입력을 확인해 주세요.');
 if(note.length<5||note.length>1600)
  throw new Error('진행·확인 내용은 5~1,600자로 기록해 주세요.');
 const dueChanged=!!previous&&dueDate!==previous.dueDate;
 const controlChanged=!!previous&&temporaryMeasure!==(previous.temporaryMeasure||'');
 if(dueChanged&&(dueReason.length<5||dueReason.length>500))
  throw new Error('목표 기한 변경 시 변경 사유를 5~500자로 입력해 주세요.');
 if(controlChanged&&(controlReason.length<5||controlReason.length>500))
  throw new Error('임시 안전조치 내용을 변경하거나 비울 때 변경·해제 사유를 5~500자로 기록해 주세요.');
 if(previous?.history?.length>=500)throw new Error('후속 이력이 500건에 도달해 추가 저장할 수 없습니다.');
 const sections=[
  MARK,
  dueChanged?'기한 변경 사유: '+dueReason:null,
  controlChanged?'임시조치 변경·해제 사유: '+controlReason:null,
  '임시조치 확인 수준: '+TEMPORARY_CONTROL_REVIEWS[review],
  '진행·확인 내용: '+note,
 ].filter(Boolean);
 const detailedNote=sections.join('\n');
 if(detailedNote.length>2000)
  throw new Error('변경 사유와 진행·확인 내용을 합쳐 2,000자 이내로 줄여 주세요.');
 const entry={
  status,assignee,dueDate,temporaryMeasure,
  note:detailedNote,at:at.toISOString(),
 };
 const result={status,assignee,dueDate,temporaryMeasure,history:[...(previous?.history||[]),entry]};
 if(!validateFollowup(result))throw new Error('저장할 후속 조치 이력을 검증하지 못했습니다.');
 return result;
}
const extract=(note,prefix)=>{
 if(typeof note!=='string'||!note.startsWith(MARK+'\n'))return null;
 const line=note.split('\n').find(value=>value.startsWith(prefix));
 return line?line.slice(prefix.length):null;
};
export function analyzeFollowupChangeTrace(followup){
 const history=Array.isArray(followup?.history)?followup.history:[];
 const entries=history.map((event,index)=>{
  const previous=index>0?history[index-1]:null;
  const changedDue=previous?previous.dueDate!==event.dueDate:false;
  const changedControl=previous?(previous.temporaryMeasure||'')!==(event.temporaryMeasure||''):false;
  return {
   at:event.at,
   beforeDate:previous?.dueDate||NONE,afterDate:event.dueDate||NONE,
   dueChanged:changedDue,
   beforeControl:previous?.temporaryMeasure||'',afterControl:event.temporaryMeasure||'',
   controlChanged:changedControl,
   dueReason:changedDue?extract(event.note,'기한 변경 사유: '):null,
   controlReason:changedControl?extract(event.note,'임시조치 변경·해제 사유: '):null,
   controlReview:extract(event.note,'임시조치 확인 수준: ')||'별도 확인 기록 없음 (기존 기록 포함)',
   status:event.status,
   legacyReasonMissing:changedDue&&!extract(event.note,'기한 변경 사유: '),
  };
 });
 const last=history.at(-1);
 const inconsistent=!!last&&(
  last.status!==followup.status||last.dueDate!==followup.dueDate||
  last.assignee!==followup.assignee||
  (last.temporaryMeasure||'')!==(followup.temporaryMeasure||'')
 );
 return {
  entries,
  dueChangeCount:entries.filter(event=>event.dueChanged).length,
  controlChangeCount:entries.filter(event=>event.controlChanged).length,
  latestControlReview:entries.at(-1)?.controlReview||'현장 유지 여부 확인 기록 없음',
  inconsistent,
 };
}
