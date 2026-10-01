import React, { useEffect, useRef, useState } from 'react';
import type { TenantWorkerAccount, TenantEducationRelease } from '../types/tenantEducation';
import type { TenantTrainingDraft } from '../types/tenantTrainingDrafts';
import type { TenantWorkspaceRequestOptions } from '../utils/tenantWorkspaceRequest';
import { TenantWorkspaceRequestError } from '../utils/tenantWorkspaceRequest';
type AccessLost = (error: TenantWorkspaceRequestError) => void;
const button='min-h-12 rounded-lg border border-slate-300 px-4 py-3 font-semibold disabled:opacity-50';
function useExplicitRequest(onAccessLost:AccessLost) {
 const [busy,setBusy]=useState(false), [error,setError]=useState('');
 const generation=useRef(0), controller=useRef<AbortController|null>(null), pending=useRef(false);
 useEffect(()=>()=>{generation.current++; controller.current?.abort();},[]);
 async function run(work:(signal:AbortSignal)=>Promise<any>, apply:(result:any)=>void) {
  if(pending.current)return; pending.current=true;
  const ticket=++generation.current, abort=new AbortController();controller.current=abort;setBusy(true);setError('');
  try {const result=await work(abort.signal);if(ticket===generation.current)apply(result);}
  catch(cause){if(ticket!==generation.current||abort.signal.aborted)return;
   if(cause instanceof TenantWorkspaceRequestError&&[401,403].includes(cause.status))onAccessLost(cause);
   setError(cause instanceof Error?cause.message:'처리하지 못했습니다. 다시 확인해 주세요.');
  }finally{if(ticket===generation.current){pending.current=false;controller.current=null;setBusy(false);}}
 }
 return {busy,error,run};
}
export function TenantWorkerAccountPanel({worker,request,onAccessLost}:{key?:string;worker:{id:string;name:string;active:boolean};request:(options:Omit<TenantWorkspaceRequestOptions,'resource'>&{resource:'worker-accounts'})=>Promise<any>;onAccessLost:AccessLost}) {
 const [account,setAccount]=useState<TenantWorkerAccount|null>(null),[loaded,setLoaded]=useState(false),[email,setEmail]=useState('');
 const {busy,error,run}=useExplicitRequest(onAccessLost);
 const apply=(result:any)=>{setAccount(result.account);setEmail(result.account?.email||'');setLoaded(true);};
 return <section aria-label="개인 교육 계정 연결" className="mt-5 rounded-lg bg-slate-50 p-4">
  <h3 className="font-bold">{worker.name} · 개인 교육 계정</h3>
  <p className="mt-2 text-sm leading-6">관리자가 본인을 확인한 뒤, 이메일 확인을 마친 기존 개인 계정을 연결해 주세요. 연결된 계정으로 로그인해야 지정 교육을 볼 수 있습니다.</p>
  <button className={`${button} mt-3`} disabled={busy} onClick={()=>void run(signal=>request({resource:'worker-accounts',query:{workerId:worker.id},signal}),apply)}>교육 계정 확인</button>
  {loaded&&<><p className="mt-3 text-sm">{account?`${account.email} · ${account.active?'연결 사용 중':'연결 중지'} · 수정 ${account.revision}`:'연결된 계정이 없습니다.'}</p>
   <form className="mt-3 space-y-3" onSubmit={event=>{event.preventDefault();void run(signal=>request({resource:'worker-accounts',method:'POST',signal,body:{workerId:worker.id,email,expectedRevision:account?.revision||0}}),apply);}}>
    <label className="block text-sm font-semibold">본인 확인한 개인 계정 이메일<input type="email" required maxLength={320} disabled={busy||!worker.active} value={email} onChange={event=>setEmail(event.target.value)} className="mt-2 block w-full rounded-lg border p-3 text-base"/></label>
    <button disabled={busy||!worker.active} className={button}>개인 계정 연결 저장</button>
   </form>
   {account?.active&&<button className={`${button} mt-3 text-red-700`} disabled={busy} onClick={()=>void run(signal=>request({resource:'worker-accounts',method:'PATCH',signal,body:{workerId:worker.id,expectedRevision:account.revision}}),apply)}>계정 연결 중지</button>}
  </>}
  {error&&<p role="alert" className="mt-3 text-red-700">{error}</p>}
 </section>;
}
export function TenantEducationReleasePanel({draft,role,request,onAccessLost}:{key?:string;draft:TenantTrainingDraft;role:string;request:(options:Omit<TenantWorkspaceRequestOptions,'resource'>&{resource:'education-releases'})=>Promise<any>;onAccessLost:AccessLost}) {
 const [items,setItems]=useState<TenantEducationRelease[]>([]),[hours,setHours]=useState(24),[cursor,setCursor]=useState<string|null>(null),[loaded,setLoaded]=useState(false);
 const requestId=useRef<string|null>(null);const {busy,error,run}=useExplicitRequest(onAccessLost);
 const [targets,setTargets]=useState<Record<string,{id:string;name:string;workerCode:string;active:boolean}[]>>({});
 const [copyMessage,setCopyMessage]=useState('');
 async function copyLink(releaseId:string,workerId:string){
  setCopyMessage('');
  try{await navigator.clipboard.writeText(new URL(`/saas/education?releaseId=${encodeURIComponent(releaseId)}&workerId=${encodeURIComponent(workerId)}`,window.location.origin).href);setCopyMessage('교육 링크를 복사했습니다. 해당 근로자에게 전달해 주세요.');}
  catch{setCopyMessage('복사하지 못했습니다. 교육 링크를 우클릭해 주소를 복사해 주세요.');}
 }
 const canWrite=['owner','admin'].includes(role);
 const load=(more=false)=>{if(!more){setTargets({});setCopyMessage('');}void run(signal=>request({resource:'education-releases',signal,query:{draftId:draft.id,...(more&&cursor?{cursor}:{})}}),result=>{setItems(previous=>more?[...previous,...result.items.filter((item:TenantEducationRelease)=>!previous.some(current=>current.id===item.id))]:result.items);setCursor(result.nextCursor);setLoaded(true);});};
 return <section aria-label="교육 배포 관리" className="mt-5 rounded-lg bg-slate-50 p-4">
  <h3 className="font-bold">{draft.title} · 교육 배포</h3>
  <p className="mt-2 text-sm leading-6">대상자 모두의 개인 계정을 먼저 연결해 주세요. 배포 당시 교육 원문과 명단을 보관합니다. 초안을 수정하면 이전 배포의 열람이 중지되어 다시 배포해야 합니다. 열람만으로 이수나 서명이 기록되지는 않습니다.</p>
  <button className={`${button} mt-3`} disabled={busy} onClick={()=>load()}>배포 목록 확인</button>
  {canWrite&&<form className="mt-4 space-y-3" onSubmit={event=>{event.preventDefault();requestId.current||=crypto.randomUUID();void run(signal=>request({resource:'education-releases',method:'POST',signal,body:{draftId:draft.id,expectedRevision:draft.revision,requestId:requestId.current,hours}}),result=>{setItems(previous=>[result.item,...previous.filter(item=>item.id!==result.item.id)]);requestId.current=null;setLoaded(true);});}}>
   <label className="block text-sm font-semibold">열람 가능 시간 (1~168시간)<input type="number" min={1} max={168} required value={hours} disabled={busy} onChange={event=>{setHours(Number(event.target.value));requestId.current=null;}} className="mt-2 block w-full rounded-lg border p-3 text-base"/></label>
   <button className={button} disabled={busy||draft.workerIds.length===0}>지정 대상자에게 교육 배포</button>
  </form>}
  {loaded&&items.length===0&&<p className="mt-3">배포 기록이 없습니다.</p>}
  <ul className="mt-4 space-y-4">{items.map(item=>{
   const usable=!item.revoked&&Date.parse(item.expiresAt)>Date.now()&&item.draftRevision===draft.revision;
   return <li key={item.id} className="rounded-lg border p-4"><p className="font-semibold">{item.revoked?'철회됨':item.draftRevision!==draft.revision?'초안 변경으로 열람 중지':usable?'배포 중':'열람 기간 종료'} · 대상 {item.workerIds.length}명</p><p className="mt-2 text-sm">열람 마감 {new Date(item.expiresAt).toLocaleString('ko-KR')} · 초안 수정 {item.draftRevision}</p>
    {usable&&<><button className={`${button} mt-3`} disabled={busy} onClick={()=>void run(signal=>request({resource:'education-releases',signal,query:{draftId:draft.id,releaseId:item.id}}),result=>setTargets(previous=>({...previous,[item.id]:result.targets})))}>대상자 이름·링크 확인</button>
     {targets[item.id]&&<><p className="mt-2 text-sm text-slate-600">현재 근로자 명단 기준입니다. 동명이인은 관리번호로 구분해 주세요. 연결한 개인 계정만 열람할 수 있습니다.</p><ol className="mt-3 space-y-2">{targets[item.id].map(target=><li key={target.id}><p className="font-semibold">{target.name} · {target.workerCode}{!target.active&&' · 이용 중지'}</p>{target.active&&<div className="flex flex-wrap gap-3"><a className="inline-block min-h-12 py-3 text-indigo-700 underline" href={`/saas/education?releaseId=${encodeURIComponent(item.id)}&workerId=${encodeURIComponent(target.id)}`} target="_blank" rel="noreferrer">{target.name} 교육 링크 열기</a><button className={button} onClick={()=>void copyLink(item.id,target.id)}>{target.name} 교육 링크 복사</button></div>}</li>)}</ol></>}
    </>}
    {canWrite&&!item.revoked&&<button className={`${button} mt-3 text-red-700`} disabled={busy} onClick={()=>void run(signal=>request({resource:'education-releases',method:'PATCH',signal,body:{releaseId:item.id,expectedRevision:item.revision}}),result=>setItems(previous=>previous.map(current=>current.id===result.item.id?result.item:current)))}>교육 배포 철회</button>}
   </li>;
  })}</ul>
  {cursor&&<button className={`${button} mt-3`} disabled={busy} onClick={()=>load(true)}>이전 배포 더 보기</button>}
  {error&&<p role="alert" className="mt-3 text-red-700">{error}</p>}
  {copyMessage&&<p role="status" className="mt-3 text-sm">{copyMessage}</p>}
 </section>;
}
