import type {ActionShare,ShareReply} from './actionShare';
import type {InspectorAction} from './types';

export const inboxLabels={difficult:'협의 필요',photo:'개선사진 대조',planned:'예정 회신',waiting:'회신 대기',closed:'링크 종료',adopted:'반영됨 · 재점검 별도',missing:'연결 조치 없음'} as const;
export type InboxKind=keyof typeof inboxLabels;

/** The 'needs review' view includes planned dates as well as evidence and blocked work. */
export const inboxRequiresReview=(kind:InboxKind):boolean=>kind==='difficult'||kind==='photo'||kind==='planned';

/** Pure display guidance. A received reply never automatically verifies a corrective action. */
export const inboxNextStep=(kind:InboxKind):string=>({
 difficult:'조치가 어렵다는 진술입니다. 실제 사유·임시 보호조치·대체 방안을 관리자와 확인하세요.',
 photo:'제출한 사진과 원래 지적 위치를 대조하세요. 현장 재점검이 없으면 개선 완료가 아닙니다.',
 planned:'예정된 날짜와 필요한 임시 보호조치를 확인하세요. 회신만으로 조치가 완료되지 않습니다.',
 waiting:'아직 접수된 회신이 없습니다. 링크 생성·공유창 열기는 발송·열람 증명이 아닙니다.',
 closed:'회신 링크가 종료됐습니다. 후속 확인이 필요하면 해당 조치에서 새 요청을 검토하세요.',
 adopted:'회신 사진의 기록 반영 상태입니다. 현장 재점검 확정 여부는 조치 상태에서 따로 확인하세요.',
 missing:'원본 조치와 연결되지 않습니다. 임의로 다른 조치에 적용하거나 완료 처리하지 마세요.',
}[kind]);
export type InboxEntry={shareId:string;actionId:string;title:string;owner:string;dueDate:string;photoNumber:number;kind:InboxKind;reply?:ShareReply;replyCount:number;createdAt:string;canOpen:boolean;linkClosed:boolean};
const priority:Record<InboxKind,number>={difficult:0,photo:1,planned:2,waiting:3,closed:4,adopted:5,missing:6};
const time=(v:string)=>Number.isFinite(Date.parse(v))?Date.parse(v):0;

/** Metadata only: no URLs/tokens in the overview, and reception never means completion. */
export function replyInbox(shares:ActionShare[],actions:InspectorAction[],inspectionId:string,now=Date.now()):InboxEntry[]{
 const known=new Set(actions.map(a=>a.id)),seen=new Set<string>();
 return shares.filter(s=>{if(s.inspection_id!==inspectionId||seen.has(s.id))return false;seen.add(s.id);return true;}).map(s=>{
  // API responses can arrive in a different order. Use timestamps rather than array position.
  const byTime=[...s.responses].sort((a,b)=>time(a.submittedAt)-time(b.submittedAt)||a.requestId.localeCompare(b.requestId));
  const photo=byTime.filter(r=>r.kind==='photo').at(-1),last=byTime.at(-1);
  const missing=!known.has(s.action_id),linkClosed=!!s.adopted_at||!!s.revoked_at||!s.token||!time(s.expires_at)||time(s.expires_at)<=now;
  const kind:InboxKind=missing?'missing':s.adopted_at?'adopted':photo?'photo':last?.kind==='difficult'?'difficult':last?'planned':linkClosed?'closed':'waiting';
  return {shareId:s.id,actionId:s.action_id,title:s.snapshot.title,owner:s.snapshot.owner,dueDate:s.snapshot.dueDate,photoNumber:s.snapshot.photoNumber,kind,reply:photo||last,replyCount:s.responses.length,createdAt:s.created_at,canOpen:!missing,linkClosed};
 }).sort((a,b)=>priority[a.kind]-priority[b.kind]||time(b.reply?.submittedAt||b.createdAt)-time(a.reply?.submittedAt||a.createdAt)||a.shareId.localeCompare(b.shareId));
}
