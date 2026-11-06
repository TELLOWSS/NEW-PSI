import {inspectionKindText,type InspectionKind,type Inspection,type InspectorAction} from './types.js';
import {actionDeadlinePhase,actionDeadlineText,type ActionDeadlinePhase} from './workQueue.js';
import {actionCsvCell} from './actionRegister.js';
import {deferredCheckDate} from './deferredCorrection.js';

/** Saved actions from explicit requested pages only, never proposed AI controls. */
export type GlobalActionRow={
 inspectionId:string;inspectionRevision:number;inspectionTitle:string;inspectionKind?:InspectionKind;siteName:string;location:string;workType:string;urgent:boolean;
 inspectionCreatedAt:string;inspectionUpdatedAt:string;actionId:string;title:string;owner:string;dueDate:string;
 status:InspectorAction['status'];scheduleContext:string;verifiedAt:string;
};
export type GlobalActionSource=Pick<Inspection,'id'|'revision'|'document'|'created_at'|'updated_at'>;
export type RegisterFilter='unresolved'|'scheduled'|'today'|'overdue'|'reinspection'|'check'|'assignment'|'all'|'verified';
export const registerFilterLabel:Record<RegisterFilter,string>={
 unresolved:'미결 전체',scheduled:'기한 내',today:'오늘 기한',overdue:'기한 초과',reinspection:'재점검 대기',check:'현장 확인일 도래',assignment:'담당·기한 확인 필요',verified:'재점검 확인',all:'전체',
};
export function projectGlobalActionRows(items:readonly GlobalActionSource[]):GlobalActionRow[]{
 return items.flatMap(item=>(item.document.actions||[]).filter(a=>['open','review-requested','verified'].includes(a.status)).map(a=>({
  inspectionId:item.id,inspectionRevision:item.revision,inspectionTitle:item.document.title,inspectionKind:item.document.inspectionKind,
  siteName:item.document.siteName,location:item.document.location,workType:item.document.workType,
  urgent:item.document.urgent,inspectionCreatedAt:item.created_at,inspectionUpdatedAt:item.updated_at,
  actionId:a.id,title:a.title,owner:a.owner,dueDate:a.dueDate,status:a.status,
  scheduleContext:(a.scheduleContext||'').slice(0,300),verifiedAt:a.verifiedAt||'',
 })));
}
/** Legacy one-label phase for compatibility; never use it as the only deadline flag. */
export function globalActionPhase(row:GlobalActionRow,today:string):ActionDeadlinePhase {
 return actionDeadlinePhase({status:row.status,dueDate:row.dueDate} as InspectorAction,today);
}
/** Date and human reinspection are independent axes. A late submitted action belongs to BOTH queues. */
export function globalActionDimensions(row:GlobalActionRow,today:string){
 const verified=row.status==='verified';
 const nextCheckDate=deferredCheckDate(row.scheduleContext);
 const check=!!nextCheckDate&&/^\d{4}-\d{2}-\d{2}$/.test(today)&&nextCheckDate<=today&&!verified;
 const checkLate=check&&nextCheckDate<today;
 const phase=actionDeadlinePhase({status:verified?'verified':'open',dueDate:row.dueDate} as InspectorAction,today);
 const ownerMissing=!row.owner?.trim();
 const dueDateNeedsReview=actionDeadlinePhase({status:'open',dueDate:row.dueDate} as InspectorAction,today)==='unknown';
 return {
  verified,
  check,nextCheckDate,checkLate,
  overdue:phase==='overdue',
  today:phase==='today',
  scheduled:phase==='scheduled',
  unknown:phase==='unknown',
  reinspection:!verified&&row.status==='review-requested',
  assignmentNeeded:!verified&&(ownerMissing||dueDateNeedsReview),
  ownerMissing,
  dueDateNeedsReview,
 };
}
export function globalActionStatusText(row:GlobalActionRow,today:string):string {
 const s=globalActionDimensions(row,today);
 if(s.verified)return '현장 재점검 확인 기록';
 const dateLabel=s.overdue?'약정기한 경과':s.today?'오늘 약정기한':s.unknown?'약정기한 확인 필요':
  actionDeadlineText({status:'open',dueDate:row.dueDate} as InspectorAction,today);
 return dateLabel+(s.reinspection?' · 완료 검토 요청·현장 재점검 대기':' · 진행 확인 필요')
  +(s.assignmentNeeded?' · 담당·기한 확인 필요':'');
}
export function globalActionNextStep(row:GlobalActionRow,today:string):string {
 const s=globalActionDimensions(row,today);
 if(s.verified)return '현장 재점검 확인 기록을 열어 검토하세요.';
 if(s.assignmentNeeded)return '담당자와 유효한 약정기한을 원점검에서 확인·보완하세요. 기한을 임의로 지정하지 않습니다.'+(s.reinspection?' 완료 검토 요청과 현장 재점검도 별도로 확인하세요.':'');
 if(s.reinspection&&s.overdue)return '기한 경과 사유와 현재 보호조치를 확인한 후, 접수 증빙과 현장을 대조해 재점검 결과를 기록하세요.';
 if(s.reinspection)return '접수된 증빙·완료 요청과 현장을 대조하고 재점검 결과를 기록하세요.';
 if(s.overdue)return '기한 경과 사유, 현재 보호조치, 실제 개선 진행상황을 현장에서 확인하세요.';
 if(s.check)return '다음 현장 확인 예정일이 도래했습니다. 임시 보호조치 계획의 실제 이행 여부를 확인하고 기록하세요. 자동 알림·시행 확인은 아닙니다.';
 if(s.today)return '오늘 약정기한의 진행상황과 임시 보호조치를 확인하세요.';
 return '약정기한까지 진행상황과 임시 보호조치를 확인하세요.';
}
const priority=(row:GlobalActionRow,today:string)=>{
 const s=globalActionDimensions(row,today);
 return s.verified?6:s.overdue&&!s.reinspection?0:s.overdue?1:s.reinspection?2:s.today?3:s.assignmentNeeded?4:5;
};
export function filterGlobalActions(rows:readonly GlobalActionRow[],filter:RegisterFilter,search:string,today:string):GlobalActionRow[]{
 const q=search.trim().normalize('NFC').toLocaleLowerCase('ko-KR').slice(0,100);
 return rows.filter(row=>{
  const s=globalActionDimensions(row,today);
  const eligible=filter==='all'||(filter==='unresolved'?!s.verified:filter==='verified'?s.verified:filter==='assignment'?s.assignmentNeeded:s[filter]);
  return eligible&&(!q||[row.inspectionTitle,inspectionKindText(row.inspectionKind),row.siteName,row.location,row.workType,row.title,row.owner].some(text=>String(text||'').normalize('NFC').toLocaleLowerCase('ko-KR').includes(q)));
 }).sort((a,b)=>priority(a,today)-priority(b,today)
  ||(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||a.inspectionId.localeCompare(b.inspectionId)||a.actionId.localeCompare(b.actionId));
}
/** Filters apply only to already-loaded, administrator-authorized records.
 * Exact site/owner selection avoids mixing identically named tasks across worksites.
 * Deadline ranges are Gregorian dates on the action's agreed DUE DATE, not the next-check date.
 */
export type GlobalRegisterCriteria={site:string;owner:string;dueFrom:string;dueTo:string};
const isoDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)
 &&Number.isFinite(Date.parse(value+'T00:00:00Z'))
 &&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function globalRegisterCriteriaError({dueFrom,dueTo}:GlobalRegisterCriteria){
 if((dueFrom&&!isoDate(dueFrom))||(dueTo&&!isoDate(dueTo)))return '완료기한 검색 날짜가 올바르지 않습니다.';
 if(dueFrom&&dueTo&&dueFrom>dueTo)return '완료기한 시작일이 종료일보다 늦습니다. 날짜를 수정해 주세요.';
 return '';
}
export function filterGlobalActionsWithCriteria(
 rows:readonly GlobalActionRow[],filter:RegisterFilter,search:string,today:string,
 criteria:GlobalRegisterCriteria,
):GlobalActionRow[]{
 if(globalRegisterCriteriaError(criteria))return [];
 return filterGlobalActions(rows,filter,search,today).filter(row=>
   (!criteria.site||row.siteName.trim()===criteria.site)
   &&(!criteria.owner||row.owner.trim()===criteria.owner)
   &&(!criteria.dueFrom||(isoDate(row.dueDate)&&row.dueDate>=criteria.dueFrom))
   &&(!criteria.dueTo||(isoDate(row.dueDate)&&row.dueDate<=criteria.dueTo))
 );
}
export function globalActionCheckCounts(rows:readonly GlobalActionRow[],today:string){
 const flags=rows.map(row=>globalActionDimensions(row,today));
 return {
  due:flags.filter(s=>s.check).length,
  past:flags.filter(s=>s.checkLate).length,
  overlapWithOverdue:flags.filter(s=>s.check&&s.overdue).length,
  overlapWithReinspection:flags.filter(s=>s.check&&s.reinspection).length,
 };
}
export function globalActionCounts(rows:readonly GlobalActionRow[],today:string){
 const flags=rows.map(row=>globalActionDimensions(row,today));
 return {
  unresolved:flags.filter(s=>!s.verified).length,
  scheduled:flags.filter(s=>s.scheduled).length,
  today:flags.filter(s=>s.today).length,
  overdue:flags.filter(s=>s.overdue).length,
  reinspection:flags.filter(s=>s.reinspection).length,
  assignment:flags.filter(s=>s.assignmentNeeded).length,
  verified:flags.filter(s=>s.verified).length,
  overlappingOverdueReinspection:flags.filter(s=>s.overdue&&s.reinspection).length,
 };
}
/** CSV exports loaded records ONLY. All untrusted text is cell-escaped against Excel formulas. */
export function buildGlobalActionRegisterCsv(rows:readonly GlobalActionRow[],today:string){
 const cols=['점검번호','점검버전','점검명','점검 유형','현장','위치','공종','조치ID','조치내용','담당자','약정기한','기한 단계','기존 조치 상태','최초 기한 근거','현장 재점검 시각','조회 범위','약정기한 경과 여부','재점검 대기 여부','현장 확인할 다음 단계','다음 현장 확인 예정일','확인 예정일 도래 여부','확인 예정일 경과 여부','담당자 미지정 여부','약정기한 확인 필요 여부'];
 const body=rows.map(row=>{
  const s=globalActionDimensions(row,today);
  return [
   row.inspectionId,row.inspectionRevision,row.inspectionTitle,inspectionKindText(row.inspectionKind),row.siteName,row.location,row.workType,
   row.actionId,row.title,row.owner,row.dueDate,globalActionPhase(row,today),
   row.status==='verified'?'현장 재점검 확인':row.status==='review-requested'?'재점검 대기':'이행 검토 중',
   row.scheduleContext,row.verifiedAt,'사용자가 불러온 점검 범위만 · 현장 승인 아님',
   s.overdue?'예':'아니오',s.reinspection?'예':'아니오',globalActionNextStep(row,today),
   s.nextCheckDate,s.check?'예':'아니오',s.checkLate?'예':'아니오',s.ownerMissing?'예':'아니오',s.dueDateNeedsReview?'예':'아니오'
  ];
 });
 return '\uFEFF'+[cols,...body].map(row=>row.map(actionCsvCell).join(',')).join('\r\n')+'\r\n';
}
