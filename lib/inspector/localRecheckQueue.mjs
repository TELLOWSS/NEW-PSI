/**
 * F10: read-only, browser-local follow-up prioritization.
 * A due-date classification is not a legal finding, a safety approval,
 * a notification to an assignee, or proof of corrective action.
 */
const DAY_MS=86400000;
export const LOCAL_RECHECK_BUCKETS=[
 'conflict','overdue','today','soon','scheduled','unscheduled','verified',
];
export const LOCAL_RECHECK_LABELS={
 conflict:'상태 불일치 · 확인 필요',
 overdue:'예정일 초과',
 today:'오늘 확인',
 soon:'3일 이내 확인',
 scheduled:'이후 예정',
 unscheduled:'일정 미정',
 verified:'확인 완료 기록',
};
const validDate=(value)=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const time=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
};
export const localCalendarDate=(now=new Date())=>[
 now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),
 String(now.getDate()).padStart(2,'0'),
].join('-');
const dateOffset=(value,today)=>{
 const utc=Date.parse(value+'T00:00:00Z');
 const base=Date.parse(today+'T00:00:00Z');
 return Math.round((utc-base)/DAY_MS);
};
const hasResult=(value)=>['delayed','temporary_checked','needs_more','review_requested'].includes(value);
const text=(value)=>typeof value==='string'?value:'';
/**
 * Returns one queue item per recorded follow-up target, not one per history
 * entry. The latest recheck wins; old history stays untouched in the record.
 * The first follow-up due date is used only before the first recheck.
 */
export function buildLocalRecheckQueue(records,now=new Date()){
 const today=localCalendarDate(now);
 const queue=[];
 for(const record of Array.isArray(records)?records:[]){
  if(!record||typeof record.id!=='string')continue;
  const targets=[
   {actionId:null,label:'점검 전체',followup:record.followup,rechecks:record.rechecks},
   ...(Array.isArray(record.additionalActions)?record.additionalActions:[]).map(action=>({
    actionId:action?.id,label:text(action?.title)||'조치 항목',
    followup:action?.followup,rechecks:action?.rechecks,
   })),
  ];
  for(const target of targets){
   const history=Array.isArray(target.rechecks)?target.rechecks:[];
   const latest=history.length?history[history.length-1]:null;
   const followup=target.followup;
   if(!latest&&!followup)continue;
   const reviewDate=latest?text(latest.nextCheckDate):text(followup?.dueDate);
   const valid=validDate(reviewDate);
   const status=text(followup?.status);
   const latestResult=hasResult(latest?.result)?latest.result:null;
   const lastFollowup=Array.isArray(followup?.history)?followup.history.at(-1):null;
   const lastVerifiedAt=lastFollowup?.status==='verified'?Date.parse(lastFollowup.at):NaN;
   const latestRecheckAt=latest?Date.parse(latest.at):NaN;
   // A later human verification can legitimately resolve an older recheck.
   // Without a verifiable order, do not silently hide a contradictory record.
   const resolvedAfterRecheck=Number.isFinite(lastVerifiedAt)&&
    Number.isFinite(latestRecheckAt)&&lastVerifiedAt>latestRecheckAt;
   const conflicting=status==='verified'&&
    (latestResult==='delayed'||latestResult==='temporary_checked'||latestResult==='needs_more')&&
    !resolvedAfterRecheck;
   const daysRemaining=valid?dateOffset(reviewDate,today):null;
   let bucket='unscheduled';
   if(conflicting)bucket='conflict';
   else if(status==='verified')bucket='verified';
   else if(daysRemaining!==null){
    if(daysRemaining<0)bucket='overdue';
    else if(daysRemaining===0)bucket='today';
    else if(daysRemaining<=3)bucket='soon';
    else bucket='scheduled';
   }
   queue.push({
    id:record.id+':'+(target.actionId||'whole'),
    recordId:record.id,actionId:target.actionId,
    recordText:text(record.note).slice(0,120),
    label:target.label,bucket,
    date:valid?reviewDate:'',daysRemaining,
    dateSource:latest?'재점검 예정일':'조치 목표 기한',
    followupStatus:status||'unrecorded',
    lastRecheckResult:latestResult,
    photoSha256:typeof latest?.photoSha256==='string'?latest.photoSha256:null,
    hasAssignee:!!text(followup?.assignee).trim(),
    hasTemporaryMeasure:!!text(followup?.temporaryMeasure).trim(),
   });
  }
 }
 const rank=new Map(LOCAL_RECHECK_BUCKETS.map((bucket,index)=>[bucket,index]));
 queue.sort((a,b)=>(rank.get(a.bucket)??9)-(rank.get(b.bucket)??9)
  ||((a.date||'9999-99-99').localeCompare(b.date||'9999-99-99'))
  ||a.recordId.localeCompare(b.recordId)||a.id.localeCompare(b.id));
 return queue;
}
export function summarizeLocalRecheckQueue(queue){
 const summary=Object.fromEntries(LOCAL_RECHECK_BUCKETS.map(bucket=>[bucket,0]));
 for(const item of queue){
  if(Object.hasOwn(summary,item.bucket))summary[item.bucket]++;
 }
 return {...summary,total:queue.length};
}
