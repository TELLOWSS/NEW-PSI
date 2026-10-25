import React,{useEffect,useRef,useState} from 'react';
import {postAdminJson} from '../../utils/adminApiClient';
import type {ActionShare} from '../../lib/inspector/actionShare';
import type {Inspection} from '../../lib/inspector/types';
import {inboxLabels,inboxNextStep,inboxRequiresReview,replyInbox} from '../../lib/inspector/replyInbox';
import './inspector-share.css';

export default function InspectorReplyInbox({item,busy,blocked,onOpen}:{item:Inspection;busy:boolean;blocked:boolean;onOpen:(actionId:string,shareId:string)=>void}){
 const [snapshot,setSnapshot]=useState<{shares:ActionShare[];revision:number;checkedAt:number}|null>(null),[working,setWorking]=useState(false),[error,setError]=useState(''),[filter,setFilter]=useState<'all'|'needs'|'waiting'>('all'),[page,setPage]=useState(0);
 const alive=useRef(true),lock=useRef(false);
 const load=async()=>{
  if(lock.current||busy)return;lock.current=true;setWorking(true);setError('');
  try{const r=await postAdminJson<{ok:true;shares:ActionShare[]}>('/api/admin/inspector',{op:'share-list',id:item.id},{fallbackMessage:'회신 목록을 확인하지 못했습니다.',timeoutMs:15000});if(alive.current){setSnapshot({shares:r.shares,revision:item.revision,checkedAt:Date.now()});setPage(0);}}
  catch(e){if(alive.current)setError(e instanceof Error?e.message:'다시 확인해 주세요.');}
  finally{lock.current=false;if(alive.current)setWorking(false);}
 };
 // Mounted only by an explicit inbox action; no background polling or image download.
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[]);
 const stale=!!snapshot&&snapshot.revision!==item.revision,rows=snapshot?replyInbox(snapshot.shares,item.document.actions,item.id,snapshot.checkedAt):[];
 const needs=rows.filter(r=>inboxRequiresReview(r.kind)),waiting=rows.filter(r=>r.kind==='waiting');
 const selected=filter==='needs'?needs:filter==='waiting'?waiting:rows,pages=Math.max(1,Math.ceil(selected.length/6)),current=Math.min(page,pages-1);
 return <section className="si-reply-inbox" aria-label="받은 회신 모아보기" aria-busy={working}>
  <div className="si-inbox-heading"><div><p className="si-eyebrow">FIELD RESPONSE / INBOX</p><h2>받은 회신, 다음 할 일부터</h2></div><button type="button" className="si-btn" disabled={busy||working} onClick={()=>void load()}>회신 새로 확인</button></div>
  <p className="si-caption">이 점검의 요청을 한곳에서 확인합니다. 공유·회신만으로 조치 완료가 되지는 않습니다.</p>
  {snapshot&&<><div className="si-inbox-filters" role="group" aria-label="회신 분류">{([['needs',`지금 확인 ${needs.length}`],['waiting',`회신 대기 ${waiting.length}`],['all',`전체 요청 ${rows.length}`]] as const).map(([id,label])=><button type="button" className="si-btn" key={id} aria-pressed={filter===id} onClick={()=>{setFilter(id);setPage(0);}}>{label}</button>)}</div><p className="si-caption">마지막 확인 {new Date(snapshot.checkedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 한국시간 · 자동 조회 없음</p></>}
  {working&&<p role="status">회신을 확인하고 있습니다…</p>}{error&&<p role="alert" className="si-notice si-error">{error} 목록을 최신 상태로 확인하지 못했습니다.</p>}
  {stale&&<p role="status" className="si-notice">저장본이 변경됐습니다. 회신을 새로 확인한 뒤 해당 조치를 여세요.</p>}
  {blocked&&<p className="si-notice">작성 중인 조치·담당 변경·개선사진 입력을 저장하거나 정리하면 해당 조치로 이동할 수 있습니다.</p>}
  {snapshot&&!rows.length&&!working&&!error&&<p className="si-inbox-empty">아직 이 점검에서 만든 회신 요청이 없습니다. ‘등록 조치’에서 사진 한 장과 조치를 선택해 요청을 보내세요.</p>}
  {!!rows.length&&!selected.length&&<p className="si-inbox-empty">이 분류의 요청은 없습니다. ‘전체 요청’에서 다른 회신과 종료된 링크도 확인할 수 있습니다.</p>}
  <div className="si-inbox-list">{selected.slice(current*6,current*6+6).map(row=><article key={row.shareId} className={`si-inbox-item is-${row.kind}`} data-inbox-share={row.shareId}>
   <span className="si-inbox-status">{inboxLabels[row.kind]}</span><h3>{row.title}</h3><p className="si-caption">공유 당시 담당 {row.owner} · 기한 {row.dueDate} · 사진 {row.photoNumber}</p><p className="si-caption" data-inbox-next-step={row.kind}><b>관리자 다음 확인:</b> {inboxNextStep(row.kind)}</p>
   {row.reply?<><p className="si-inbox-note">{row.reply.note}</p><p className="si-caption">{row.reply.name} (본인 입력) · 접수 {row.replyCount}회</p><details><summary>회신 내용 전체</summary><p className="si-pre">{row.reply.note}</p><p className="si-caption">{new Date(row.reply.submittedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 한국시간</p></details></>:<p className="si-caption">접수된 회신 없음 · 전송·열람을 추정하지 않습니다.</p>}
   {row.linkClosed&&row.reply&&<p className="si-caption">공개 링크는 종료됐습니다. 받은 기록은 남아 있으며, 적용 가능 여부는 해당 조치에서 대조하세요.</p>}
   <button type="button" className="si-btn" disabled={busy||working||blocked||stale||!!error||!row.canOpen} onClick={()=>onOpen(row.actionId,row.shareId)}>{row.kind==='photo'?'해당 조치에서 전후 비교':row.kind==='planned'?'조치 예정일·보호조치 확인':row.kind==='difficult'?'조치 어려움·대체안 확인':row.canOpen?'해당 조치·회신 열기':'연결 조치를 찾을 수 없음'}</button>
  </article>)}</div>
  {pages>1&&<div className="si-action-pagination"><button type="button" className="si-btn" disabled={!current} onClick={()=>setPage(current-1)}>이전 회신</button><span>{current+1} / {pages}</span><button type="button" className="si-btn" disabled={current>=pages-1} onClick={()=>setPage(current+1)}>다음 회신</button></div>}
 </section>;
}
