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
  let tx:IDBTransaction,value:T,requestError:DOMException|null=null;
  try{tx=db.transaction(STORE,mode);work(tx.objectStore(STORE),result=>{value=result;});}catch(error){db.close();reject(error);return;}
  tx.oncomplete=()=>{db.close();resolve(value);};
  tx.onerror=event=>{requestError=(event.target as IDBRequest).error;};
  tx.onabort=()=>{db.close();reject(tx.error||requestError||new Error('기기 저장이 중단됐습니다.'));};
 });
}
async function hash(file:File):Promise<string|null>{
 try{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('');}
 catch{return null;}
}
const list=()=>runStore<LocalRecord[]>('readonly',(store,set)=>{const request=store.getAll();request.onsuccess=()=>set((request.result as LocalRecord[]).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));});
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}

const BACKUP_LIMIT=20*1024*1024;
async function packRecord(row:LocalRecord):Promise<Blob>{
 if(row.photo.size>BACKUP_LIMIT)throw new Error('사진이 20MB를 넘어 백업할 수 없습니다. 사진을 별도로 내려받으세요.');
 if(!['image/jpeg','image/png','image/webp'].includes(row.photo.type))throw new Error('이 사진 형식은 함께 백업하여 복원할 수 없습니다. 사진과 점검 내용을 각각 내려받으세요.');
 if(!row.photo.size)throw new Error('사진이 비어 있어 함께 백업할 수 없습니다. 사진과 점검 내용을 각각 확인하세요.');
 if((row.photo.name||'PSI-photo').length>255)throw new Error('사진 이름이 길어 함께 백업할 수 없습니다. 사진과 점검 내용을 각각 내려받으세요.');
 const digest=await hash(row.photo);
 if(!digest)throw new Error('무결성을 확인할 수 없어 백업하지 못했습니다. 다시 시도하세요.');
 if(row.sha256&&row.sha256!==digest)throw new Error('저장된 사진의 해시가 달라 백업을 중단했습니다. 사진을 별도로 확인하세요.');
 const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(new Error('사진을 읽지 못했습니다.'));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(row.photo);});
 return new Blob([JSON.stringify({format:'psi-local-inspection',version:1,record:{id:row.id,createdAt:row.createdAt,note:row.note,action:row.action,legalVersion:row.legalVersion,reviewedAt:row.reviewedAt,photoName:row.photo.name||'PSI-photo',photoType:row.photo.type,sha256:digest,photoData:dataUrl.split(',')[1]}})],{type:'application/json'});
}
async function unpackRecord(file:File):Promise<LocalRecord>{
 if(file.size>Math.ceil(BACKUP_LIMIT*1.4)+16384)throw new Error('백업 파일이 허용 크기를 초과합니다.');
 let data:any;try{data=JSON.parse(await file.text());}catch{throw new Error('백업 파일을 읽을 수 없습니다.');}
 const r=data?.record;
 if(data?.format!=='psi-local-inspection'||data?.version!==1||!r||typeof r!=='object'||!/^[-a-f0-9]{36}$/i.test(r.id)||typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt))||typeof r.note!=='string'||!r.note.trim()||r.note.length>4000||typeof r.action!=='string'||r.action.length>4000||typeof r.legalVersion!=='string'||r.legalVersion.length>200||typeof r.reviewedAt!=='string'||r.reviewedAt.length>50||typeof r.photoName!=='string'||r.photoName.length>255||!['image/jpeg','image/png','image/webp'].includes(r.photoType)||!/^[a-f0-9]{64}$/.test(r.sha256)||typeof r.photoData!=='string'||r.photoData.length>Math.ceil(BACKUP_LIMIT*4/3)+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(r.photoData))throw new Error('지원하지 않거나 손상된 백업 파일입니다.');
 let raw:string;try{raw=atob(r.photoData);}catch{throw new Error('백업 사진을 읽을 수 없습니다.');}
 if(!raw.length||raw.length>BACKUP_LIMIT)throw new Error('사진 크기가 올바르지 않습니다.');
 const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 const photo=new File([bytes],r.photoName,{type:r.photoType});
 if(await hash(photo)!==r.sha256)throw new Error('백업 사진의 무결성이 확인되지 않아 복원을 중단했습니다.');
 return {id:r.id,createdAt:r.createdAt,note:r.note,action:r.action,legalVersion:r.legalVersion,reviewedAt:r.reviewedAt,photo,sha256:r.sha256};
}
/** Local-only manual inspection. No server sync or image inference. */
export default function InspectorLocalDraft({offlineEntry=false}:{offlineEntry?:boolean}){
 const [photo,setPhoto]=useState<File|null>(null),[url,setUrl]=useState(''),[note,setNote]=useState(''),[action,setAction]=useState('');
 const [rows,setRows]=useState<LocalRecord[]>([]),[camera,setCamera]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const flight=useRef(false),readSequence=useRef(0);
 const [readState,setReadState]=useState<'loading'|'ready'|'error'>('loading');
 const [checks,setChecks]=useState<Record<string,string>>({});
 const refresh=async()=>{const sequence=++readSequence.current;setChecks({});setReadState('loading');try{const found=await list();if(sequence===readSequence.current){setRows(found);setReadState('ready');}}catch{if(sequence===readSequence.current)setReadState('error');}};
 useEffect(()=>{void refresh();},[]);
 useEffect(()=>{if(!photo){setUrl('');return;}const next=URL.createObjectURL(photo);setUrl(next);return()=>URL.revokeObjectURL(next);},[photo]);
 useEffect(()=>{if(!photo&&!note&&!action)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[photo,note,action]);
 const reference=legalForText(note,new Date().toISOString());
 // Do not present legacy, unreviewed, expired, or withdrawn material as guidance.
 const reviewedCards=reference.cards.filter(card=>sourceReviewState(card.sourceReview).code==='reviewed');
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
 const remove=async(id:string)=>{
  if(busy||!window.confirm('이 기기에 보관된 점검과 사진을 삭제할까요? 필요한 자료는 먼저 내려받으세요.'))return;
  setBusy(true);setMessage('');
  try{await runStore<void>('readwrite',store=>{store.delete(id);});await refresh();setMessage('선택한 기기 기록을 삭제했습니다.');}
  catch{setMessage('기록을 삭제하지 못했습니다. 다시 확인해 주세요.');}
  finally{setBusy(false);}
 };
 const verifyPhoto=async(id:string)=>{
  if(flight.current)return;flight.current=true;setBusy(true);
  setChecks(prev=>({...prev,[id]:'사진을 확인하고 있습니다…'}));
  try{
   const current=await runStore<LocalRecord|undefined>('readonly',(store,set)=>{const request=store.get(id);request.onsuccess=()=>set(request.result as LocalRecord|undefined);});
   let result:string;
   if(!current)result='기록을 찾지 못했습니다. 목록을 다시 확인하세요.';
   else if(!current.sha256)result='저장 당시 비교값이 없어 변경 여부를 확인할 수 없습니다. 원본을 별도로 보관하세요.';
   else {const digest=await hash(current.photo);result=!digest?'사진을 읽거나 비교값을 계산하지 못했습니다. 다시 시도하세요.':digest===current.sha256?'확인 시점의 사진이 저장된 비교값과 일치합니다.':'사진이 저장된 비교값과 다릅니다. 원본을 별도로 확인하세요.';}
   setChecks(prev=>({...prev,[id]:result}));
  }catch{setChecks(prev=>({...prev,[id]:'기기 기록을 읽지 못했습니다. 다시 시도하세요.'}));}
  finally{flight.current=false;setBusy(false);}
 };
 const backup=async(row:LocalRecord)=>{if(flight.current)return;flight.current=true;setBusy(true);setMessage('');try{download(await packRecord(row),'PSI-backup-'+row.id+'.json');setMessage('백업 파일 내려받기를 요청했습니다. 저장된 파일을 확인하고 안전한 장소에 보관하세요.');}catch(error){setMessage(error instanceof Error?error.message:'백업하지 못했습니다.');}finally{flight.current=false;setBusy(false);}};
 const restore=async(file:File)=>{if(flight.current)return;flight.current=true;setBusy(true);setMessage('');try{const record=await unpackRecord(file);await runStore<void>('readwrite',store=>{store.add(record);});await refresh();setMessage('백업을 이 기기에 복원했습니다. 서버에는 전송하지 않았습니다.');}catch(error){setMessage(error instanceof DOMException&&error.name==='ConstraintError'?'같은 점검이 이미 이 기기에 있습니다. 기존 기록은 변경하지 않았습니다.':error instanceof Error?error.message:'복원하지 못했습니다.');}finally{flight.current=false;setBusy(false);}};
 return <details id="si-local-inspection" className="si-local-inspection" onToggle={e=>{if(e.currentTarget.open)void refresh();}}>
  <summary>통신 없이 기기에서 직접 점검</summary>
  <section aria-label="기기 직접 점검">
   <h2>사진과 점검 내용을 이 기기에 보관</h2>
   <p>사진을 자동 분석하지 않습니다. 직접 확인한 내용으로 관련 기준을 찾아보는 기능입니다. 서버 업로드와 유료 AI 호출은 하지 않습니다.</p>
   <p>{offlineEntry?'사전에 오프라인 준비를 마친 기기에서는 이 주소로 인터넷 없이 다시 열 수 있습니다.':'인터넷이 끊기기 전 기기 점검 전용 화면에서 오프라인 준비가 필요합니다.'} 브라우저 데이터 삭제나 기기 분실 시 기록이 사라질 수 있으니 별도로 내려받으세요.</p>{!offlineEntry&&<p><a href="/field-local/">오프라인 재실행 준비 화면 열기</a></p>}
   {photo?<>{url&&<img src={url} alt="기기 점검에 선택한 사진" style={{display:'block',maxWidth:'100%',maxHeight:260,objectFit:'contain'}}/>}<p>{photo.name} · {Math.ceil(photo.size/1024)} KB</p><button type="button" className="si-btn" disabled={busy} onClick={()=>download(photo,photo.name)}>선택 사진 내려받기</button></>:<p>사진을 촬영하거나 선택해 주세요.</p>}
   <div><button type="button" className="si-btn" disabled={busy} onClick={()=>setCamera(true)}>기기 점검 사진 촬영</button> <label className="si-btn">기기 점검 사진 선택<input aria-label="기기 점검 사진 선택" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)choose(file);}}/></label></div>
   <label>직접 확인한 내용<textarea aria-label="직접 확인한 내용" maxLength={4000} value={note} disabled={busy} onChange={e=>setNote(e.target.value)} placeholder="예: 시스템비계 발판 사이가 벌어져 보여 실측이 필요함"/></label>
   <label>현장 조치·확인 계획<textarea aria-label="현장 조치·확인 계획" maxLength={4000} value={action} disabled={busy} onChange={e=>setAction(e.target.value)} placeholder="예: 접근을 통제하고 담당자와 발판 상태 확인"/></label>
   {note.trim()&&<div aria-label="입력 내용으로 찾은 기준"><b>입력 내용으로 찾은 참고 기준</b><p>자료 묶음 버전 {reference.version} · 묶음 기준일 {reference.reviewedAt}. 개별 기준의 현재 적용 여부는 현장에서 확인하세요.</p>{reviewedCards.length?reviewedCards.slice(0,3).map(card=><article key={card.id}><strong>{card.title}</strong><p>{sourceReviewState(card.sourceReview).label}</p>{card.duties.slice(0,2).map(d=><p key={d.url}>{d.label}: {d.summary} <a href={d.url} target="_blank" rel="noreferrer">원문 확인 (인터넷 필요)</a></p>)}<p>{card.scope}</p></article>):<p>현재 입력에 대해 검토 이력과 검토 기한이 확인된 기준을 찾지 못했습니다. 위험이 없다는 뜻이 아니며, 현장 담당자가 적용 기준을 별도로 확인해야 합니다.</p>}</div>}
   <button type="button" className="si-btn si-primary" disabled={busy||!photo||!note.trim()} onClick={()=>void save()}>{busy?'기기에 저장 중…':'사진과 내용 기기에 저장'}</button>
   {message&&<p role="status">{message}</p>}
   <h3>{readState==='ready'?`이 브라우저에 보관된 점검 ${rows.length}건`:'이 브라우저의 점검 기록'}</h3>
   {readState==='loading'&&<p role="status">기기 기록을 확인하고 있습니다…</p>}
   {readState==='error'&&<div role="alert"><p>기기 기록을 불러오지 못해 보관 건수를 확인할 수 없습니다. 기록이 없다는 뜻은 아닙니다. 브라우저 저장 설정과 남은 공간을 확인한 뒤 다시 시도하세요.</p><button type="button" className="si-btn" disabled={busy} onClick={()=>void refresh()}>기기 기록 다시 확인</button></div>}
   <p>백업에는 사진과 점검 내용이 모두 들어 있으며 암호화되지 않습니다. 안전한 장소에 보관하세요. 한 파일당 사진 20MB까지 지원합니다.</p>
   <label className="si-btn">백업 파일 복원<input type="file" accept="application/json,.json" aria-label="백업 파일 복원" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void restore(file);}}/></label>
   {readState==='ready'&&rows.map(row=><article key={row.id}><p>{new Date(row.createdAt).toLocaleString('ko-KR')} · {row.note}</p><p>조치 계획: {row.action||'미작성'} · 파일 무결성 기록: {row.sha256?'SHA-256 기록됨':'미확인'}</p><button type="button" className="si-btn" disabled={busy} onClick={()=>void verifyPhoto(row.id)}>사진 변경 확인</button> {checks[row.id]&&<p role="status">{checks[row.id]}</p>} <button type="button" className="si-btn" onClick={()=>download(row.photo,row.photo.name||'PSI-photo.jpg')}>사진 내려받기</button> <button type="button" className="si-btn" onClick={()=>{const {photo:stored,...data}=row;download(new Blob([JSON.stringify({...data,photoName:stored.name,photoType:stored.type},null,2)],{type:'application/json'}),'PSI-local-record-'+row.id+'.json');}}>점검 내용 내려받기</button> <button type="button" className="si-btn" disabled={busy} onClick={()=>void backup(row)}>사진과 기록 함께 백업</button> <button type="button" className="si-btn" disabled={busy} onClick={()=>void remove(row.id)}>이 기기 기록 삭제</button></article>)}
   <p>사진 변경 확인은 저장된 사진과 저장 당시 비교값만 대조합니다. 점검 내용의 변경이나 촬영 시각·장소·안전 여부는 증명하지 않습니다.</p>
  </section>
  {camera&&<InspectorCameraDialog onClose={()=>setCamera(false)} onUse={file=>{setCamera(false);choose(file);}}/>}
 </details>;
}
