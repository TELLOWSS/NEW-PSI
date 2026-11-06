import type {InspectorAction} from './types.js';
import {effectiveFieldCheckDate,latestFieldCheck} from './fieldCheck.js';
import {overdueAction} from './workQueue.js';

/** Read-only categories for a SINGLE saved inspection. One action can belong to several
 * categories: neither counts nor the rows imply an action was delivered, performed or approved.
 */
export const attentionLabels={
 overdue:'기한 경과',
 check:'현장 확인일 도래',
 reinspection:'재점검 대기',
 due:'오늘 완료기한',
} as const;
export type AttentionKind=keyof typeof attentionLabels;
export const attentionOrder:AttentionKind[]=['overdue','check','reinspection','due'];
export type AttentionRow={
 actionId:string;
 title:string;
 owner:string;
 dueDate:string;
 status:InspectorAction['status'];
 checkDate:string;
 checkLate:boolean;
 deadlineLate:boolean;
 evidenceSubmitted:boolean;
 fieldCheckResult?:InspectorAction['fieldChecks'] extends (infer T)[]|undefined ? T : never;
};
const validDay=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
export function actionAttentionBoard(actions:readonly InspectorAction[],today:string):{
 groups:Record<AttentionKind,AttentionRow[]>;
 unresolved:number;
 uniqueAttention:number;
 overlap:number;
}{
 const groups:Record<AttentionKind,AttentionRow[]>={overdue:[],check:[],reinspection:[],due:[]};
 const active=actions.filter(a=>a.status!=='verified');
 const matched=new Set<string>();
 let matches=0;
 for(const action of active){
  const checkDate=effectiveFieldCheckDate(action);
  const row:AttentionRow={
   actionId:action.id,title:action.title,owner:action.owner,dueDate:action.dueDate,
   status:action.status,checkDate,checkLate:!!checkDate&&validDay(today)&&checkDate<today,
   deadlineLate:overdueAction(action,today),evidenceSubmitted:action.status==='review-requested',
   fieldCheckResult:latestFieldCheck(action),
  };
  const kinds:AttentionKind[]=[];
  if(row.deadlineLate)kinds.push('overdue');
  if(checkDate&&validDay(today)&&checkDate<=today)kinds.push('check');
  if(row.evidenceSubmitted)kinds.push('reinspection');
  if(validDay(today)&&action.dueDate===today)kinds.push('due');
  for(const kind of kinds)groups[kind].push(row);
  if(kinds.length){matched.add(action.id);matches+=kinds.length;}
 }
 const compare=(a:AttentionRow,b:AttentionRow)=>a.checkLate!==b.checkLate?Number(b.checkLate)-Number(a.checkLate):
   (a.checkDate||a.dueDate||'9999').localeCompare(b.checkDate||b.dueDate||'9999')||
   (a.dueDate||'9999').localeCompare(b.dueDate||'9999')||a.actionId.localeCompare(b.actionId);
 for(const kind of attentionOrder)groups[kind].sort(compare);
 return {groups,unresolved:active.length,uniqueAttention:matched.size,overlap:matches-matched.size};
}
