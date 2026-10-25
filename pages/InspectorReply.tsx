import React,{useEffect,useRef,useState} from 'react';
import {shareTokenFromHash,replyKindLabel,type ShareReply} from '../lib/inspector/actionShare';
import {optimizePhoto} from '../lib/inspector/photoAssets';
import {replyKindGuide,replyMissing} from '../lib/inspector/noviceFollowThrough';
import InspectorCameraDialog from '../components/inspector/InspectorCameraDialog';
import '../components/inspector/inspector.css';
import '../components/inspector/inspector-experience.css';
import '../components/inspector/inspector-share.css';
const base64=(b:Blob)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(new Error('사진 읽기 실패'));r.readAsDataURL(b);});
export default function InspectorReply(){
 const [token]=useState(()=>shareTokenFromHash(location.hash)),[data,setData]=useState<any>(null),[original,setOriginal]=useState(''),[photo,setPhoto]=useState<Awaited<ReturnType<typeof optimizePhoto>>|null>(null),[preview,setPreview]=useState(''),[kind,setKind]=useState<ShareReply['kind']>('photo'),[name,setName]=useState(''),[note,setNote]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[camera,setCamera]=useState(false);
 const alive=useRef(true),working=useRef(false),request=useRef(crypto.randomUUID()),pid=useRef(crypto.randomUUID()),sent=useRef(false),pendingSubmission=useRef<any>(null);
 const [uncertain,setUncertain]=useState(false);
 const reset=()=>{if(sent.current){request.current=crypto.randomUUID();pid.current=crypto.randomUUID();sent.current=false;}};
 const call=async(b:any)=>{const r=await fetch('/api/inspection-share',{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...b}),signal:AbortSignal.timeout(30000)}),d=await r.json();if(!r.ok||!d.ok)throw new Error(d.message||'회신 요청 실패');return d;};
 const run=async(f:()=>Promise<void>)=>{if(working.current)return;working.current=true;setBusy(true);setError('');try{await f();}catch(e){if(alive.current)setError(e instanceof Error?e.message:'다시 확인해 주세요.');}finally{working.current=false;if(alive.current)setBusy(false);}};
 const load=async()=>{if(!token)throw new Error('유효한 회신 링크를 열어 주세요.');const d=await call({op:'detail'});if(alive.current)setData(d);};
 useEffect(()=>{alive.current=true;const old=document.title;document.title='PSI · 현장 조치 회신';const meta=document.createElement('meta');meta.name='robots';meta.content='noindex,nofollow,noarchive';document.head.append(meta);const t=setTimeout(()=>void run(load),0);return()=>{alive.current=false;clearTimeout(t);meta.remove();document.title=old;};},[]);
 useEffect(()=>{if(!photo){setPreview('');return;}const u=URL.createObjectURL(photo.file);setPreview(u);return()=>URL.revokeObjectURL(u);},[photo]);
 useEffect(()=>{if(!photo&&!note.trim())return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};addEventListener('beforeunload',warn);return()=>removeEventListener('beforeunload',warn);},[photo,note]);
 const choose=(f:File)=>void run(async()=>{const o=await optimizePhoto(f,false,1048576);if(alive.current){reset();setPhoto(o);setConsent(false);}});
 const replies:ShareReply[]=data?.responses||[],done=replies.length>=3||replies.some(r=>r.kind==='photo');
 const guide=replyKindGuide(kind),missing=replyMissing({kind,name,note,consent,photo:!!photo});
 const acceptReceipt=(response:ShareReply)=>{
  if(!alive.current)return;
  pendingSubmission.current=null;setUncertain(false);setError('');
  setData((old:any)=>({...old,responses:[...(old.responses||[]).filter((r:ShareReply)=>r.requestId!==response.requestId),response]}));
  setMessage('회신이 접수됐습니다. 요청 담당자가 내용을 확인합니다. 사진 회신도 현장 재점검 전에는 완료가 아닙니다.');
  setNote('');setPhoto(null);setConsent(false);reset();
 };
 const submit=()=>void run(async()=>{
  if(!pendingSubmission.current){
   if(missing.length)throw new Error(missing[0]+' 후 다시 진행해 주세요.');
   const payload={op:'reply',requestId:request.current,kind,name:name.trim(),note:note.trim(),consent:true,...(kind==='photo'&&photo?{photoId:pid.current,base64:await base64(photo.file),receipt:photo.receipt}:{})};
   pendingSubmission.current=payload;sent.current=true;
  }
  try{const d=await call(pendingSubmission.current);acceptReceipt(d.response);}
  catch(e){if(alive.current)setUncertain(true);throw e;}
 });
 const checkReceipt=()=>void run(async()=>{
  if(!pendingSubmission.current)return;
  const d=await call({op:'detail'});
  const found=(d.responses||[]).find((r:ShareReply)=>r.requestId===pendingSubmission.current?.requestId);
  if(found)acceptReceipt(found);
  else if(alive.current)setMessage('현재 조회에는 이 회신이 보이지 않습니다. 같은 사진·내용으로 다시 보내면 기존 회신 번호로 확인합니다.');
 });
 const reviseAfterUnknown=()=>{
  if(!window.confirm('기존 회신이 이미 접수됐을 수 있습니다. 새 회신을 작성하면 중복될 수 있습니다. 먼저 담당자에게 접수 여부를 확인했나요?'))return;
  pendingSubmission.current=null;setUncertain(false);setError('');setMessage('이전 요청의 접수 여부는 확인되지 않았습니다. 새로운 회신으로 작성합니다.');reset();
 };
 return <main className="si-workspace si-reply-page"><header><p className="si-eyebrow">NEW-PSI · 현장 조치 회신</p><h1>현장 조치 요청에 답변하기</h1><p>앱 설치나 관리자 계정 없이 가능합니다. 받은 요청을 확인한 뒤 현재 상황에 맞춰 회신하세요.</p></header>{error&&<p role="alert" className="si-notice si-error">{error}</p>}{message&&<p role="status" className="si-notice">{message}</p>}{busy&&<p role="status">처리 중…</p>}{!data&&<button className="si-btn" disabled={busy} onClick={()=>void run(load)}>링크 다시 확인</button>}
 {data&&<><nav className="si-reply-journey" aria-label="회신 진행 단계"><ol><li className="is-done"><b>1. 요청 확인</b><span>대상과 내용 확인</span></li><li className={done?'is-done':'is-current'}><b>2. 회신 작성</b><span>완료 사진·예정·어려움 중 선택</span></li><li className={done?'is-done':''}><b>3. 접수 확인</b><span>전송 뒤 접수 기록 확인</span></li></ol></nav><section className="si-reply-request"><span className="si-reply-badge">공유 당시 고정 요청 · 완료 승인 아님</span><h2>{data.snapshot.title}</h2><dl><div><dt>담당</dt><dd>{data.snapshot.owner}</dd></div><div><dt>기한</dt><dd>{data.snapshot.dueDate}</dd></div></dl><p className="si-caption">링크 만료 {new Date(data.expiresAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 한국시간</p>{original?<img className="si-reply-photo" src={original} alt="공유된 조치 전 원본사진"/>:<button className="si-btn" disabled={busy} onClick={()=>void run(async()=>{const d=await call({op:'photo'});if(alive.current)setOriginal(`data:${d.mime};base64,${d.base64}`);})}>요청 사진 보기</button>}</section>
 {replies.length>0&&<section className="si-reply-history" aria-label="접수한 회신"><h2>접수 기록</h2>{replies.map(r=><article key={r.requestId}><b>{replyKindLabel[r.kind]}</b><p>{r.note}</p><small>{r.name} (본인 입력) · {new Date(r.submittedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</small></article>)}</section>}
 {!done?<section className="si-reply-form" aria-label="조치 회신 작성"><h2>현재 어떤 상황인가요?</h2><p className="si-reply-lead">상황에 맞는 항목 하나를 선택하세요. 아직 개선 전이라면 사진 없이도 회신할 수 있습니다.</p><fieldset disabled={busy||uncertain}><legend>회신 종류</legend>{(['photo','planned','difficult'] as const).map(k=><label key={k}><input type="radio" name="reply-kind" checked={kind===k} onChange={()=>{reset();setKind(k);setPhoto(null);setConsent(false);}}/>{replyKindGuide(k).choiceLabel}</label>)}</fieldset><div className="si-reply-kind-guide" role="status"><strong>{guide.heading}</strong><p>{guide.help}</p></div><label htmlFor="reply-name">응답자·공종 (본인 입력)</label><input id="reply-name" value={name} maxLength={50} disabled={busy||uncertain} onChange={e=>{reset();setName(e.target.value);}}/>
 {kind==='photo'&&<div className="si-reply-capture"><p>개선한 부분과 주변 상태가 함께 보이게 촬영하세요.</p><button className="si-btn si-primary" disabled={busy||uncertain} onClick={()=>setCamera(true)}>개선사진 바로 촬영</button><label className="si-btn">사진 선택<input type="file" aria-label="회신 개선사진 선택" accept="image/jpeg,image/png,image/webp" disabled={busy||uncertain} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)choose(f);}}/></label>{preview&&<img className="si-reply-photo" src={preview} alt="회신할 개선사진 미리보기"/>}{photo&&<p className="si-caption">{(photo.receipt.source_bytes/1048576).toFixed(2)}MB → {(photo.file.size/1048576).toFixed(2)}MB · {photo.receipt.uploaded_width}×{photo.receipt.uploaded_height}px · 기기 원본 유지</p>}</div>}
 <label htmlFor="reply-note">{guide.noteLabel}</label><textarea id="reply-note" placeholder={guide.placeholder} value={note} maxLength={1000} rows={3} disabled={busy||uncertain} onChange={e=>{reset();setNote(e.target.value);}}/><label className="si-reply-consent"><input type="checkbox" checked={consent} disabled={busy||uncertain} onChange={e=>setConsent(e.target.checked)}/>이름·회신·선택 사진의 보관을 허용합니다. 불필요한 얼굴·명찰 등은 처리했습니다.</label>{uncertain&&<section className="si-reply-uncertain" aria-label="회신 접수 확인" role="status"><strong>접수 결과를 확인하지 못했습니다</strong><p>회신이 저장됐을 수도 있습니다. 입력한 사진·내용을 그대로 보관 중이며 중복 제출되지 않도록 같은 회신 번호를 유지합니다. 먼저 접수 기록을 확인하세요.</p><div className="si-inline"><button type="button" className="si-btn" disabled={busy} onClick={checkReceipt}>회신 접수 여부 다시 확인</button><button type="button" className="si-btn" disabled={busy} onClick={reviseAfterUnknown}>다른 내용으로 새로 작성</button></div></section>}
 <button className="si-btn si-primary si-reply-submit" disabled={busy||(!uncertain&&missing.length>0)} onClick={submit}>{busy?'회신 접수 확인 중…':uncertain?'같은 회신 다시 확인·보내기':guide.submitLabel}</button>{!uncertain&&missing.length>0&&<p className="si-reply-missing" role="status">제출 전 필요한 항목: {missing.join(' · ')}</p>}<p className="si-caption">링크당 회신 3회·개선사진 1장(1MB 이하), 사진 업로드 시도 최대 2개 범위. 응답이 끊기면 같은 내용으로 재시도하세요.</p></section>:<p className="si-notice">이 링크의 회신이 모두 접수되었습니다. 사진 제출은 개선 완료 승인과 다르며 현장 재점검은 별도로 진행됩니다. 추가 내용은 요청 담당자에게 알려 주세요.</p>}</>}
 <footer><p>링크 소지자는 열람·회신할 수 있습니다. 필요한 상대 외에는 재전달하지 마세요.</p><p>응답자 이름은 본인 입력입니다. 사진 제출은 신원 인증·완료 승인·전자서명이 아닙니다. 만료·차단 후에도 내려받은 사본·캡처는 회수되지 않습니다.</p></footer>{camera&&<InspectorCameraDialog onClose={()=>setCamera(false)} onUse={f=>{setCamera(false);choose(f);}}/>}</main>;
}
