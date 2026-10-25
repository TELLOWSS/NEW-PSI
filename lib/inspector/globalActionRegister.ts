import type {Inspection,InspectorAction} from './types.js';
import {actionDeadlinePhase,type ActionDeadlinePhase} from './workQueue.js';
import {actionCsvCell} from './actionRegister.js';

/** Saved actions from explicit requested pages only, never proposed AI controls. */
export type GlobalActionRow={
 inspectionId:string;inspectionRevision:number;inspectionTitle:string;siteName:string;location:string;workType:string;urgent:boolean;
 inspectionCreatedAt:string;inspectionUpdatedAt:string;actionId:string;title:string;owner:string;dueDate:string;
 status:InspectorAction['status'];scheduleContext:string;verifiedAt:string;
};
export type GlobalActionSource=Pick<Inspection,'id'|'revision'|'document'|'created_at'|'updated_at'>;
export type RegisterFilter='unresolved'|'scheduled'|'today'|'overdue'|'reinspection'|'all'|'verified';
export const registerFilterLabel:Record<RegisterFilter,string>={
 unresolved:'미결 전체',scheduled:'기한 내',today:'오늘 기한',overdue:'기한 초과',reinspection:'재점검 대기',verified:'재점검 확인',all:'전체',
};
export function projectGlobalActionRows(items:readonly GlobalActionSource[]):GlobalActionRow[]{
 return items.flatMap(item=>(item.document.actions||[]).filter(a=>['open','review-requested','verified'].includes(a.status)).map(a=>({
  inspectionId:item.id,inspectionRevision:item.revision,inspectionTitle:item.document.title,
  siteName:item.document.siteName,location:item.document.location,workType:item.document.workType,
  urgent:item.document.urgent,inspectionCreatedAt:item.created_at,inspectionUpdatedAt:item.updated_at,
  actionId:a.id,title:a.title,owner:a.owner,dueDate:a.dueDate,status:a.status,
  scheduleContext:(a.scheduleContext||'').slice(0,300),verifiedAt:a.verifiedAt||'',
 })));
}
export function globalActionPhase(row:GlobalActionRow,today:string):ActionDeadlinePhase {
 return actionDeadlinePhase({status:row.status,dueDate:row.dueDate} as InspectorAction,today);
}
const rank:Record<ActionDeadlinePhase,number>={overdue:0,reinspection:1,today:2,unknown:3,scheduled:4,verified:5};
export function filterGlobalActions(rows:readonly GlobalActionRow[],filter:RegisterFilter,search:string,today:string):GlobalActionRow[]{
 const q=search.trim().normalize('NFC').toLocaleLowerCase('ko-KR').slice(0,100);
 return rows.filter(row=>{
  const phase=globalActionPhase(row,today);
  const eligible=filter==='all'||(filter==='unresolved'?phase!=='verified':phase===filter);
  return eligible&&(!q||[row.inspectionTitle,row.siteName,row.location,row.workType,row.title,row.owner].some(text=>String(text||'').normalize('NFC').toLocaleLowerCase('ko-KR').includes(q)));
 }).sort((a,b)=>rank[globalActionPhase(a,today)]-rank[globalActionPhase(b,today)]
  ||a.dueDate.localeCompare(b.dueDate)||a.inspectionId.localeCompare(b.inspectionId)||a.actionId.localeCompare(b.actionId));
}
export function globalActionCounts(rows:readonly GlobalActionRow[],today:string){
 const phases=rows.map(row=>globalActionPhase(row,today));
 return {
  unresolved:phases.filter(p=>p!=='verified').length,
  scheduled:phases.filter(p=>p==='scheduled').length,
  today:phases.filter(p=>p==='today').length,
  overdue:phases.filter(p=>p==='overdue').length,
  reinspection:phases.filter(p=>p==='reinspection').length,
  verified:phases.filter(p=>p==='verified').length,
 };
}
/** CSV exports loaded records ONLY. All untrusted text is cell-escaped against Excel formulas. */
export function buildGlobalActionRegisterCsv(rows:readonly GlobalActionRow[],today:string){
 const cols=['점검번호','점검버전','점검명','현장','위치','공종','조치ID','조치내용','담당자','약정기한','기한 단계','기존 조치 상태','최초 기한 근거','현장 재점검 시각','조회 범위'];
 const body=rows.map(row=>[
  row.inspectionId,row.inspectionRevision,row.inspectionTitle,row.siteName,row.location,row.workType,
  row.actionId,row.title,row.owner,row.dueDate,globalActionPhase(row,today),
  row.status==='verified'?'현장 재점검 확인':row.status==='review-requested'?'재점검 대기':'이행 검토 중',
  row.scheduleContext,row.verifiedAt,'사용자가 불러온 점검 범위만 · 현장 승인 아님'
 ]);
 return '\uFEFF'+[cols,...body].map(row=>row.map(actionCsvCell).join(',')).join('\r\n')+'\r\n';
}
