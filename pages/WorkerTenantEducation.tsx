import React, { useEffect, useRef, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requestTenantWorkspace, TenantWorkspaceRequestError } from '../utils/tenantWorkspaceRequest';
import type { WorkerEducation } from '../types/tenantEducation';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default function WorkerTenantEducation() {
 const [link]=useState(()=>{
  const query=new URLSearchParams(typeof window==='undefined'?'':window.location.search);
  const release=query.getAll('releaseId'),worker=query.getAll('workerId');
  return release.length===1&&worker.length===1&&uuid.test(release[0])&&uuid.test(worker[0])?{releaseId:release[0],workerId:worker[0]}:null;
 });
 const client=useRef<SupabaseClient|null>(null),generation=useRef(0),abort=useRef<AbortController|null>(null),pending=useRef(false);
 const [ready,setReady]=useState(false),[signedIn,setSignedIn]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[education,setEducation]=useState<WorkerEducation|null>(null);
 useEffect(()=>{
  if(!link)return;
  const url=import.meta.env.VITE_SUPABASE_URL||import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=import.meta.env.VITE_SUPABASE_ANON_KEY||import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key){setError('교육 서비스를 준비 중입니다. 관리자에게 문의해 주세요.');return;}
  const instance=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}});
  client.current=instance;setReady(true);
  return()=>{generation.current++;abort.current?.abort();instance.auth.stopAutoRefresh();client.current=null;};
 },[link]);
 async function signOut(){generation.current++;abort.current?.abort();pending.current=false;setBusy(false);setEducation(null);setPassword('');setSignedIn(false);setError('');await client.current?.auth.signOut({scope:'local'}).catch(()=>undefined);}
 async function load(signIn=false){
  if(!link||!client.current||pending.current)return;
  pending.current=true;const ticket=++generation.current,controller=new AbortController();abort.current=controller;
  setBusy(true);setError('');setEducation(null);const instance=client.current;
  try{
   if(signIn){const result=await instance.auth.signInWithPassword({email:email.trim(),password});if(ticket!==generation.current)return;if(result.error)throw new Error('이메일과 비밀번호를 확인해 주세요.');setSignedIn(true);}
   const result=await requestTenantWorkspace(async()=>{const {data}=await instance.auth.getSession();return data.session?.access_token||null;},()=>generation.current,undefined,{resource:'worker-education',query:link,signal:controller.signal});
   if(ticket===generation.current)setEducation(result.education);
  }catch(cause){if(ticket!==generation.current||controller.signal.aborted)return;
   if(cause instanceof TenantWorkspaceRequestError&&cause.status===401){setSignedIn(false);void instance.auth.signOut({scope:'local'}).catch(()=>undefined);}
   setError(cause instanceof Error?cause.message:'교육을 열람할 수 없습니다. 관리자에게 문의해 주세요.');
  }finally{if(ticket===generation.current){pending.current=false;abort.current=null;setPassword('');setBusy(false);}}
 }
 return <main className="min-h-screen bg-slate-100 px-4 py-8"><div className="mx-auto max-w-3xl rounded-xl bg-white p-6 shadow-sm">
  <h1 className="text-2xl font-bold">NEW-PSI 개인 교육</h1>
  {!link?<p role="alert" className="mt-4">올바른 교육 링크가 아닙니다. 관리자에게 새 링크를 요청해 주세요.</p>:<>
   <p className="mt-3 leading-7 text-slate-600">관리자가 연결한 개인 계정으로 로그인해 주세요. 지정 대상자만 교육을 볼 수 있습니다.</p>
   {!signedIn?<form className="mt-6 space-y-4" onSubmit={event=>{event.preventDefault();void load(true);}}>
    <label className="block font-semibold">개인 계정 이메일<input type="email" autoComplete="username" required maxLength={320} disabled={busy} value={email} onChange={event=>setEmail(event.target.value)} className="mt-2 block w-full rounded-lg border p-3 text-base"/></label>
    <label className="block font-semibold">비밀번호<input type="password" autoComplete="current-password" required disabled={busy} value={password} onChange={event=>setPassword(event.target.value)} className="mt-2 block w-full rounded-lg border p-3 text-base"/></label>
    <button disabled={busy||!ready} className="min-h-12 w-full rounded-lg bg-indigo-700 p-3 font-bold text-white disabled:opacity-50">{busy?'확인 중…':'로그인하고 교육 확인'}</button>
   </form>:<div className="mt-4 flex flex-wrap gap-3"><button disabled={busy} onClick={()=>void load()} className="min-h-12 rounded-lg border px-4 py-3 font-semibold">교육 다시 확인</button><button onClick={()=>void signOut()} className="min-h-12 rounded-lg border px-4 py-3">로그아웃 · 계정 변경</button></div>}
   {education&&<article className="mt-6 border-t pt-6"><h2 className="text-xl font-bold">{education.title}</h2><p className="mt-3">{education.siteName} · {education.workerName}</p><p className="mt-2 text-sm text-slate-600">열람 마감 {new Date(education.expiresAt).toLocaleString('ko-KR')}</p><div className="mt-6 whitespace-pre-wrap break-words text-lg leading-8">{education.sourceTextKo}</div><p className="mt-6 text-sm text-slate-600">이 화면은 교육 자료 열람용입니다. 열람만으로 이수나 서명이 기록되지는 않습니다.</p></article>}
   {error&&<p role="alert" className="mt-4 leading-7 text-red-700">{error}</p>}
  </>}
 </div></main>;
}
