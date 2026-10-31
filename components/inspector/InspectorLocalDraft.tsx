import React, {useEffect, useRef, useState} from 'react';
import InspectorCameraDialog from './InspectorCameraDialog';
import {legalForText} from '../../lib/inspector/legal';
import {sourceReviewState} from '../../lib/inspector/sourceReview';
import {FOLLOWUP_STATES, FOLLOWUP_LABELS, validateFollowup, validateAdditionalActions, overdue} from '../../lib/inspector/localFollowup.mjs';

type Followup={status:string;assignee:string;dueDate:string;history:{status:string;assignee:string;dueDate:string;note:string;at:string}[]};
type AdditionalAction={id:string;title:string;followup?:Followup;photo?:File;photoSha256?:string};
type PhotoRole='overview'|'detail'|'unspecified';
type AfterHistory={photo:File;sha256:string;replacedAt:string};
type ContextHistory={photo:File;sha256:string;role:'overview'|'detail';replacedAt:string};
type LocalRecord={afterHistory?:AfterHistory[];contextHistory?:ContextHistory[];contextDetached?:boolean;contextFirst?:boolean;photoRole?:PhotoRole;contextPhoto?:File;contextSha256?:string;contextRole?:'overview'|'detail';additionalActions?:AdditionalAction[];afterPhoto?:File;afterSha256?:string;followup?:Followup;id:string;createdAt:string;note:string;action:string;photo:File;sha256:string|null;legalVersion:string;reviewedAt:string};
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
function backupIssue(photo:File):string|null{
 if(photo.size>BACKUP_LIMIT)return '사진이 20MB를 넘어 백업할 수 없습니다. 사진을 별도로 내려받으세요.';
 if(!['image/jpeg','image/png','image/webp'].includes(photo.type))return '이 사진 형식은 함께 백업하여 복원할 수 없습니다. 사진과 점검 내용을 각각 내려받으세요.';
 if(!photo.size)return '사진이 비어 있어 함께 백업할 수 없습니다. 사진과 점검 내용을 각각 확인하세요.';
 if((photo.name||'PSI-photo').length>255)return '사진 이름이 길어 함께 백업할 수 없습니다. 사진과 점검 내용을 각각 내려받으세요.';
 return null;
}
async function packRecord(row:LocalRecord):Promise<Blob>{
 const issue=backupIssue(row.photo);if(issue)throw new Error(issue);
 const digest=await hash(row.photo);
 if(!digest)throw new Error('무결성을 확인할 수 없어 백업하지 못했습니다. 다시 시도하세요.');
 if(row.sha256&&row.sha256!==digest)throw new Error('저장된 사진의 해시가 달라 백업을 중단했습니다. 사진을 별도로 확인하세요.');
 const toData=async(photo:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result.split(',')[1]):reject(new Error('사진을 읽지 못했습니다.'));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(photo);});
 const dataUrl=await toData(row.photo);
 let afterPhotoData:Record<string,string>|undefined;
 if(row.afterPhoto){
  const issue=backupIssue(row.afterPhoto);if(issue)throw new Error('조치 후 '+issue);
  const digest=await hash(row.afterPhoto);if(!digest||digest!==row.afterSha256)throw new Error('조치 후 사진의 변경 여부를 확인할 수 없어 백업을 중단했습니다.');
  afterPhotoData={name:row.afterPhoto.name,type:row.afterPhoto.type,sha256:digest,data:await toData(row.afterPhoto)};
 }
 const afterHistory=row.afterHistory||[];
 if(afterHistory.length>5||afterHistory.reduce((n,item)=>n+item.photo.size,0)>BACKUP_LIMIT)throw new Error('이전 조치 후 사진 이력이 백업 허용 범위를 초과합니다.');
 const afterHistoryData=await Promise.all(afterHistory.map(async item=>{
  const issue=backupIssue(item.photo);if(issue)throw new Error('이전 조치 후 사진 '+issue);
  const digest=await hash(item.photo);if(!digest||digest!==item.sha256)throw new Error('이전 조치 후 사진의 무결성을 확인할 수 없습니다.');
  if(!Number.isFinite(Date.parse(item.replacedAt)))throw new Error('이전 조치 후 사진 이력을 확인할 수 없습니다.');
  return {name:item.photo.name,type:item.photo.type,sha256:digest,replacedAt:item.replacedAt,data:await toData(item.photo)};
 }));
 const actionPhotos=(row.additionalActions||[]).filter(item=>item.photo);
 if(actionPhotos.reduce((n,item)=>n+(item.photo?.size||0),0)>BACKUP_LIMIT)throw new Error('조치별 사진 합계가 20MB를 넘어 백업할 수 없습니다.');
 const actionsForBackup=await Promise.all((row.additionalActions||[]).map(async item=>{
  const {photo,photoSha256,...data}=item;
  if(!photo)return data;
  const issue=backupIssue(photo);if(issue)throw new Error('조치별 '+issue);
  const digest=await hash(photo);if(!digest||digest!==photoSha256)throw new Error('조치별 사진의 무결성을 확인할 수 없습니다.');
  return {...data,photo:{name:photo.name,type:photo.type,sha256:digest,data:await toData(photo)}};
 }));
 let contextPhotoData:Record<string,string>|undefined;
 if(row.contextPhoto){
  const issue=backupIssue(row.contextPhoto);if(issue)throw new Error('추가 현장 사진 '+issue);
  if(!['overview','detail'].includes(row.contextRole||''))throw new Error('추가 현장 사진의 역할을 확인해 주세요.');
  const contextDigest=await hash(row.contextPhoto);if(!contextDigest||contextDigest!==row.contextSha256)throw new Error('추가 현장 사진의 무결성을 확인할 수 없습니다.');
  contextPhotoData={name:row.contextPhoto.name,type:row.contextPhoto.type,sha256:contextDigest,data:await toData(row.contextPhoto),role:row.contextRole!};
 }
 const history=row.contextHistory||[];
 if(history.length>5||history.reduce((n,item)=>n+item.photo.size,0)>BACKUP_LIMIT)throw new Error('이전 사진 이력이 백업 허용 범위를 초과합니다.');
 const historyData=await Promise.all(history.map(async item=>{
  const issue=backupIssue(item.photo);if(issue)throw new Error('이전 사진 '+issue);
  const digest=await hash(item.photo);if(!digest||digest!==item.sha256)throw new Error('이전 사진의 무결성을 확인할 수 없습니다.');
  if(!['overview','detail'].includes(item.role)||!Number.isFinite(Date.parse(item.replacedAt)))throw new Error('이전 사진 이력을 확인할 수 없습니다.');
  return {name:item.photo.name,type:item.photo.type,sha256:digest,role:item.role,replacedAt:item.replacedAt,data:await toData(item.photo)};
 }));
 if((typeof row.contextFirst==='boolean'||typeof row.contextDetached==='boolean')&&!row.contextPhoto)throw new Error('사진 순서를 확인할 수 없어 백업하지 못했습니다.');
 const photoSet=!!row.contextPhoto||!!row.photoRole&&row.photoRole!=='unspecified';
 return new Blob([JSON.stringify({format:'psi-local-inspection',version:afterHistory.length?10:history.length?9:typeof row.contextDetached==='boolean'?8:typeof row.contextFirst==='boolean'?7:photoSet?6:actionPhotos.length?5:row.additionalActions?.length?4:row.afterPhoto?3:row.followup?2:1,record:{afterHistory:afterHistory.length?afterHistoryData:undefined,contextHistory:history.length?historyData:undefined,contextDetached:row.contextDetached,contextFirst:row.contextFirst,photoRole:photoSet||afterHistory.length?(row.photoRole||'unspecified'):undefined,contextPhoto:contextPhotoData,additionalActions:photoSet||afterHistory.length?actionsForBackup:row.additionalActions?.length?actionsForBackup:undefined,afterPhoto:afterPhotoData,followup:row.followup,id:row.id,createdAt:row.createdAt,note:row.note,action:row.action,legalVersion:row.legalVersion,reviewedAt:row.reviewedAt,photoName:row.photo.name||'PSI-photo',photoType:row.photo.type,sha256:digest,photoData:dataUrl}})],{type:'application/json'});
}
async function unpackRecord(file:File):Promise<LocalRecord>{
 if(file.size>Math.ceil(BACKUP_LIMIT*8.4)+25000000)throw new Error('백업 파일이 허용 크기를 초과합니다.');
 let data:any;try{data=JSON.parse(await file.text());}catch{throw new Error('백업 파일을 읽을 수 없습니다.');}
 const r=data?.record;
 if(data?.format!=='psi-local-inspection'||![1,2,3,4,5,6,7,8,9,10].includes(data?.version)||!r||typeof r!=='object'||!/^[-a-f0-9]{36}$/i.test(r.id)||typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt))||typeof r.note!=='string'||!r.note.trim()||r.note.length>4000||typeof r.action!=='string'||r.action.length>4000||typeof r.legalVersion!=='string'||r.legalVersion.length>200||typeof r.reviewedAt!=='string'||r.reviewedAt.length>50||typeof r.photoName!=='string'||r.photoName.length>255||!['image/jpeg','image/png','image/webp'].includes(r.photoType)||!/^[a-f0-9]{64}$/.test(r.sha256)||typeof r.photoData!=='string'||r.photoData.length>Math.ceil(BACKUP_LIMIT*4/3)+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(r.photoData))throw new Error('지원하지 않거나 손상된 백업 파일입니다.');
 if((data.version===2||data.version>=3&&r.followup!==undefined)&&!validateFollowup(r.followup))throw new Error('후속 조치 기록이 손상되어 복원하지 못했습니다.');
 if(data.version>=4&&!validateAdditionalActions(r.additionalActions))throw new Error('추가 조치 기록이 손상되어 복원하지 못했습니다.');
 if(data.version===4&&r.additionalActions.some((item:AdditionalAction)=>item.photo!==undefined||item.photoSha256!==undefined))throw new Error('이전 형식의 추가 조치 사진은 복원할 수 없습니다.');
 let raw:string;try{raw=atob(r.photoData);}catch{throw new Error('백업 사진을 읽을 수 없습니다.');}
 if(!raw.length||raw.length>BACKUP_LIMIT)throw new Error('사진 크기가 올바르지 않습니다.');
 const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
 const photo=new File([bytes],r.photoName,{type:r.photoType});
 if(await hash(photo)!==r.sha256)throw new Error('백업 사진의 무결성이 확인되지 않아 복원을 중단했습니다.');
 let afterPhoto:File|undefined;let afterSha256:string|undefined;
 if(data.version===3||(data.version>=4&&r.afterPhoto!==undefined)){
  const a=r.afterPhoto;
  if(!a||typeof a.name!=='string'||a.name.length>255||!['image/jpeg','image/png','image/webp'].includes(a.type)||typeof a.sha256!=='string'||!/^[a-f0-9]{64}$/.test(a.sha256)||typeof a.data!=='string'||a.data.length>Math.ceil(BACKUP_LIMIT*4/3)+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.data))throw new Error('조치 후 사진 백업이 손상되었습니다.');
  let decoded:string;try{decoded=atob(a.data);}catch{throw new Error('조치 후 사진을 읽을 수 없습니다.');}
  if(!decoded.length||decoded.length>BACKUP_LIMIT)throw new Error('조치 후 사진 크기가 올바르지 않습니다.');
  afterPhoto=new File([Uint8Array.from(decoded,c=>c.charCodeAt(0))],a.name,{type:a.type});afterSha256=a.sha256;
  if(await hash(afterPhoto)!==afterSha256)throw new Error('조치 후 사진의 무결성이 확인되지 않아 복원을 중단했습니다.');
 }
 const additionalActions:AdditionalAction[]|undefined=data.version>=4?r.additionalActions:undefined;
 if(data.version>=5&&additionalActions){
  let total=0;
  for(const item of additionalActions){
   const a=item.photo as unknown as {name:string;type:string;sha256:string;data:string}|undefined;
   if(!a)continue;
   if(typeof a.name!=='string'||a.name.length>255||!['image/jpeg','image/png','image/webp'].includes(a.type)||!/^[a-f0-9]{64}$/.test(a.sha256)||typeof a.data!=='string'||a.data.length>Math.ceil(BACKUP_LIMIT*4/3)+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.data))throw new Error('조치별 사진 백업이 손상되었습니다.');
   let decoded:string;try{decoded=atob(a.data);}catch{throw new Error('조치별 사진을 읽을 수 없습니다.');}
   total+=decoded.length;if(!decoded.length||total>BACKUP_LIMIT)throw new Error('조치별 사진 크기가 허용 범위를 초과합니다.');
   const image=new File([Uint8Array.from(decoded,c=>c.charCodeAt(0))],a.name,{type:a.type});
   if(await hash(image)!==a.sha256)throw new Error('조치별 사진의 무결성이 확인되지 않아 복원을 중단했습니다.');
   item.photo=image;item.photoSha256=a.sha256;
  }
 }
 let contextPhoto:File|undefined;let contextSha256:string|undefined;let contextRole:'overview'|'detail'|undefined;
 if(data.version===7&&(typeof r.contextFirst!=='boolean'||!r.contextPhoto))throw new Error('사진 순서 기록이 손상되었습니다.');
 if(data.version===8&&(typeof r.contextDetached!=='boolean'||!r.contextPhoto||(r.contextFirst!==undefined&&typeof r.contextFirst!=='boolean')))throw new Error('사진 연결 상태가 손상되었습니다.');
 if(data.version===9&&(!r.contextPhoto||!Array.isArray(r.contextHistory)||!r.contextHistory.length||r.contextHistory.length>5||(r.contextDetached!==undefined&&typeof r.contextDetached!=='boolean')||(r.contextFirst!==undefined&&typeof r.contextFirst!=='boolean')))throw new Error('이전 사진 이력이 손상되었습니다.');
 if(data.version===10&&(!r.afterPhoto||!Array.isArray(r.afterHistory)||!r.afterHistory.length||r.afterHistory.length>5||(r.contextHistory!==undefined&&(!Array.isArray(r.contextHistory)||!r.contextHistory.length||r.contextHistory.length>5||!r.contextPhoto))||(r.contextDetached!==undefined&&typeof r.contextDetached!=='boolean')||(r.contextFirst!==undefined&&typeof r.contextFirst!=='boolean')||((r.contextDetached!==undefined||r.contextFirst!==undefined)&&!r.contextPhoto)))throw new Error('이전 조치 후 사진 이력이 손상되었습니다.');
 if(data.version>=6){
  if(!['overview','detail','unspecified'].includes(r.photoRole))throw new Error('현장 사진 역할이 손상되었습니다.');
  const c=r.contextPhoto;
  if(c!==undefined){
   if(!c||typeof c.name!=='string'||c.name.length>255||!['image/jpeg','image/png','image/webp'].includes(c.type)||typeof c.sha256!=='string'||!/^[a-f0-9]{64}$/.test(c.sha256)||!['overview','detail'].includes(c.role)||c.role===r.photoRole||typeof c.data!=='string'||c.data.length>Math.ceil(BACKUP_LIMIT*4/3)+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(c.data))throw new Error('추가 현장 사진 백업이 손상되었습니다.');
   let decoded:string;try{decoded=atob(c.data);}catch{throw new Error('추가 현장 사진을 읽을 수 없습니다.');}
   if(!decoded.length||decoded.length>BACKUP_LIMIT)throw new Error('추가 현장 사진 크기가 올바르지 않습니다.');
   contextPhoto=new File([Uint8Array.from(decoded,ch=>ch.charCodeAt(0))],c.name,{type:c.type});contextSha256=c.sha256;contextRole=c.role;
   if(await hash(contextPhoto)!==contextSha256)throw new Error('추가 현장 사진의 무결성이 확인되지 않아 복원을 중단했습니다.');
  }
 }
 const contextHistory:ContextHistory[]=[];
 if(data.version>=9&&r.contextHistory!==undefined){
  let total=0;
  for(const h of r.contextHistory){
   if(!h||typeof h.name!=='string'||h.name.length>255||!['image/jpeg','image/png','image/webp'].includes(h.type)||typeof h.sha256!=='string'||!/^[a-f0-9]{64}$/.test(h.sha256)||!['overview','detail'].includes(h.role)||typeof h.replacedAt!=='string'||!Number.isFinite(Date.parse(h.replacedAt))||typeof h.data!=='string'||h.data.length>Math.ceil(BACKUP_LIMIT*4/3)+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(h.data))throw new Error('이전 사진 이력이 손상되었습니다.');
   let raw:string;try{raw=atob(h.data);}catch{throw new Error('이전 사진을 읽지 못했습니다.');}
   total+=raw.length;if(!raw.length||total>BACKUP_LIMIT)throw new Error('이전 사진 크기가 허용 범위를 초과합니다.');
   const previous=new File([Uint8Array.from(raw,ch=>ch.charCodeAt(0))],h.name,{type:h.type});
   if(await hash(previous)!==h.sha256)throw new Error('이전 사진의 무결성이 확인되지 않아 복원을 중단했습니다.');
   contextHistory.push({photo:previous,sha256:h.sha256,role:h.role,replacedAt:h.replacedAt});
  }
 }
 const afterHistory:AfterHistory[]=[];
 if(data.version===10){
  let total=0;
  for(const h of r.afterHistory){
   if(!h||typeof h.name!=='string'||h.name.length>255||!['image/jpeg','image/png','image/webp'].includes(h.type)||typeof h.sha256!=='string'||!/^[a-f0-9]{64}$/.test(h.sha256)||typeof h.replacedAt!=='string'||!Number.isFinite(Date.parse(h.replacedAt))||typeof h.data!=='string'||h.data.length>Math.ceil(BACKUP_LIMIT*4/3)+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(h.data))throw new Error('이전 조치 후 사진 이력이 손상되었습니다.');
   let raw:string;try{raw=atob(h.data);}catch{throw new Error('이전 조치 후 사진을 읽지 못했습니다.');}
   total+=raw.length;if(!raw.length||total>BACKUP_LIMIT)throw new Error('이전 조치 후 사진 크기가 허용 범위를 초과합니다.');
   const previous=new File([Uint8Array.from(raw,ch=>ch.charCodeAt(0))],h.name,{type:h.type});
   if(await hash(previous)!==h.sha256)throw new Error('이전 조치 후 사진의 무결성이 확인되지 않아 복원을 중단했습니다.');
   afterHistory.push({photo:previous,sha256:h.sha256,replacedAt:h.replacedAt});
  }
 }
 return {afterHistory:afterHistory.length?afterHistory:undefined,contextHistory:contextHistory.length?contextHistory:undefined,contextDetached:data.version>=8?r.contextDetached:undefined,contextFirst:data.version>=7?r.contextFirst:undefined,photoRole:data.version>=6?r.photoRole:undefined,contextPhoto,contextSha256,contextRole,additionalActions,afterPhoto,afterSha256,followup:data.version>=2?r.followup:undefined,id:r.id,createdAt:r.createdAt,note:r.note,action:r.action,legalVersion:r.legalVersion,reviewedAt:r.reviewedAt,photo,sha256:r.sha256};
}
function FollowupEditor({row,busy,onSave}:{row:LocalRecord;busy:boolean;onSave:(id:string,value:Followup)=>Promise<boolean>}){
 const current=row.followup;
 const [status,setStatus]=useState(current?.status||'pending'),[assignee,setAssignee]=useState(current?.assignee||''),[dueDate,setDueDate]=useState(current?.dueDate||''),[note,setNote]=useState('');
 const [editing,setEditing]=useState(false);
 const save=async()=>{
  if(!note.trim())return;
  const history=[...(current?.history||[]),{status,assignee:assignee.trim(),dueDate,note:note.trim(),at:new Date().toISOString()}];
  const value={status,assignee:assignee.trim(),dueDate,history};
  if(await onSave(row.id,value)){setNote('');setEditing(false);}
 };
 return <section aria-label="후속 조치 관리"><p><strong>{current?FOLLOWUP_LABELS[current.status]:'상태 미기록'}</strong> · 담당: {current?.assignee||'미지정'} · 기한: {current?.dueDate||'미정'} {current&&overdue(current)?'· 기한 초과':''}</p>
  <p>기기에만 저장됩니다. 담당자에게 자동 전달되지 않으며, 조치 확인은 사람이 직접 합니다.</p>
  <button type="button" className="si-btn" disabled={busy} onClick={()=>setEditing(!editing)}>{editing?'닫기':'후속 조치 기록'}</button>
  {editing&&<div><label>조치 상태<select value={status} onChange={e=>setStatus(e.target.value)}>{FOLLOWUP_STATES.map(key=><option key={key} value={key}>{FOLLOWUP_LABELS[key]}</option>)}</select></label>
   <label>담당자<input value={assignee} maxLength={100} onChange={e=>setAssignee(e.target.value)} placeholder="미지정 가능"/></label>
   <label>목표 기한<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
   <label>진행·확인 내용<textarea value={note} maxLength={2000} onChange={e=>setNote(e.target.value)} placeholder="임시 조치, 진행 상황 또는 확인 내용을 입력"/></label>
   <button type="button" className="si-btn" disabled={busy||!note.trim()} onClick={()=>void save()}>후속 기록 저장</button></div>}
  {!!current?.history.length&&<details><summary>조치 이력 {current.history.length}건</summary>{current.history.map((entry,i)=><p key={i}>{new Date(entry.at).toLocaleString('ko-KR')} · {FOLLOWUP_LABELS[entry.status]} · {entry.note} · 담당 {entry.assignee||'미지정'} · 기한 {entry.dueDate||'미정'}</p>)}</details>}
 </section>;
}
function ActionItem({row,item,busy,onUpdate,onPhoto}:{key?:string;row:LocalRecord;item:AdditionalAction;busy:boolean;onUpdate:(row:LocalRecord,actions:AdditionalAction[])=>Promise<boolean>;onPhoto:(row:LocalRecord,item:AdditionalAction,file:File)=>Promise<boolean>}){
 const [pending,setPending]=useState<File|null>(null);
 const actions=row.additionalActions||[];
 useEffect(()=>{if(!pending)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[pending]);
 return <div><h5>{item.title}</h5><FollowupEditor row={{...row,followup:item.followup}} busy={busy} onSave={async(_id,value)=>onUpdate(row,actions.map(entry=>entry.id===item.id?{...entry,followup:value}:entry))}/>
  <p>이 조치의 사진: {item.photo?.name||'없음'}</p><label>이 조치 사진 선택<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f&&(!pending||window.confirm('저장하지 않은 사진을 바꿀까요?')))setPending(f);}}/></label>
  {pending&&<div><p>저장 전 사진: {pending.name}</p><button type="button" className="si-btn" disabled={busy} onClick={async()=>{if(await onPhoto(row,item,pending))setPending(null);}}>이 조치에 사진 저장</button> <button type="button" className="si-btn" onClick={()=>download(pending,pending.name)}>저장 전 사진 내려받기</button></div>}
  {item.photo&&<button type="button" className="si-btn" onClick={()=>download(item.photo!,item.photo!.name)}>이 조치 사진 내려받기</button>}
 </div>;
}
function AdditionalActions({row,busy,onUpdate,onPhoto}:{row:LocalRecord;busy:boolean;onUpdate:(row:LocalRecord,actions:AdditionalAction[])=>Promise<boolean>;onPhoto:(row:LocalRecord,item:AdditionalAction,file:File)=>Promise<boolean>}){
 const [title,setTitle]=useState('');
 const actions=row.additionalActions||[];
 const add=async()=>{if(!title.trim()||actions.length>=20)return;if(await onUpdate(row,[...actions,{id:crypto.randomUUID(),title:title.trim()}]))setTitle('');};
 return <section aria-label="추가 조치 항목"><h4>추가 조치 항목 {actions.length}건</h4><p>각 조치를 따로 관리합니다. 조치별 사진은 합계 20MB까지 저장할 수 있습니다.</p>
  {actions.map(item=><ActionItem key={item.id} row={row} item={item} busy={busy} onUpdate={onUpdate} onPhoto={onPhoto}/>)}
  <label>추가할 조치 내용<input value={title} maxLength={200} disabled={busy||actions.length>=20} onChange={e=>setTitle(e.target.value)} placeholder="예: 개구부 덮개 고정"/></label>
  <button type="button" className="si-btn" disabled={busy||!title.trim()||actions.length>=20} onClick={()=>void add()}>조치 항목 추가</button>
  {actions.length>=20&&<p>한 점검에 추가 조치 항목을 20개까지 기록할 수 있습니다.</p>}
 </section>;
}
function ContextPhotoEditor({row,busy,onSave,onOrder,onLink}:{row:LocalRecord;busy:boolean;onSave:(row:LocalRecord,file:File,role:'overview'|'detail')=>Promise<boolean>;onOrder:(row:LocalRecord)=>Promise<void>;onLink:(row:LocalRecord)=>Promise<void>}){
 const [pending,setPending]=useState<File|null>(null),[role,setRole]=useState<'overview'|'detail'>(row.contextRole||(row.photoRole==='overview'?'detail':'overview'));
 const [camera,setCamera]=useState(false),[replacing,setReplacing]=useState(false);
 const [previews,setPreviews]=useState<{primary:string;context:string}>({primary:'',context:''});
 useEffect(()=>{const primary=URL.createObjectURL(row.photo);const context=row.contextPhoto?URL.createObjectURL(row.contextPhoto):'';setPreviews({primary,context});return()=>{URL.revokeObjectURL(primary);if(context)URL.revokeObjectURL(context);};},[row.photo,row.contextPhoto]);
 useEffect(()=>{if(!pending)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[pending]);
 return <section aria-label="현장 사진 묶음"><p>기본 사진: {row.photoRole==='overview'?'현장 전체':row.photoRole==='detail'?'위험 부위':'역할 미지정'} · 추가 사진: {row.contextPhoto?(row.contextDetached?'연결 해제 · 보관 중 · ':'')+(row.contextRole==='overview'?'현장 전체':'위험 부위')+' · '+row.contextPhoto.name:'없음'}</p>
  <p>사진 한 장으로도 점검을 저장할 수 있습니다. 추가 사진은 나중에 연결할 수 있습니다.</p>
  {row.contextPhoto&&!row.contextDetached&&<><div aria-label="현장 사진 표시 순서" style={{display:'flex',gap:12,flexWrap:'wrap'}}>{(row.contextFirst?['context','primary']:['primary','context']).map(which=><figure key={which} style={{margin:0,width:120}}><img src={which==='primary'?previews.primary:previews.context} alt={which==='primary'?'기본 사진':'추가 현장 사진'} style={{width:'100%',height:100,objectFit:'cover'}}/><figcaption>{which==='primary'?'기본 사진':'추가 현장 사진'}</figcaption></figure>)}</div><button type="button" className="si-btn" disabled={busy} onClick={()=>void onOrder(row)}>사진 표시 순서 바꾸기</button><p>표시 순서만 바뀌며 원본과 촬영 구분은 유지됩니다.</p></>}

  {row.contextPhoto&&!row.contextDetached&&!replacing&&<button type="button" className="si-btn" disabled={busy} onClick={()=>setReplacing(true)}>추가 사진 교체</button>}
  {(!row.contextPhoto||replacing)&&<><label>추가 사진 역할<select value={role} disabled={!!row.contextPhoto} onChange={e=>setRole(e.target.value as 'overview'|'detail')}><option value="overview">현장 전체</option><option value="detail">위험 부위</option></select></label><button type="button" className="si-btn" disabled={busy} onClick={()=>{if(pending&&!window.confirm('저장하지 않은 추가 사진을 버리고 다시 촬영할까요?'))return;setCamera(true);}}>추가 현장 사진 촬영</button> <label>현장 사진 추가<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f&&(!pending||window.confirm('저장하지 않은 추가 사진을 바꿀까요?')))setPending(f);}}/></label></>}
  {pending&&<div><p>저장 전 사진: {pending.name}</p><button type="button" className="si-btn" disabled={busy} onClick={async()=>{if(await onSave(row,pending,role)){setPending(null);setReplacing(false);}}}>현장 사진 연결</button> <button type="button" className="si-btn" onClick={()=>download(pending,pending.name)}>추가 사진 내려받기</button></div>}
  {row.contextPhoto&&<div><button type="button" className="si-btn" disabled={busy||!!pending||replacing} onClick={()=>void onLink(row)}>{row.contextDetached?'추가 사진 다시 연결':'추가 사진 연결 해제'}</button> <button type="button" className="si-btn" onClick={()=>download(row.contextPhoto!,row.contextPhoto!.name)}>보관된 현장 사진 내려받기</button><p>연결을 해제해도 사진은 이 기기와 함께 백업되는 기록에 남습니다.</p></div>}
  {replacing&&<button type="button" className="si-btn" disabled={busy} onClick={()=>{if(pending&&!window.confirm('저장하지 않은 사진을 버릴까요?'))return;setPending(null);setReplacing(false);}}>교체 취소</button>}
  {!!row.contextHistory?.length&&<details><summary>이전 현장 사진 {row.contextHistory.length}장</summary><p>교체 시각은 기기 시각이며 촬영 시각과 다를 수 있습니다.</p>{row.contextHistory.map((entry,i)=><p key={i}>{entry.photo.name} · {new Date(entry.replacedAt).toLocaleString('ko-KR')} <button type="button" className="si-btn" onClick={()=>download(entry.photo,entry.photo.name)}>이전 사진 내려받기</button></p>)}</details>}
  {camera&&<InspectorCameraDialog onClose={()=>setCamera(false)} onUse={file=>{setPending(file);setCamera(false);}}/>}
 </section>;
}
/** Local-only manual inspection. No server sync or image inference. */
export default function InspectorLocalDraft({offlineEntry=false}:{offlineEntry?:boolean}){
 const [photo,setPhoto]=useState<File|null>(null),[url,setUrl]=useState(''),[note,setNote]=useState(''),[action,setAction]=useState('');
 const [photoRole,setPhotoRole]=useState<PhotoRole>('unspecified');
 const [rows,setRows]=useState<LocalRecord[]>([]),[camera,setCamera]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [afterCamera,setAfterCamera]=useState<LocalRecord|null>(null),[afterReference,setAfterReference]=useState('');
 const [capturedAfter,setCapturedAfter]=useState<{row:LocalRecord;file:File}|null>(null);
 const flight=useRef(false),readSequence=useRef(0);
 const [readState,setReadState]=useState<'loading'|'ready'|'error'>('loading');
 const [checks,setChecks]=useState<Record<string,string>>({});
 const [filter,setFilter]=useState('all');
 const visibleRows=rows.filter(row=>{const items=[row.followup,...(row.additionalActions||[]).map(item=>item.followup)];return filter==='all'||items.some(item=>filter==='unassigned'?!item?.assignee:filter==='no_due'?!item?.dueDate:filter==='overdue'?!!item&&overdue(item):filter==='review'?item?.status==='review_requested':false);});
 const refresh=async()=>{const sequence=++readSequence.current;setChecks({});setReadState(previous=>previous==='ready'?'ready':'loading');try{const found=await list();if(sequence===readSequence.current){setRows(found);setReadState('ready');}}catch{if(sequence===readSequence.current)setReadState('error');}};
 useEffect(()=>{void refresh();},[]);
 useEffect(()=>{if(!photo){setUrl('');return;}const next=URL.createObjectURL(photo);setUrl(next);return()=>URL.revokeObjectURL(next);},[photo]);
 useEffect(()=>{if(!afterCamera){setAfterReference('');return;}const next=URL.createObjectURL(afterCamera.photo);setAfterReference(next);return()=>URL.revokeObjectURL(next);},[afterCamera]);
 useEffect(()=>{if(!photo&&!note&&!action&&!capturedAfter)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[photo,note,action,capturedAfter]);
 const reference=legalForText(note,new Date().toISOString());
 // Do not present legacy, unreviewed, expired, or withdrawn material as guidance.
 const reviewedCards=reference.cards.filter(card=>sourceReviewState(card.sourceReview).code==='reviewed');
 const choose=(file:File)=>{if(photo&&!window.confirm('현재 저장 전 사진을 바꿀까요? 입력한 내용은 유지됩니다.'))return;setPhoto(file);setMessage('');};
 const save=async()=>{
  if(flight.current||!photo||!note.trim())return;
  flight.current=true;setBusy(true);setMessage('');
  try{
   const record:LocalRecord={photoRole:photoRole==='unspecified'?undefined:photoRole,id:crypto.randomUUID(),createdAt:new Date().toISOString(),note:note.trim(),action:action.trim(),photo,sha256:await hash(photo),legalVersion:reference.version,reviewedAt:reference.reviewedAt};
   await runStore<void>('readwrite',store=>{store.add(record);});
   setPhoto(null);setPhotoRole('unspecified');setNote('');setAction('');setMessage(record.sha256?'기기에 저장했습니다. 서버에는 전송하지 않았습니다.':'기기에 저장했습니다. 파일 해시는 확인하지 못했습니다.');
   await refresh();
  }catch(error){setMessage(error instanceof DOMException&&error.name==='QuotaExceededError'?'저장 공간이 부족합니다. 사진을 내려받거나 공간을 확보한 뒤 다시 시도하세요.':'기기에 저장하지 못했습니다. 입력과 사진을 유지합니다. 다시 시도하거나 사진을 내려받으세요.');}
  finally{flight.current=false;setBusy(false);}
 };
 const changeContextLink=async(row:LocalRecord):Promise<void>=>{
  if(flight.current||!row.contextPhoto)return;
  flight.current=true;setBusy(true);setMessage('');
  try{
   await runStore<void>('readwrite',store=>{const request=store.get(row.id);request.onsuccess=()=>{const current=request.result as LocalRecord|undefined;if(!current||!current.contextPhoto||current.contextSha256!==row.contextSha256||!!current.contextDetached!==!!row.contextDetached){request.transaction?.abort();return;}store.put({...current,contextDetached:!current.contextDetached});};});
   await refresh();setMessage(row.contextDetached?'보관된 추가 사진을 다시 연결했습니다.':'추가 사진 연결을 해제했습니다. 사진은 이 기기에 보관됩니다.');
  }catch{setMessage('사진 연결 상태를 저장하지 못했습니다. 다시 확인하세요.');}
  finally{flight.current=false;setBusy(false);}
 };
 const changePhotoOrder=async(row:LocalRecord):Promise<void>=>{
  if(flight.current||!row.contextPhoto)return;
  flight.current=true;setBusy(true);setMessage('');
  try{
   await runStore<void>('readwrite',store=>{const request=store.get(row.id);request.onsuccess=()=>{const current=request.result as LocalRecord|undefined;if(!current||!current.contextPhoto||current.sha256!==row.sha256||current.contextSha256!==row.contextSha256||!!current.contextFirst!==!!row.contextFirst){request.transaction?.abort();return;}store.put({...current,contextFirst:!current.contextFirst});};});
   await refresh();setMessage('사진 표시 순서를 이 기기에 저장했습니다.');
  }catch{setMessage('사진 순서를 저장하지 못했습니다. 다른 탭의 변경을 확인하고 다시 시도하세요.');}
  finally{flight.current=false;setBusy(false);}
 };
 const saveContextPhoto=async(row:LocalRecord,file:File,role:'overview'|'detail'):Promise<boolean>=>{
  if(flight.current)return false;
  const issue=backupIssue(file);if(issue){setMessage('추가 현장 사진 '+issue);return false;}
  if(row.photoRole===role){setMessage('기본 사진과 다른 역할을 선택해 주세요.');return false;}
  flight.current=true;setBusy(true);setMessage('');
  try{
   const digest=await hash(file);if(!digest)throw new Error('사진의 비교값을 만들지 못했습니다.');
   const history=row.contextHistory||[];
   if(row.contextPhoto){
    if(row.contextDetached||role!==row.contextRole)throw new Error('사진 연결 상태를 확인한 뒤 다시 시도하세요.');
    if(history.length>=5||history.reduce((n,item)=>n+item.photo.size,0)+row.contextPhoto.size>BACKUP_LIMIT)throw new Error('이전 사진 보관 한도(5장·합계 20MB)에 도달했습니다. 새 점검으로 기록하세요. 기존 사진은 유지됩니다.');
    if(!row.contextSha256||await hash(row.contextPhoto)!==row.contextSha256)throw new Error('이전 사진의 무결성을 확인하지 못해 교체하지 않았습니다.');
   }
   await runStore<void>('readwrite',store=>{const request=store.get(row.id);request.onsuccess=()=>{const current=request.result as LocalRecord|undefined;if(!current||!!current.contextPhoto!==!!row.contextPhoto||current.contextSha256!==row.contextSha256||!!current.contextDetached!==!!row.contextDetached||JSON.stringify(current.contextHistory||[])!==JSON.stringify(history)){request.transaction?.abort();return;}const contextHistory=row.contextPhoto?[...history,{photo:row.contextPhoto,sha256:row.contextSha256!,role:row.contextRole!,replacedAt:new Date().toISOString()}]:history;store.put({...current,contextPhoto:file,contextSha256:digest,contextRole:role,contextHistory:contextHistory.length?contextHistory:undefined});};});
   await refresh();setMessage(row.contextPhoto?'추가 현장 사진을 교체하고 이전 사진을 보관했습니다.':'추가 현장 사진을 이 기기에 연결했습니다.');return true;
  }catch(error){setMessage(error instanceof Error&&!(error instanceof DOMException)&&error.message?error.message:'추가 현장 사진을 저장하지 못했습니다. 사진을 유지합니다. 다시 확인하세요.');return false;}
  finally{flight.current=false;setBusy(false);}
 };
 const saveFollowup=async(id:string,value:Followup):Promise<boolean>=>{
  if(flight.current||!validateFollowup(value))return false;
  flight.current=true;setBusy(true);setMessage('');
  try{
   await runStore<void>('readwrite',store=>{const request=store.get(id);request.onsuccess=()=>{if(!request.result||(request.result.followup?.history?.length||0)!==value.history.length-1){request.transaction?.abort();return;}store.put({...request.result,followup:value});};});
   await refresh();setMessage('후속 조치를 이 기기에 저장했습니다. 서버에는 전송하지 않았습니다.');return true;
  }catch{setMessage('후속 조치를 저장하지 못했습니다. 입력 내용을 확인하고 다시 시도하세요.');return false;}
  finally{flight.current=false;setBusy(false);}
 };
 const updateAdditionalActions=async(row:LocalRecord,actions:AdditionalAction[]):Promise<boolean>=>{
  if(flight.current||!validateAdditionalActions(actions)){setMessage('추가 조치 내용을 확인해 주세요. 항목별 이력은 50건까지 저장할 수 있습니다.');return false;}
  flight.current=true;setBusy(true);setMessage('');
  try{
   await runStore<void>('readwrite',store=>{const request=store.get(row.id);request.onsuccess=()=>{if(!request.result||JSON.stringify(request.result.additionalActions||[])!==JSON.stringify(row.additionalActions||[])){request.transaction?.abort();return;}store.put({...request.result,additionalActions:actions});};});
   await refresh();setMessage('추가 조치를 이 기기에 저장했습니다. 서버에는 전송하지 않았습니다.');return true;
  }catch{setMessage('추가 조치를 저장하지 못했습니다. 다른 탭의 변경 여부를 확인한 뒤 다시 시도하세요.');return false;}
  finally{flight.current=false;setBusy(false);}
 };
 const saveActionPhoto=async(row:LocalRecord,item:AdditionalAction,file:File):Promise<boolean>=>{
  if(flight.current)return false;
  const issue=backupIssue(file);if(issue){setMessage('조치별 '+issue);return false;}
  const other=(row.additionalActions||[]).filter(action=>action.id!==item.id).reduce((n,action)=>n+(action.photo?.size||0),0);
  if(other+file.size>BACKUP_LIMIT){setMessage('조치별 사진의 합계가 20MB를 넘습니다.');return false;}
  if(item.photo&&!window.confirm('기존 조치 사진을 바꿀까요? 필요한 사진은 먼저 내려받으세요.'))return false;
  flight.current=true;setBusy(true);setMessage('');
  try{
   const digest=await hash(file);if(!digest)throw new Error('사진의 비교값을 만들지 못했습니다.');
   await runStore<void>('readwrite',store=>{const request=store.get(row.id);request.onsuccess=()=>{if(!request.result||JSON.stringify(request.result.additionalActions||[])!==JSON.stringify(row.additionalActions||[])){request.transaction?.abort();return;}store.put({...request.result,additionalActions:request.result.additionalActions.map((action:AdditionalAction)=>action.id===item.id?{...action,photo:file,photoSha256:digest}:action)});};});
   await refresh();setMessage('조치별 사진을 이 기기에 저장했습니다.');return true;
  }catch{setMessage('조치별 사진을 저장하지 못했습니다. 사진을 유지합니다. 다시 시도하세요.');return false;}
  finally{flight.current=false;setBusy(false);}
 };
 const saveAfterPhoto=async(row:LocalRecord,file:File)=>{
  if(flight.current)return;
  const issue=backupIssue(file);if(issue){setMessage('조치 후 '+issue);return;}
  if(row.afterPhoto&&!window.confirm('기존 조치 후 사진은 이력에 보관됩니다. 사진을 바꿀까요?'))return;
  flight.current=true;setBusy(true);setMessage('');
  try{
   const digest=await hash(file);if(!digest)throw new Error('사진의 비교값을 만들지 못했습니다. 다시 시도하세요.');
   const history=row.afterHistory||[];
   if(row.afterPhoto){
    if(history.length>=5||history.reduce((n,item)=>n+item.photo.size,0)+row.afterPhoto.size>BACKUP_LIMIT)throw new Error('이전 조치 후 사진 보관 한도(5장·합계 20MB)에 도달했습니다. 새 점검으로 기록하세요.');
    if(!row.afterSha256||await hash(row.afterPhoto)!==row.afterSha256)throw new Error('이전 조치 후 사진의 무결성을 확인하지 못해 교체하지 않았습니다.');
   }
   await runStore<void>('readwrite',store=>{const request=store.get(row.id);request.onsuccess=()=>{const current=request.result as LocalRecord|undefined;if(!current||!!current.afterPhoto!==!!row.afterPhoto||current.afterSha256!==row.afterSha256||JSON.stringify(current.afterHistory||[])!==JSON.stringify(history)){request.transaction?.abort();return;}const afterHistory=row.afterPhoto?[...history,{photo:row.afterPhoto,sha256:row.afterSha256!,replacedAt:new Date().toISOString()}]:history;store.put({...current,afterPhoto:file,afterSha256:digest,afterHistory:afterHistory.length?afterHistory:undefined});};});
   setCapturedAfter(null);await refresh();setMessage('조치 후 사진을 이 기기에 연결했습니다. 현장 확인은 별도로 필요합니다.');
  }catch(error){setMessage(error instanceof Error&&error.message?error.message:'사진을 저장하지 못했습니다. 다시 시도하세요.');}
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
   else if(!current.sha256)result='보관된 비교값이 없어 변경 여부를 확인할 수 없습니다. 원본을 별도로 보관하세요.';
   else {const digest=await hash(current.photo);result=!digest?'사진을 읽거나 비교값을 계산하지 못했습니다. 다시 시도하세요.':digest===current.sha256?'확인 시점의 사진이 저장된 비교값과 일치합니다.':'사진이 저장된 비교값과 다릅니다. 원본을 별도로 확인하세요.';}
   setChecks(prev=>({...prev,[id]:result}));
  }catch{setChecks(prev=>({...prev,[id]:'기기 기록을 읽지 못했습니다. 다시 시도하세요.'}));}
  finally{flight.current=false;setBusy(false);}
 };
 const backup=async(row:LocalRecord)=>{if(flight.current)return;flight.current=true;setBusy(true);setMessage('');try{const current=await runStore<LocalRecord|undefined>('readonly',(store,set)=>{const request=store.get(row.id);request.onsuccess=()=>set(request.result as LocalRecord|undefined);});if(!current)throw new Error('해당 점검을 찾을 수 없어 백업하지 않았습니다. 목록을 다시 확인하세요.');download(await packRecord(current),'PSI-backup-'+current.id+'.json');setMessage('백업 파일 내려받기를 요청했습니다. 저장된 파일을 확인하고 안전한 장소에 보관하세요.');}catch(error){setMessage(error instanceof Error?error.message:'백업하지 못했습니다.');}finally{flight.current=false;setBusy(false);}};
 const restore=async(file:File)=>{if(flight.current)return;flight.current=true;setBusy(true);setMessage('');try{const record=await unpackRecord(file);await runStore<void>('readwrite',store=>{store.add(record);});await refresh();setMessage('백업을 이 기기에 복원했습니다. 서버에는 전송하지 않았습니다.');}catch(error){setMessage(error instanceof DOMException&&error.name==='ConstraintError'?'같은 점검이 이미 이 기기에 있습니다. 기존 기록은 변경하지 않았습니다.':error instanceof Error?error.message:'복원하지 못했습니다.');}finally{flight.current=false;setBusy(false);}};
 return <details id="si-local-inspection" className="si-local-inspection" onToggle={e=>{if(e.currentTarget.open)void refresh();}}>
  <summary>통신 없이 기기에서 직접 점검</summary>
  <section aria-label="기기 직접 점검">
   <h2>사진과 점검 내용을 이 기기에 보관</h2>
   <p>사진을 자동 분석하지 않습니다. 직접 확인한 내용으로 관련 기준을 찾아보는 기능입니다. 서버 업로드와 유료 AI 호출은 하지 않습니다.</p>
   <p>{offlineEntry?'사전에 오프라인 준비를 마친 기기에서는 이 주소로 인터넷 없이 다시 열 수 있습니다.':'인터넷이 끊기기 전 기기 점검 전용 화면에서 오프라인 준비가 필요합니다.'} 브라우저 데이터 삭제나 기기 분실 시 기록이 사라질 수 있으니 별도로 내려받으세요.</p>{!offlineEntry&&<p><a href="/field-local/">오프라인 재실행 준비 화면 열기</a></p>}
   {photo?<>{url&&<img src={url} alt="기기 점검에 선택한 사진" style={{display:'block',maxWidth:'100%',maxHeight:260,objectFit:'contain'}}/>}<p>{photo.name} · {Math.ceil(photo.size/1024)} KB</p>{backupIssue(photo)&&<p role="alert">저장 전 백업 안내: {backupIssue(photo)} 점검은 기기에 저장할 수 있습니다.</p>}<button type="button" className="si-btn" disabled={busy} onClick={()=>download(photo,photo.name)}>선택 사진 내려받기</button></>:<p>사진을 촬영하거나 선택해 주세요.</p>}
   <div><button type="button" className="si-btn" disabled={busy} onClick={()=>setCamera(true)}>기기 점검 사진 촬영</button> <label className="si-btn">기기 점검 사진 선택<input aria-label="기기 점검 사진 선택" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)choose(file);}}/></label></div>
   <label>기본 사진 역할<select aria-label="기본 사진 역할" value={photoRole} onChange={e=>setPhotoRole(e.target.value as PhotoRole)}><option value="unspecified">지정하지 않음</option><option value="overview">현장 전체</option><option value="detail">위험 부위</option></select></label>
   <label>직접 확인한 내용<textarea aria-label="직접 확인한 내용" maxLength={4000} value={note} disabled={busy} onChange={e=>setNote(e.target.value)} placeholder="예: 시스템비계 발판 사이가 벌어져 보여 실측이 필요함"/></label>
   <label>현장 조치·확인 계획<textarea aria-label="현장 조치·확인 계획" maxLength={4000} value={action} disabled={busy} onChange={e=>setAction(e.target.value)} placeholder="예: 접근을 통제하고 담당자와 발판 상태 확인"/></label>
   {note.trim()&&<div aria-label="입력 내용으로 찾은 기준"><b>입력 내용으로 찾은 참고 기준</b><p>자료 묶음 버전 {reference.version} · 묶음 기준일 {reference.reviewedAt}. 개별 기준의 현재 적용 여부는 현장에서 확인하세요.</p>{reviewedCards.length?reviewedCards.slice(0,3).map(card=><article key={card.id}><strong>{card.title}</strong><p>{sourceReviewState(card.sourceReview).label}</p>{card.duties.slice(0,2).map(d=><p key={d.url}>{d.label}: {d.summary} <a href={d.url} target="_blank" rel="noreferrer">원문 확인 (인터넷 필요)</a></p>)}<p>{card.scope}</p></article>):<p>현재 입력에 대해 검토 이력과 검토 기한이 확인된 기준을 찾지 못했습니다. 위험이 없다는 뜻이 아니며, 현장 담당자가 적용 기준을 별도로 확인해야 합니다.</p>}</div>}
   <button type="button" className="si-btn si-primary" disabled={busy||!photo||!note.trim()} onClick={()=>void save()}>{busy?'기기에 저장 중…':'사진과 내용 기기에 저장'}</button>
   {message&&<p role="status">{message}</p>}
   <h3>{readState==='ready'?`이 브라우저에 보관된 점검 ${rows.length}건`:'이 브라우저의 점검 기록'}</h3>
   {readState==='loading'&&<p role="status">기기 기록을 확인하고 있습니다…</p>}
   {readState==='error'&&<div role="alert"><p>기기 기록을 불러오지 못해 보관 건수를 확인할 수 없습니다. 기록이 없다는 뜻은 아닙니다. 브라우저 저장 설정과 남은 공간을 확인한 뒤 다시 시도하세요.</p><button type="button" className="si-btn" disabled={busy} onClick={()=>void refresh()}>기기 기록 다시 확인</button></div>}
   <p>백업에는 사진과 점검 내용이 모두 들어 있으며 암호화되지 않습니다. 안전한 장소에 보관하세요. 사진은 각각 20MB까지 지원합니다.</p>
   <label className="si-btn">백업 파일 복원<input type="file" accept="application/json,.json" aria-label="백업 파일 복원" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void restore(file);}}/></label>
   {readState==='ready'&&<label>후속 조치 모아보기<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">전체</option><option value="unassigned">담당 미지정</option><option value="no_due">기한 미정</option><option value="overdue">기한 초과</option><option value="review">확인 요청</option></select> · {visibleRows.length}건</label>}
   {readState==='ready'&&visibleRows.map(row=><article key={row.id}><p>{new Date(row.createdAt).toLocaleString('ko-KR')} · {row.note}</p><p>조치 계획: {row.action||'미작성'} · 파일 무결성 기록: {row.sha256?'SHA-256 기록됨':'미확인'}</p><ContextPhotoEditor row={row} busy={busy} onSave={saveContextPhoto} onOrder={changePhotoOrder} onLink={changeContextLink}/><FollowupEditor row={row} busy={busy} onSave={saveFollowup}/><AdditionalActions row={row} busy={busy} onUpdate={updateAdditionalActions} onPhoto={saveActionPhoto}/><div><p>조치 후 사진: {row.afterPhoto?row.afterPhoto.name:'아직 없음'}</p><button type="button" className="si-btn" disabled={busy} onClick={()=>{if(capturedAfter&&!window.confirm('아직 저장하지 않은 조치 후 사진을 버리고 다시 촬영할까요?'))return;setCapturedAfter(null);setAfterCamera(row);}}>조치 후 사진 촬영</button> <label className="si-btn">조치 후 사진 {row.afterPhoto?'변경':'연결'}<input aria-label="조치 후 사진 연결" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file&&(!capturedAfter||window.confirm('저장하지 않은 촬영 사진을 버리고 선택한 사진을 연결할까요?')))void saveAfterPhoto(row,file);}}/></label> {row.afterPhoto&&<button type="button" className="si-btn" onClick={()=>download(row.afterPhoto!,row.afterPhoto!.name||'PSI-after.jpg')}>조치 후 사진 내려받기</button>}<p>사진 연결만으로 조치 완료나 안전을 증명하지 않습니다.</p>{!!row.afterHistory?.length&&<details><summary>이전 조치 후 사진 {row.afterHistory.length}장</summary><p>교체 시각은 기기 시각이며 촬영 시각과 다를 수 있습니다.</p>{row.afterHistory.map((entry,i)=><p key={i}>{entry.photo.name} · {new Date(entry.replacedAt).toLocaleString('ko-KR')} <button type="button" className="si-btn" onClick={()=>download(entry.photo,entry.photo.name)}>이전 조치 후 사진 내려받기</button></p>)}</details>}</div><button type="button" className="si-btn" disabled={busy} onClick={()=>void verifyPhoto(row.id)}>사진 변경 확인</button> {checks[row.id]&&<p role="status">{checks[row.id]}</p>} <button type="button" className="si-btn" onClick={()=>download(row.photo,row.photo.name||'PSI-photo.jpg')}>사진 내려받기</button> <button type="button" className="si-btn" onClick={()=>{const {photo:stored,...data}=row;download(new Blob([JSON.stringify({...data,photoName:stored.name,photoType:stored.type},null,2)],{type:'application/json'}),'PSI-local-record-'+row.id+'.json');}}>점검 내용 내려받기</button> <button type="button" className="si-btn" disabled={busy} onClick={()=>void backup(row)}>사진과 기록 함께 백업</button> <button type="button" className="si-btn" disabled={busy} onClick={()=>void remove(row.id)}>이 기기 기록 삭제</button></article>)}
   {capturedAfter&&<div role="status"><p>촬영한 조치 후 사진이 아직 저장되지 않았습니다. 연결할 점검: {capturedAfter.row.note}</p><button type="button" className="si-btn" disabled={busy} onClick={()=>void saveAfterPhoto(capturedAfter.row,capturedAfter.file)}>촬영 사진 연결{busy?' 중…':''}</button> <button type="button" className="si-btn" onClick={()=>download(capturedAfter.file,capturedAfter.file.name||'PSI-after.jpg')}>촬영 사진 내려받기</button> <button type="button" className="si-btn" disabled={busy} onClick={()=>{if(window.confirm('저장하지 않은 조치 후 사진을 버릴까요?'))setCapturedAfter(null);}}>촬영 사진 버리기</button></div>}
   <p>사진 변경 확인은 저장된 사진과 기록된 비교값만 대조합니다. 백업에서 복원한 기록의 비교값은 백업 당시 생성됐을 수 있습니다. 점검 내용의 변경이나 촬영 시각·장소·안전 여부는 증명하지 않습니다.</p>
  </section>
  {camera&&<InspectorCameraDialog onClose={()=>setCamera(false)} onUse={file=>{setCamera(false);choose(file);}}/>}
  {afterCamera&&<InspectorCameraDialog reference={{url:afterReference,label:'조치 전 사진'}} onClose={()=>setAfterCamera(null)} onUse={file=>{setCapturedAfter({row:afterCamera,file});setAfterCamera(null);setMessage('촬영 사진을 확인한 뒤 점검에 연결하세요.');}}/>}
 </details>;
}
