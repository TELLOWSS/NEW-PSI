import React, {useEffect, useRef, useState} from 'react';
import InspectorCameraDialog from './InspectorCameraDialog';
import {legalForText} from '../../lib/inspector/legal';
import {sourceReviewState} from '../../lib/inspector/sourceReview';

type LocalRecord={id:string;createdAt:string;note:string;action:string;photo:File;sha256:string|null;legalVersion:string;reviewedAt:string};
const DB='psi-inspector-local-records', STORE='records';
function openRecords():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  let request:IDBOpenDBRequest;
  try{request=indexedDB.open(DB,1);}catch(error){reject(error);return;}
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'id'});};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error('기기 저장소를 열지 못했습니다.'));
  request.onblocked=()=>reject(new Error('다른 탭을 닫은 뒤 다시 시도해 주세요.'));
 });
}
async function runStore<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore,set:(value:T)=>void)=>void):Promise<T>{
 const db=await openRecords();
 return new Promise((resolve,reject)=>{
  let tx:IDBTransaction,value:T;
  try{tx=db.transaction(STORE,mode);work(tx.objectStore(STORE),result=>{value=result;});}catch(error){db.close();reject(error);return;}
  tx.oncomplete=()=>{db.close();resolve(value);};
  tx.onabort=tx.onerror=()=>{db.close();reject(tx.error||new Error('기기 저장이 중단됐습니다.'));};
 });
}
async function hash(file:File):Promise<string|null>{
 try{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('');}
 catch{return null;}
}
const list=()=>runStore<LocalRecord[]>('readonly',(store,set)=>{const request=store.getAll();request.onsuccess=()=>set((request.result as LocalRecord[]).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));});
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}

/** Local-only manual inspection. No server sync or image inference. */
export default function InspectorLocalDraft(){
 const [photo,setPhoto]=useState<File|null>(null),[url,setUrl]=useState(''),[note,setNote]=useState(''),[action,setAction]=useState('');
 const [rows,setRows]=useState<LocalRecord[]>([]),[camera,setCamera]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const flight=useRef(false);
 const refresh=async()=>{try{setRows(await list());}catch{setMessage('기기 저장 기록을 열지 못했습니다. 브라우저 저장 설정을 확인해 주세요.');}};
 useEffect(()=>{void refresh();},[]);
 useEffect(()=>{if(!photo){setUrl('');return;}const next=URL.createObjectURL(photo);setUrl(next);return()=>URL.revokeObjectURL(next);},[photo]);
 useEffect(()=>{if(!photo&&!note&&!action)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[photo,note,action]);
 const reference=legalForText(note,new Date().toISOString());
 const choose=(file:File)=>{if(photo&&!window.confirm('현재 저장 전 사진을 바꿀까요? 입력한 내용은 유지됩니다.'))return;setPhoto(file);setMessage('');};
 const save=async()=>{
  if(flight.current||!photo||!note.trim())return;
  flight.current=true;setBusy(true);setMessage('');
  try{
   const record:LocalRecord={id:crypto.randomUUID(),createdAt:new Date().toISOString(),note:note.trim(),action:action.trim(),photo,sha256:await hash(photo),legalVersion:reference.version,reviewedAt:reference.reviewedAt};
   await runStore<void>('readwrite',store=>{store.add(record);});
   setPhoto(null);setNote('');setAction('');setMessage(record.sha256?'기기에 저장했습니다. 서버에는 전송하지 않았습니다.':'기기에 저장했습니다. 파일 해시는 확인하지 못했습니다.');
   await refresh();
  }catch(error){setMessage(error instanceof DOMException&&error.name==='QuotaExceededError'?'저장 공간이 부족합니다. 사진을 내려받거나 공간을 확보한 뒤 다시 시도하세요.':'기기에 저장하지 못했습니다. 입력과 사진을 유지합니다. 다시 시도하거나 사진을 내려받으세요.');}
  finally{flight.current=false;setBusy(false);}
 };
 return <details className="si-local-inspection" onToggle={e=>{if(e.currentTarget.open)void refresh();}}>
  <summary>통신 없이 기기에서 직접 점검</summary>
  <section aria-label="기기 직접 점검">
   <h2>사진과 점검 내용을 이 기기에 보관</h2>
   <p>사진을 자동 분석하지 않습니다. 직접 확인한 내용으로 관련 기준을 찾아보는 기능입니다. 서버 업로드와 유료 AI 호출은 하지 않습니다.</p>
   <p>현재 열린 화면에서 사용할 수 있습니다. 앱을 닫은 뒤 인터넷 없이 다시 여는 기능은 아직 준비되지 않았습니다. 브라우저 데이터 삭제나 기기 분실 시 기록이 사라질 수 있으니 별도로 내려받으세요.</p>
   {photo?<>{url&&<img src={url} alt="기기 점검에 선택한 사진" style={{display:'block',maxWidth:'100%',maxHeight:260,objectFit:'contain'}}/>}<p>{photo.name} · {Math.ceil(photo.size/1024)} KB</p><button type="button" className="si-btn" disabled={busy} onClick={()=>download(photo,photo.name)}>선택 사진 내려받기</button></>:<p>사진을 촬영하거나 선택해 주세요.</p>}
   <div><button type="button" className="si-btn" disabled={busy} onClick={()=>setCamera(true)}>기기 점검 사진 촬영</button> <label className="si-btn">기기 점검 사진 선택<input aria-label="기기 점검 사진 선택" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)choose(file);}}/></label></div>
   <label>직접 확인한 내용<textarea aria-label="직접 확인한 내용" maxLength={4000} value={note} disabled={busy} onChange={e=>setNote(e.target.value)} placeholder="예: 시스템비계 발판 사이가 벌어져 보여 실측이 필요함"/></label>
   <label>현장 조치·확인 계획<textarea aria-label="현장 조치·확인 계획" maxLength={4000} value={action} disabled={busy} onChange={e=>setAction(e.target.value)} placeholder="예: 접근을 통제하고 담당자와 발판 상태 확인"/></label>
   {note.trim()&&<div aria-label="입력 내용으로 찾은 기준"><b>입력 내용으로 찾은 참고 기준</b><p>기준 버전 {reference.version} · 검토일 {reference.reviewedAt}. 현재 적용 여부는 현장에서 확인하세요.</p>{reference.cards.length?reference.cards.slice(0,3).map(card=><article key={card.id}><strong>{card.title}</strong><p>{sourceReviewState(card.sourceReview).label}</p>{card.duties.slice(0,2).map(d=><p key={d.url}>{d.label}: {d.summary} <a href={d.url} target="_blank" rel="noreferrer">원문 확인 (인터넷 필요)</a></p>)}<p>{card.scope}</p></article>):<p>일치하는 기준을 찾지 못했습니다. 위험이 없다는 뜻은 아닙니다.</p>}</div>}
   <button type="button" className="si-btn si-primary" disabled={busy||!photo||!note.trim()} onClick={()=>void save()}>{busy?'기기에 저장 중…':'사진과 내용 기기에 저장'}</button>
   {message&&<p role="status">{message}</p>}
   <h3>이 브라우저에 보관된 점검 {rows.length}건</h3>
   {rows.map(row=><article key={row.id}><p>{new Date(row.createdAt).toLocaleString('ko-KR')} · {row.note}</p><p>조치 계획: {row.action||'미작성'} · 파일 무결성 기록: {row.sha256?'SHA-256 기록됨':'미확인'}</p><button type="button" className="si-btn" onClick={()=>download(row.photo,row.photo.name||'PSI-photo.jpg')}>사진 내려받기</button> <button type="button" className="si-btn" onClick={()=>{const {photo:stored,...data}=row;download(new Blob([JSON.stringify({...data,photoName:stored.name,photoType:stored.type},null,2)],{type:'application/json'}),'PSI-local-record-'+row.id+'.json');}}>점검 내용 내려받기</button></article>)}
   <p>해시는 파일 변경을 비교하기 위한 값이며 촬영 시각·장소 또는 안전 여부를 증명하지 않습니다.</p>
  </section>
  {camera&&<InspectorCameraDialog onClose={()=>setCamera(false)} onUse={file=>{setCamera(false);choose(file);}}/>}
 </details>;
}
