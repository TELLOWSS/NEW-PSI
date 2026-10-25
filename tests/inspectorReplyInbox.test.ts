import {describe,it,expect} from 'vitest';
import {inboxNextStep,inboxRequiresReview,replyInbox} from '../lib/inspector/replyInbox';
import {readFileSync} from 'node:fs';
import type {ActionShare,ShareReply} from '../lib/inspector/actionShare';
import type {InspectorAction} from '../lib/inspector/types';
const action:InspectorAction={id:'action-a',title:'현재 수정한 조치',owner:'현재 담당',dueDate:'2026-11-01',status:'open',completionPhotoId:'',note:''};
const now=Date.parse('2026-10-24T00:00:00Z');
const reply=(kind:ShareReply['kind'],submittedAt='2026-10-23T10:00:00Z'):ShareReply=>({requestId:kind,kind,name:'합성 담당',note:'합성 회신 내용',photoId:kind==='photo'?'reply-photo':null,sha256:kind==='photo'?'a'.repeat(64):null,submittedAt});
const share=(id:string,patch:Partial<ActionShare>={}):ActionShare=>({id,inspection_id:'own',action_id:action.id,photo_id:'original',creation_revision:2,snapshot:{title:'공유 당시 고정 조치',owner:'공유 당시 담당',dueDate:'2026-10-30',photoSha256:'b'.repeat(64),photoNumber:5},created_at:'2026-10-23T00:00:00Z',expires_at:'2026-10-25T00:00:00Z',revoked_at:null,adopted_at:null,responses:[],token:'secret-capability',...patch});
describe('inspection reply inbox triage',()=>{
 it('puts consultation and unadopted photos before scheduled replies, waiting links and adopted records',()=>{
  const rows=[share('adopted',{adopted_at:'2026-10-23',responses:[reply('photo')]}),share('waiting'),share('planned',{responses:[reply('planned')]}),share('photo',{responses:[reply('photo')]}),share('difficult',{responses:[reply('difficult')]})];
  expect(replyInbox(rows,[action],'own',now).map(r=>r.kind)).toEqual(['difficult','photo','planned','waiting','adopted']);
 });
 it('uses the latest text reply and retains photo precedence without inferring verification',()=>{
  const source=share('a',{responses:[reply('difficult'),reply('planned')]});expect(replyInbox([source],[action],'own',now)[0].kind).toBe('planned');source.responses.push(reply('photo'));expect(replyInbox([source],[action],'own',now)[0].kind).toBe('photo');expect(action.status).toBe('open');
 });
 it('keeps a received photo actionable for comparison after expiry or revoke',()=>{
  for(const patch of [{expires_at:'2026-10-23'},{revoked_at:'2026-10-23'},{token:undefined}]){const r=replyInbox([share('p',{responses:[reply('photo')],...patch})],[action],'own',now)[0];expect(r).toMatchObject({kind:'photo',canOpen:true,linkClosed:true});}
 });
 it('never labels a missing token, invalid expiry or elapsed link as awaiting a response',()=>{
  for(const patch of [{token:undefined},{expires_at:'bad'},{expires_at:'2026-10-23'},{revoked_at:'2026-10-23'}])expect(replyInbox([share('x',patch)],[action],'own',now)[0].kind).toBe('closed');
 });
 it('scopes to the current inspection and de-duplicates links rather than assigning a response by position',()=>{
  const own=share('x');expect(replyInbox([share('other',{inspection_id:'other'}),own,own],[action],'own',now).map(r=>r.shareId)).toEqual(['x']);
 });
 it('retains a missing action as a non-navigable record with its frozen scope',()=>{
  expect(replyInbox([share('orphan')],[],'own',now)[0]).toMatchObject({kind:'missing',canOpen:false,title:'공유 당시 고정 조치',owner:'공유 당시 담당',photoNumber:5});
 });
 it('orders equal-priority receipts by server time with deterministic ties and leaves the source untouched',()=>{
  const a=share('b',{responses:[reply('planned','2026-10-23T11:00:00Z')]}),b=share('a',{responses:[reply('planned','2026-10-23T12:00:00Z')]}),source=[a,b],copy=JSON.stringify(source);
  expect(replyInbox(source,[action],'own',now).map(r=>r.shareId)).toEqual(['a','b']);expect(JSON.stringify(source)).toBe(copy);
 });
 it('does not copy capability tokens, private paths or the full inspection into overview entries',()=>{
  const r=replyInbox([share('safe')],[action],'own',now)[0];expect(JSON.stringify(r)).not.toContain('secret-capability');expect(r).not.toHaveProperty('token');expect(r).not.toHaveProperty('inspection_id');expect(r).not.toHaveProperty('snapshot');
 });
});

describe('Inspector reply follow-through clarity',()=>{
 it('includes planned replies in immediate human review but excludes unopened or adopted links',()=>{
  for(const kind of ['photo','planned','difficult'] as const)expect(inboxRequiresReview(kind)).toBe(true);
  for(const kind of ['waiting','closed','adopted','missing'] as const)expect(inboxRequiresReview(kind)).toBe(false);
  expect(inboxNextStep('planned')).toContain('예정된 날짜');
  expect(inboxNextStep('photo')).toContain('현장 재점검');
  expect(inboxNextStep('difficult')).toContain('대체 방안');
  expect(inboxNextStep('adopted')).not.toContain('완료 확정');
 });
 it('selects the latest response using submitted time, not arbitrary array ordering',()=>{
  const photoOld=reply('photo','2026-10-22T08:00:00Z');
  const photoNew={...reply('photo','2026-10-24T11:00:00Z'),requestId:'photo-new',note:'새로운 사진'};
  const row=replyInbox([share('last',{responses:[photoNew,photoOld,reply('planned','2026-10-24T12:00:00Z')]})],[action],'own',now)[0];
  expect(row.kind).toBe('photo');
  expect(row.reply?.requestId).toBe('photo-new');
  const textRow=replyInbox([share('last-text',{responses:[reply('planned','2026-10-24T12:00:00Z'),reply('difficult','2026-10-24T11:00:00Z')]})],[action],'own',now)[0];
  expect(textRow.kind).toBe('planned');
 });
 it('shows exactly one main reply inbox entry without dropping the action radar shortcut',()=>{
  const source=readFileSync(new URL('../components/inspector/InspectorQuickWorkspace.tsx',import.meta.url),'utf8');
  expect(source).toContain("onOpenInbox={()=>setInboxRequest(n=>n+1)}");
  expect(source).not.toContain('className="si-inbox-entry"');
  const ui=readFileSync(new URL('../components/inspector/InspectorReplyInbox.tsx',import.meta.url),'utf8');
  expect(ui).toContain('inboxRequiresReview');
  expect(ui).toContain('data-inbox-next-step');
  expect(ui).toContain('조치 예정일·보호조치 확인');
 });
});
