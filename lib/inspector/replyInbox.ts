import type {ActionShare,ShareReply} from './actionShare';
import type {InspectorAction} from './types';

export const inboxLabels={difficult:'협의 필요',photo:'개선사진 대조',planned:'예정 회신',waiting:'회신 대기',closed:'링크 종료',adopted:'반영됨 · 재점검 별도',missing:'연결 조치 없음'} as const;
export type InboxKind=keyof typeof inboxLabels;
export type InboxEntry={shareId:string;actionId:string;title:string;owner:string;dueDate:string;photoNumber:number;kind:InboxKind;reply?:ShareReply;replyCount:number;createdAt:string;canOpen:boolean;linkClosed:boolean};
const priority:Record<InboxKind,number>={difficult:0,photo:1,planned:2,waiting:3,closed:4,adopted:5,missing:6};
const time=(v:string)=>Number.isFinite(Date.parse(v))?Date.parse(v):0;

/** Metadata only: no URLs/tokens in the overview, and reception never means completion. */
export function replyInbox(shares:ActionShare[],actions:InspectorAction[],inspectionId:string,now=Date.now()):InboxEntry[]{
 const known=new Set(actions.map(a=>a.id)),seen=new Set<string>();
 return shares.filter(s=>{if(s.inspection_id!==inspectionId||seen.has(s.id))return false;seen.add(s.id);return true;}).map(s=>{
  const photo=s.responses.find(r=>r.kind==='photo'),last=s.responses.at(-1);
  const missing=!known.has(s.action_id),linkClosed=!!s.adopted_at||!!s.revoked_at||!s.token||!time(s.expires_at)||time(s.expires_at)<=now;
  const kind:InboxKind=missing?'missing':s.adopted_at?'adopted':photo?'photo':last?.kind==='difficult'?'difficult':last?'planned':linkClosed?'closed':'waiting';
  return {shareId:s.id,actionId:s.action_id,title:s.snapshot.title,owner:s.snapshot.owner,dueDate:s.snapshot.dueDate,photoNumber:s.snapshot.photoNumber,kind,reply:photo||last,replyCount:s.responses.length,createdAt:s.created_at,canOpen:!missing,linkClosed};
 }).sort((a,b)=>priority[a.kind]-priority[b.kind]||time(b.reply?.submittedAt||b.createdAt)-time(a.reply?.submittedAt||a.createdAt)||a.shareId.localeCompare(b.shareId));
}
