import React, {useEffect, useRef, useState} from 'react';
import InspectorCameraDialog, {type CameraEditEvidence} from './InspectorCameraDialog';
import {legalForText} from '../../lib/inspector/legal';
import {sourceReviewState} from '../../lib/inspector/sourceReview';
import {FOLLOWUP_STATES, FOLLOWUP_LABELS, validateFollowup, validateAdditionalActions, overdue} from '../../lib/inspector/localFollowup.mjs';

type Followup={status:string;assignee:string;dueDate:string;temporaryMeasure?:string;history:{status:string;assignee:string;dueDate:string;temporaryMeasure?:string;note:string;at:string}[]};
type Recheck={id:string;result:'delayed'|'temporary_checked'|'needs_more'|'review_requested';reason:string;note:string;nextCheckDate:string;at:string;photoSha256:string|null;followupStatus:string};
type AdditionalAction={id:string;title:string;followup?:Followup;rechecks?:Recheck[];photo?:File;photoSha256?:string;photoHistory?:AfterHistory[]};
const RECHECK_LABELS:Record<Recheck['result'],string>={delayed:'조치 지연·미완료',temporary_checked:'임시 안전조치 현장 확인',needs_more:'재점검 후 보완 필요',review_requested:'완료 여부 확인 요청'};
function validRecheckDate(value:string):boolean{
 if(value==='')return true;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function evidencePhotoHashes(row:LocalRecord,action?:AdditionalAction):string[]{
 return action?[...(action.photoHistory||[]).map(p=>p.sha256),action.photoSha256].filter((x):x is string=>Boolean(x)):
 [...(row.afterHistory||[]).map(p=>p.sha256),row.afterSha256].filter((x):x is string=>Boolean(x));
}
function validRechecks(value:unknown,hashes:string[],max:number):value is Recheck[]{
 if(!Array.isArray(value)||!value.length||value.length>max)return false;
 const seen=new Set<string>();
 return value.every(raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
  const e=raw as Record<string,unknown>;
  if(Object.keys(e).length!==8||!['id','result','reason','note','nextCheckDate','at','photoSha256','followupStatus'].every(k=>Object.hasOwn(e,k)))return false;
  if(typeof e.id!=='string'||!/^[-a-f0-9]{36}$/i.test(e.id)||seen.has(e.id))return false;
  seen.add(e.id);
  return typeof e.result==='string'&&Object.hasOwn(RECHECK_LABELS,e.result)
   &&typeof e.reason==='string'&&e.reason===e.reason.trim()&&e.reason.length>=5&&e.reason.length<=500
   &&typeof e.note==='string'&&e.note===e.note.trim()&&e.note.length>=5&&e.note.length<=2000
   &&typeof e.nextCheckDate==='string'&&validRecheckDate(e.nextCheckDate)
   &&typeof e.at==='string'&&Number.isFinite(Date.parse(e.at))
   &&(e.photoSha256===null||(typeof e.photoSha256==='string'&&hashes.includes(e.photoSha256)))
   &&typeof e.followupStatus==='string'&&(e.followupStatus==='unrecorded'||FOLLOWUP_STATES.includes(e.followupStatus));
 });
}
function recheckPayload(row:LocalRecord){
 return {main:row.rechecks||[],actions:(row.additionalActions||[]).map(action=>({id:action.id,records:action.rechecks||[]}))};
}
function hasRechecks(row:LocalRecord):boolean{
 return Boolean(row.rechecks?.length||(row.additionalActions||[]).some(a=>a.rechecks?.length));
}
function validateRecheckPayload(row:LocalRecord):boolean{
 if(row.rechecks!==undefined&&!validRechecks(row.rechecks,evidencePhotoHashes(row),100))return false;
 return (row.additionalActions||[]).every(a=>a.rechecks===undefined||validRechecks(a.rechecks,evidencePhotoHashes(row,a),50));
}
type PhotoRole='overview'|'detail'|'unspecified';
type PhotoInput={source:'camera-dialog'|'file-picker';recordedAt:string;sha256:string};
type PhotoEdit={originalFile:File;originalSha256:string;derivedSha256:string;rotationDegrees:90|180|270;processedAt:string};
type PhotoEdits=Record<string,PhotoEdit>;
function photoSlotHashes(row:LocalRecord):Record<string,string>{
 const out:Record<string,string>={};
 const add=(key:string,now:string|null|undefined,history:{sha256:string}[])=>{
  history.forEach((item,i)=>{out[key+':'+i]=item.sha256;});
  if(now)out[key+':'+history.length]=now;
 };
 add('primary',row.sha256,row.primaryHistory||[]);
 add('context',row.contextSha256,row.contextHistory||[]);
 add('after',row.afterSha256,row.afterHistory||[]);
 (row.additionalActions||[]).forEach(item=>add('action:'+item.id,item.photoSha256,item.photoHistory||[]));
 return out;
}
function requirePhotoEditBudget(existing:PhotoEdits|undefined,added:PhotoEdit|undefined):void{
 if(!added)return;
 const prior=Object.values(existing||{}).reduce((n,item)=>n+item.originalFile.size,0);
 if(prior+added.originalFile.size>20*1024*1024)throw new Error('이 점검의 편집 전 사진 합계가 20MB를 초과합니다. 새로운 점검을 작성하거나 사진을 별도 보관하세요.');
}
function validPhotoEdits(value:unknown,row:LocalRecord):value is PhotoEdits{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const items=value as Record<string,unknown>,hashes=photoSlotHashes(row);
 if(!Object.keys(items).length||Object.keys(items).length>70)return false;
 return Object.entries(items).every(([slot,item])=>{
  if(!Object.hasOwn(hashes,slot)||!row.photoInputs||row.photoInputs[slot]?.source!=='camera-dialog'||!item||typeof item!=='object'||Array.isArray(item))return false;
  const e=item as Record<string,unknown>;
  return Object.keys(e).length===5&&['originalFile','originalSha256','derivedSha256','rotationDegrees','processedAt'].every(k=>Object.hasOwn(e,k))
   &&e.originalFile instanceof File&&e.originalFile.size>0&&e.originalFile.size<=20*1024*1024
   &&['image/jpeg','image/png','image/webp'].includes(e.originalFile.type)&&e.originalFile.name.length<=255
   &&typeof e.originalSha256==='string'&&/^[a-f0-9]{64}$/.test(e.originalSha256)
   &&e.derivedSha256===hashes[slot]&&e.derivedSha256===row.photoInputs[slot].sha256
   &&[90,180,270].includes(e.rotationDegrees as number)
   &&typeof e.processedAt==='string'&&Number.isFinite(Date.parse(e.processedAt));
 });
}
async function makePhotoEdit(derived:File,evidence?:CameraEditEvidence):Promise<PhotoEdit|undefined>{
 if(!evidence)return undefined;
 if(![90,180,270].includes(evidence.rotationDegrees))throw new Error('사진 회전 기록이 올바르지 않습니다.');
 const originalIssue=backupIssue(evidence.initialFile);
 if(originalIssue)throw new Error('편집 전 사진: '+originalIssue);
 const originalSha256=await hash(evidence.initialFile),derivedSha256=await hash(derived);
 if(!originalSha256||!derivedSha256)throw new Error('사진 원본과 회전본의 비교값을 확인할 수 없습니다.');
 return {originalFile:evidence.initialFile,originalSha256,derivedSha256,rotationDegrees:evidence.rotationDegrees,processedAt:evidence.recordedAt};
}

type PhotoInputs=Record<string,PhotoInput>;
const photoInputLabel=(input:PhotoInput|undefined)=>input?.source==='camera-dialog'?'앱 카메라 촬영 화면':input?.source==='file-picker'?'기기 파일 선택 경로':'출처 미확인 (이전 기록 포함)';
const photoInput=(source:PhotoInput['source'],sha256:string):PhotoInput=>({source,sha256,recordedAt:new Date().toISOString()});
function validPhotoInputs(value:unknown,record:LocalRecord):value is PhotoInputs{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const sources=value as Record<string,unknown>;
 if(Object.keys(sources).length<1||Object.keys(sources).length>160)return false;
 const expected:Record<string,string>={};
 const index=(slot:string,sha:string|null|undefined,hist:{sha256:string}[])=>{
  hist.forEach((item,i)=>{expected[slot+':'+i]=item.sha256;});
  if(sha)expected[slot+':'+hist.length]=sha;
 };
 index('primary',record.sha256,record.primaryHistory||[]);
 index('context',record.contextSha256,record.contextHistory||[]);
 index('after',record.afterSha256,record.afterHistory||[]);
 (record.additionalActions||[]).forEach(a=>index('action:'+a.id,a.photoSha256,a.photoHistory||[]));
 return Object.entries(sources).every(([key,item])=>{
  if(!Object.hasOwn(expected,key)||!item||typeof item!=='object'||Array.isArray(item))return false;
  const data=item as Record<string,unknown>;
  return Object.keys(data).length===3&&['source','recordedAt','sha256'].every(k=>Object.hasOwn(data,k))
   &&(data.source==='camera-dialog'||data.source==='file-picker')
   &&typeof data.recordedAt==='string'&&Number.isFinite(Date.parse(data.recordedAt))
   &&typeof data.sha256==='string'&&/^[0-9a-f]{64}$/.test(data.sha256)&&data.sha256===expected[key];
 });
}
type FieldContext={site:string;building:string;level:string;trade:string};
type SiteContextChange={before:FieldContext|null;after:FieldContext|null;reason:string;at:string;actor:'device-user'};
function validSiteContextHistory(value:unknown,current:FieldContext|null):value is SiteContextChange[]{
 if(!Array.isArray(value)||!value.length||value.length>100)return false;
 let prior:FieldContext|null=null;
 for(const [index,item] of value.entries()){
  if(!item||typeof item!=='object'||Array.isArray(item))return false;
  const change=item as Record<string,unknown>;
  if(Object.keys(change).length!==5||!['before','after','reason','at','actor'].every(k=>Object.hasOwn(change,k)))return false;
  if((change.before!==null&&!validFieldContext(change.before))||(change.after!==null&&!validFieldContext(change.after)))return false;
  if(typeof change.reason!=='string'||change.reason.trim()!==change.reason||change.reason.length<5||change.reason.length>200)return false;
  if(typeof change.at!=='string'||!Number.isFinite(Date.parse(change.at))||change.actor!=='device-user')return false;
  if(index>0&&JSON.stringify(prior)!==JSON.stringify(change.before))return false;
  if(JSON.stringify(change.before)===JSON.stringify(change.after))return false;
  prior=change.after as FieldContext|null;
 }
 return JSON.stringify(prior)===JSON.stringify(current);
}

const EMPTY_FIELD_CONTEXT:FieldContext={site:'',building:'',level:'',trade:''};
function cleanFieldContext(value:FieldContext):FieldContext|undefined{
 const context={site:value.site.trim(),building:value.building.trim(),level:value.level.trim(),trade:value.trade.trim()};
 return Object.values(context).some(Boolean)?context:undefined;
}
function validFieldContext(value:unknown):value is FieldContext{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const data=value as Record<string,unknown>,limits:{[key:string]:number}={site:100,building:40,level:40,trade:60};
 return Object.keys(data).length===4&&Object.entries(limits).every(([key,max])=>typeof data[key]==='string'&&(data[key] as string).length<=max&&(data[key] as string)===(data[key] as string).trim())
  &&Object.keys(limits).some(key=>Boolean(data[key]));
}
function fieldContextLabel(context:FieldContext):string{
 return [context.site&&'현장 '+context.site,context.building&&'동 '+context.building,context.level&&'층 '+context.level,context.trade&&'공종 '+context.trade].filter(Boolean).join(' · ');
}
type AfterHistory={photo:File;sha256:string;replacedAt:string};
type ContextHistory={photo:File;sha256:string;role:'overview'|'detail';replacedAt:string};
type LocalRecord={rechecks?:Recheck[];photoEdits?:PhotoEdits;photoInputs?:PhotoInputs;siteContextHistory?:SiteContextChange[];siteContext?:FieldContext;primaryHistory?:AfterHistory[];afterHistory?:AfterHistory[];contextHistory?:ContextHistory[];contextDetached?:boolean;contextFirst?:boolean;photoRole?:PhotoRole;contextPhoto?:File;contextSha256?:string;contextRole?:'overview'|'detail';additionalActions?:AdditionalAction[];afterPhoto?:File;afterSha256?:string;followup?:Followup;id:string;createdAt:string;note:string;action:string;photo:File;sha256:string|null;legalVersion:string;reviewedAt:string};
type PhotoSetDraft={id:string;kind:'photo-set-draft';revision:string;photos:File[];sources?:PhotoInput[];edits?:PhotoEdits};
const DB='psi-inspector-local-records', STORE='records', DRAFT_KEY='psi-photo-set-draft-v1';
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
type EvidenceManifestItem={
 slot:string;derivativeStatus:'not-recorded'|'match'|'mismatch'|'unavailable';originalFilename:string|null;originalExpectedSha256:string|null;originalActualSha256:string|null;rotationDegrees:number|null;processedAt:string|null;
 sourceMethod:'camera-dialog'|'file-picker'|'unknown';sourceRecordedAt:string|null;role:string;stage:'current'|'archived';order:number;filename:string;mime:string;bytes:number;
 expectedSha256:string|null;actualSha256:string|null;previousSha256:string|null;
 replacedAt:string|null;check:'match'|'mismatch'|'unrecorded'|'unavailable';
};
type EvidenceManifest={
 format:'psi-local-photo-evidence-manifest';version:3;inspectionId:string;generatedAt:string;
 timeSource:'device-clock';scope:'stored-files-only';photos:EvidenceManifestItem[];
 checks:{matched:number;mismatch:number;unrecorded:number;unavailable:number;total:number};
};
async function buildEvidenceManifest(inspection:LocalRecord):Promise<EvidenceManifest>{
 const candidates:{key:string;role:string;photo:File;recorded:string|null;stage:'current'|'archived';order:number;previous:string|null;replacedAt:string|null}[]=[];
 const pushChain=(key:string,role:string,latest:File|undefined,latestSha:string|null|undefined,history:{photo:File;sha256:string;replacedAt:string}[])=>{
  let previous:string|null=null;
  for(const [index,entry] of history.entries()){
   candidates.push({key:key+':'+index,role,photo:entry.photo,recorded:entry.sha256||null,stage:'archived',order:index+1,previous,replacedAt:entry.replacedAt});
   previous=entry.sha256||null;
  }
  if(latest)candidates.push({key:key+':'+history.length,role,photo:latest,recorded:latestSha||null,stage:'current',order:history.length+1,previous,replacedAt:null});
 };
 pushChain('primary','기본 사진',inspection.photo,inspection.sha256,inspection.primaryHistory||[]);
 pushChain('context','추가 현장 사진'+(inspection.contextDetached?' (연결 해제 상태)':''),inspection.contextPhoto,inspection.contextSha256,inspection.contextHistory||[]);
 pushChain('after','조치 후 사진',inspection.afterPhoto,inspection.afterSha256,inspection.afterHistory||[]);
 (inspection.additionalActions||[]).forEach((action,index)=>pushChain('action:'+action.id,'조치별 사진 '+(index+1),action.photo,action.photoSha256,action.photoHistory||[]));
 if(inspection.photoEdits&&!validPhotoEdits(inspection.photoEdits,inspection))throw new Error('편집 전 사진과 회전본 기록이 일치하지 않습니다.');
 if(inspection.photoInputs&&!validPhotoInputs(inspection.photoInputs,inspection))throw new Error('사진 출처 기록의 비교값과 사진 버전이 일치하지 않습니다.');
 const photos:EvidenceManifestItem[]=[];
 for(const candidate of candidates){
  const actualSha256=await hash(candidate.photo);
  const check:EvidenceManifestItem['check']=!actualSha256?'unavailable':!candidate.recorded?'unrecorded':actualSha256===candidate.recorded?'match':'mismatch';
  const source=inspection.photoInputs?.[candidate.key],edit=inspection.photoEdits?.[candidate.key];
  const originalActualSha256=edit?await hash(edit.originalFile):null;
  const derivativeStatus:EvidenceManifestItem['derivativeStatus']=!edit?'not-recorded':!originalActualSha256?'unavailable':originalActualSha256===edit.originalSha256&&actualSha256===edit.derivedSha256?'match':'mismatch';
  photos.push({slot:candidate.key,derivativeStatus,originalFilename:edit?.originalFile.name||null,originalExpectedSha256:edit?.originalSha256||null,originalActualSha256,rotationDegrees:edit?.rotationDegrees||null,processedAt:edit?.processedAt||null,sourceMethod:source?.source||'unknown',sourceRecordedAt:source?.recordedAt||null,role:candidate.role,stage:candidate.stage,order:candidate.order,filename:candidate.photo.name,mime:candidate.photo.type,bytes:candidate.photo.size,expectedSha256:candidate.recorded,actualSha256,previousSha256:candidate.previous,replacedAt:candidate.replacedAt,check});
 }
 return {format:'psi-local-photo-evidence-manifest',version:3,inspectionId:inspection.id,generatedAt:new Date().toISOString(),timeSource:'device-clock',scope:'stored-files-only',photos,checks:{matched:photos.filter(v=>v.check==='match').length,mismatch:photos.filter(v=>v.check==='mismatch').length,unrecorded:photos.filter(v=>v.check==='unrecorded').length,unavailable:photos.filter(v=>v.check==='unavailable').length,total:photos.length}};
}
const list=()=>runStore<LocalRecord[]>('readonly',(store,set)=>{const request=store.getAll();request.onsuccess=()=>set((request.result as LocalRecord[]).filter(item=>item.id!==DRAFT_KEY).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));});
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}

const BACKUP_LIMIT=20*1024*1024;
const BATCH_LIMIT=50*1024*1024;
const BATCH_COUNT_LIMIT=10;
type BatchPreviewEntry={index:number;status:'ready'|'duplicate'|'invalid';summary:string;message:string;record?:LocalRecord;selected:boolean};
type StorageStatus={kind:'normal'|'near-limit'|'unavailable'|'failed';retention:'granted'|'not-granted'|'unknown';description:string};
async function readStorageStatus():Promise<StorageStatus>{
 const storage=navigator.storage;
 if(!storage||typeof storage.estimate!=='function')return {kind:'unavailable',retention:'unknown',description:'이 브라우저에서는 저장공간 상태를 조회할 수 없습니다. 저장 기록이 없다는 뜻은 아닙니다.'};
 try{
  const estimate=await storage.estimate();
  const usage=estimate.usage,quota=estimate.quota;
  let retention:StorageStatus['retention']='unknown';
  try{if(typeof storage.persisted==='function')retention=await storage.persisted()?'granted':'not-granted';}catch{/* Browser storage policy unavailable; never infer approval. */}
  if(typeof usage!=='number'||typeof quota!=='number'||!Number.isFinite(usage)||!Number.isFinite(quota)||usage<0||quota<=0)return {kind:'unavailable',retention,description:'브라우저에서 저장공간 사용량을 제공하지 않았습니다. 실제 저장 가능 용량은 확인할 수 없습니다.'};
  const ratio=usage/quota;
  const description='이 사이트의 브라우저 추정 저장공간: '+(usage/1048576).toFixed(1)+'MB / '+(quota/1048576).toFixed(1)+'MB (약 '+Math.round(ratio*100)+'% 사용).';
  return {kind:ratio>=0.8?'near-limit':'normal',retention,description};
 }catch{return {kind:'failed',retention:'unknown',description:'기기 저장공간 조회에 실패했습니다. 점검 기록이 삭제됐다는 의미는 아닙니다.'};}
}
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
 let photoEditsData:Record<string,unknown>|undefined;
 if(row.photoEdits){
  const edits=Object.entries(row.photoEdits);
  if(edits.reduce((sum,[,entry])=>sum+entry.originalFile.size,0)>BACKUP_LIMIT)throw new Error('편집 전 사진 전체가 백업 한도 20MB를 초과합니다. 별도로 내려받거나 점검을 나눠 주세요.');
  photoEditsData={};
  for(const [slot,entry] of edits){
   const originalIssue=backupIssue(entry.originalFile);if(originalIssue)throw new Error('편집 전 사진 '+originalIssue);
   if(await hash(entry.originalFile)!==entry.originalSha256)throw new Error('편집 전 사진이 변경되어 백업을 중단했습니다.');
   photoEditsData[slot]={name:entry.originalFile.name,type:entry.originalFile.type,originalSha256:entry.originalSha256,derivedSha256:entry.derivedSha256,rotationDegrees:entry.rotationDegrees,processedAt:entry.processedAt,data:await toData(entry.originalFile)};
  }
 }
 if(hasRechecks(row)&&!validateRecheckPayload(row))throw new Error('재점검 이력과 연결된 사진 정보가 일치하지 않아 백업을 중단했습니다.');
 const recheckSha256=hasRechecks(row)?await hash(new File([JSON.stringify(recheckPayload(row))],'recheck-history.json',{type:'application/json'})):undefined;
 if(hasRechecks(row)&&!recheckSha256)throw new Error('재점검 이력의 비교값을 만들 수 없어 백업하지 못했습니다.');
 if(row.photoEdits&&!validPhotoEdits(row.photoEdits,row))throw new Error('편집 전·회전본 사진 연결 정보가 올바르지 않아 백업을 중단했습니다.');
 if(row.photoInputs&&!validPhotoInputs(row.photoInputs,row))throw new Error('사진 입력 출처 기록과 파일 버전이 일치하지 않아 백업하지 못했습니다.');
 const photoInputsSha256=row.photoInputs?await hash(new File([JSON.stringify(row.photoInputs)],'photo-inputs.json',{type:'application/json'})):undefined;
 if(row.photoInputs&&!photoInputsSha256)throw new Error('사진 출처 기록의 무결성 정보를 만들지 못했습니다.');
 if(row.siteContext&&!validFieldContext(row.siteContext))throw new Error('점검 현장정보를 확인할 수 없어 백업하지 못했습니다.');
 const siteContextHistory=row.siteContextHistory;
 if(siteContextHistory&&!validSiteContextHistory(siteContextHistory,row.siteContext||null))throw new Error('현장정보 변경 이력이 올바르지 않아 백업하지 못했습니다.');
 const siteContextValue=siteContextHistory?row.siteContext||null:row.siteContext;
 const siteContextSha256=siteContextValue!==undefined?await hash(new File([JSON.stringify(siteContextValue)],'site-context.json',{type:'application/json'})):undefined;
 if(siteContextValue!==undefined&&!siteContextSha256)throw new Error('현장정보의 비교값을 만들지 못해 백업하지 못했습니다.');
 const siteContextHistorySha256=siteContextHistory?await hash(new File([JSON.stringify(siteContextHistory)],'site-context-history.json',{type:'application/json'})):undefined;
 if(siteContextHistory&&!siteContextHistorySha256)throw new Error('현장정보 변경 이력의 비교값을 만들지 못했습니다.');
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
 const primaryHistory=row.primaryHistory||[];
 if(primaryHistory.length>5||primaryHistory.reduce((n,item)=>n+item.photo.size,0)>BACKUP_LIMIT)throw new Error('이전 기본 사진 이력이 백업 허용 범위를 초과합니다.');
 const primaryHistoryData=await Promise.all(primaryHistory.map(async item=>{
  const issue=backupIssue(item.photo);if(issue)throw new Error('이전 기본 사진 '+issue);
  const digest=await hash(item.photo);if(!digest||digest!==item.sha256)throw new Error('이전 기본 사진의 무결성을 확인할 수 없습니다.');
  if(!Number.isFinite(Date.parse(item.replacedAt)))throw new Error('이전 기본 사진 이력을 확인할 수 없습니다.');
  return {name:item.photo.name,type:item.photo.type,sha256:digest,replacedAt:item.replacedAt,data:await toData(item.photo)};
 }));
 const actionPhotos=(row.additionalActions||[]).filter(item=>item.photo);
 if(actionPhotos.reduce((n,item)=>n+(item.photo?.size||0),0)>BACKUP_LIMIT)throw new Error('조치별 사진 합계가 20MB를 넘어 백업할 수 없습니다.');
 const actionHistory=(row.additionalActions||[]).flatMap(item=>item.photoHistory||[]);
 if(actionHistory.length&&(!(row.additionalActions||[]).every(item=>(item.photoHistory||[]).length<=5)||actionHistory.reduce((n,item)=>n+item.photo.size,0)>BACKUP_LIMIT))throw new Error('이전 조치별 사진 이력이 백업 허용 범위를 초과합니다.');
 const actionsForBackup=await Promise.all((row.additionalActions||[]).map(async item=>{
  const {photo,photoSha256,photoHistory,...data}=item;
  const oldPhotos=await Promise.all((photoHistory||[]).map(async old=>{
   const issue=backupIssue(old.photo);if(issue)throw new Error('이전 조치별 사진 '+issue);
   const digest=await hash(old.photo);if(!digest||digest!==old.sha256)throw new Error('이전 조치별 사진의 무결성을 확인할 수 없습니다.');
   if(!Number.isFinite(Date.parse(old.replacedAt)))throw new Error('이전 조치별 사진 이력을 확인할 수 없습니다.');
   return {name:old.photo.name,type:old.photo.type,sha256:digest,replacedAt:old.replacedAt,data:await toData(old.photo)};
  }));
  if(!photo){if(oldPhotos.length)throw new Error('조치별 현재 사진을 확인할 수 없습니다.');return data;}
  const issue=backupIssue(photo);if(issue)throw new Error('조치별 '+issue);
  const digest=await hash(photo);if(!digest||digest!==photoSha256)throw new Error('조치별 사진의 무결성을 확인할 수 없습니다.');
  return {...data,photo:{name:photo.name,type:photo.type,sha256:digest,data:await toData(photo)},photoHistory:oldPhotos.length?oldPhotos:undefined};
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
 return new Blob([JSON.stringify({format:'psi-local-inspection',version:hasRechecks(row)?17:row.photoEdits?16:row.photoInputs?15:siteContextHistory?14:row.siteContext?13:primaryHistory.length?12:actionHistory.length?11:afterHistory.length?10:history.length?9:typeof row.contextDetached==='boolean'?8:typeof row.contextFirst==='boolean'?7:photoSet?6:actionPhotos.length?5:row.additionalActions?.length?4:row.afterPhoto?3:row.followup?2:1,record:{primaryHistory:primaryHistory.length?primaryHistoryData:undefined,afterHistory:afterHistory.length?afterHistoryData:undefined,contextHistory:history.length?historyData:undefined,contextDetached:row.contextDetached,contextFirst:row.contextFirst,photoRole:photoSet||hasRechecks(row)||!!row.photoInputs||!!row.siteContext||!!siteContextHistory||afterHistory.length||actionHistory.length||primaryHistory.length?(row.photoRole||'unspecified'):undefined,contextPhoto:contextPhotoData,additionalActions:photoSet||hasRechecks(row)||!!row.photoInputs||!!row.siteContext||!!siteContextHistory||afterHistory.length||actionHistory.length||primaryHistory.length?actionsForBackup:row.additionalActions?.length?actionsForBackup:undefined,afterPhoto:afterPhotoData,followup:row.followup,siteContext:siteContextValue,siteContextSha256,siteContextHistory,siteContextHistorySha256,photoInputs:row.photoInputs,photoInputsSha256,photoEdits:photoEditsData,rechecks:row.rechecks,recheckSha256,id:row.id,createdAt:row.createdAt,note:row.note,action:row.action,legalVersion:row.legalVersion,reviewedAt:row.reviewedAt,photoName:row.photo.name||'PSI-photo',photoType:row.photo.type,sha256:digest,photoData:dataUrl}})],{type:'application/json'});
}
async function unpackRecord(file:File):Promise<LocalRecord>{
 if(file.size>Math.ceil(BACKUP_LIMIT*11.2)+25000000)throw new Error('백업 파일이 허용 크기를 초과합니다.');
 let data:any;try{data=JSON.parse(await file.text());}catch{throw new Error('백업 파일을 읽을 수 없습니다.');}
 const r=data?.record;
 if(data?.format!=='psi-local-inspection'||![1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17].includes(data?.version)||!r||typeof r!=='object'||!/^[-a-f0-9]{36}$/i.test(r.id)||typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt))||typeof r.note!=='string'||!r.note.trim()||r.note.length>4000||typeof r.action!=='string'||r.action.length>4000||typeof r.legalVersion!=='string'||r.legalVersion.length>200||typeof r.reviewedAt!=='string'||r.reviewedAt.length>50||typeof r.photoName!=='string'||r.photoName.length>255||!['image/jpeg','image/png','image/webp'].includes(r.photoType)||!/^[a-f0-9]{64}$/.test(r.sha256)||typeof r.photoData!=='string'||r.photoData.length>Math.ceil(BACKUP_LIMIT*4/3)+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(r.photoData))throw new Error('지원하지 않거나 손상된 백업 파일입니다.');
 if(data.version<17&&(r.rechecks!==undefined||r.recheckSha256!==undefined||(r.additionalActions||[]).some((a:AdditionalAction)=>a.rechecks!==undefined)))throw new Error('이전 백업 형식에 재점검 이력이 포함되어 있습니다.');
 if(data.version<16&&r.photoEdits!==undefined)throw new Error('이전 백업에 예상하지 않은 편집 전 사진이 포함됐습니다.');
 if(data.version<15&&(r.photoInputs!==undefined||r.photoInputsSha256!==undefined))throw new Error('이전 백업 형식에 사진 출처 기록이 포함되어 있습니다.');
 if(data.version<13&&(r.siteContext!==undefined||r.siteContextSha256!==undefined||r.siteContextHistory!==undefined||r.siteContextHistorySha256!==undefined))throw new Error('이전 백업 형식에 예상하지 않은 현장정보가 포함됐습니다.');
 let siteContext:FieldContext|undefined;
 if(data.version===13||data.version===14||data.version>=15&&r.siteContext!==undefined){
  if((data.version===13||r.siteContext!==null)&&!validFieldContext(r.siteContext)||typeof r.siteContextSha256!=='string'||!/^[a-f0-9]{64}$/.test(r.siteContextSha256))throw new Error('현장정보가 손상되어 복원하지 못했습니다.');
  const canonical:FieldContext|null=r.siteContext===null?null:{site:r.siteContext.site,building:r.siteContext.building,level:r.siteContext.level,trade:r.siteContext.trade};
  const digest=await hash(new File([JSON.stringify(canonical)],'site-context.json',{type:'application/json'}));
  if(!digest||digest!==r.siteContextSha256)throw new Error('현장정보 비교값이 일치하지 않아 복원을 중단했습니다.');
  siteContext=canonical||undefined;
 }
 let siteContextHistory:SiteContextChange[]|undefined;
 if(data.version===13&&(r.siteContextHistory!==undefined||r.siteContextHistorySha256!==undefined))throw new Error('이전 백업 형식에 변경 이력이 포함되어 있습니다.');
 if(data.version===14||data.version>=15&&r.siteContextHistory!==undefined){
  if(!validSiteContextHistory(r.siteContextHistory,siteContext||null)||typeof r.siteContextHistorySha256!=='string'||!/^[a-f0-9]{64}$/.test(r.siteContextHistorySha256))throw new Error('현장정보 변경 이력이 손상되어 복원을 중단했습니다.');
  const digest=await hash(new File([JSON.stringify(r.siteContextHistory)],'site-context-history.json',{type:'application/json'}));
  if(!digest||digest!==r.siteContextHistorySha256)throw new Error('현장정보 변경 이력 비교값이 일치하지 않아 복원을 중단했습니다.');
  siteContextHistory=r.siteContextHistory.map((item:SiteContextChange)=>({before:item.before,after:item.after,reason:item.reason,at:item.at,actor:item.actor}));
 }
 if((data.version===2||data.version>=3&&r.followup!==undefined)&&!validateFollowup(r.followup))throw new Error('후속 조치 기록이 손상되어 복원하지 못했습니다.');
 if(data.version>=4&&!validateAdditionalActions(r.additionalActions))throw new Error('추가 조치 기록이 손상되어 복원하지 못했습니다.');
 if(data.version>=4&&data.version<11&&r.additionalActions.some((item:AdditionalAction)=>item.photoHistory!==undefined))throw new Error('이전 형식의 조치별 사진 이력은 복원할 수 없습니다.');
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
 if(data.version>=11){
  let total=0,count=0;
  for(const item of additionalActions||[]){
   const histories=item.photoHistory as unknown as {name:string;type:string;sha256:string;replacedAt:string;data:string}[]|undefined;
   if(histories===undefined)continue;
   if(!item.photo||!Array.isArray(histories)||!histories.length||histories.length>5)throw new Error('이전 조치별 사진 이력이 손상되었습니다.');
   const restored:AfterHistory[]=[];
   for(const h of histories){
    if(!h||typeof h.name!=='string'||h.name.length>255||!['image/jpeg','image/png','image/webp'].includes(h.type)||typeof h.sha256!=='string'||!/^[a-f0-9]{64}$/.test(h.sha256)||typeof h.replacedAt!=='string'||!Number.isFinite(Date.parse(h.replacedAt))||typeof h.data!=='string'||h.data.length>Math.ceil(BACKUP_LIMIT*4/3)+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(h.data))throw new Error('이전 조치별 사진 이력이 손상되었습니다.');
    let raw:string;try{raw=atob(h.data);}catch{throw new Error('이전 조치별 사진을 읽지 못했습니다.');}
    total+=raw.length;count++;if(!raw.length||total>BACKUP_LIMIT)throw new Error('이전 조치별 사진 크기가 허용 범위를 초과합니다.');
    const previous=new File([Uint8Array.from(raw,ch=>ch.charCodeAt(0))],h.name,{type:h.type});
    if(await hash(previous)!==h.sha256)throw new Error('이전 조치별 사진의 무결성이 확인되지 않아 복원을 중단했습니다.');
    restored.push({photo:previous,sha256:h.sha256,replacedAt:h.replacedAt});
   }
   item.photoHistory=restored;
  }
  if(data.version===11&&!count)throw new Error('이전 조치별 사진 이력이 손상되었습니다.');
  if((r.afterHistory!==undefined&&(!r.afterPhoto||!Array.isArray(r.afterHistory)||!r.afterHistory.length||r.afterHistory.length>5))||(r.contextHistory!==undefined&&(!r.contextPhoto||!Array.isArray(r.contextHistory)||!r.contextHistory.length||r.contextHistory.length>5))||(r.contextDetached!==undefined&&typeof r.contextDetached!=='boolean')||(r.contextFirst!==undefined&&typeof r.contextFirst!=='boolean')||((r.contextDetached!==undefined||r.contextFirst!==undefined)&&!r.contextPhoto))throw new Error('사진 이력이 손상되었습니다.');
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
 if(data.version>=10&&r.afterHistory!==undefined){
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
 const primaryHistory:AfterHistory[]=[];
 if(data.version===12||data.version>=13&&r.primaryHistory!==undefined){
  if(!Array.isArray(r.primaryHistory)||!r.primaryHistory.length||r.primaryHistory.length>5)throw new Error('이전 기본 사진 이력이 손상되었습니다.');
  let total=0;
  for(const h of r.primaryHistory){
   if(!h||typeof h.name!=='string'||h.name.length>255||!['image/jpeg','image/png','image/webp'].includes(h.type)||typeof h.sha256!=='string'||!/^[a-f0-9]{64}$/.test(h.sha256)||typeof h.replacedAt!=='string'||!Number.isFinite(Date.parse(h.replacedAt))||typeof h.data!=='string'||h.data.length>Math.ceil(BACKUP_LIMIT*4/3)+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(h.data))throw new Error('이전 기본 사진 이력이 손상되었습니다.');
   let raw:string;try{raw=atob(h.data);}catch{throw new Error('이전 기본 사진을 읽지 못했습니다.');}
   total+=raw.length;if(!raw.length||total>BACKUP_LIMIT)throw new Error('이전 기본 사진 크기가 허용 범위를 초과합니다.');
   const previous=new File([Uint8Array.from(raw,ch=>ch.charCodeAt(0))],h.name,{type:h.type});
   if(await hash(previous)!==h.sha256)throw new Error('이전 기본 사진의 무결성이 확인되지 않아 복원을 중단했습니다.');
   primaryHistory.push({photo:previous,sha256:h.sha256,replacedAt:h.replacedAt});
  }
 }
 const restored:LocalRecord={siteContext,siteContextHistory,primaryHistory:primaryHistory.length?primaryHistory:undefined,afterHistory:afterHistory.length?afterHistory:undefined,contextHistory:contextHistory.length?contextHistory:undefined,contextDetached:data.version>=8?r.contextDetached:undefined,contextFirst:data.version>=7?r.contextFirst:undefined,photoRole:data.version>=6?r.photoRole:undefined,contextPhoto,contextSha256,contextRole,additionalActions,afterPhoto,afterSha256,followup:data.version>=2?r.followup:undefined,id:r.id,createdAt:r.createdAt,note:r.note,action:r.action,legalVersion:r.legalVersion,reviewedAt:r.reviewedAt,photo,sha256:r.sha256};
 if(data.version===15||data.version===16||data.version===17&&r.photoInputs!==undefined){
  if(!validPhotoInputs(r.photoInputs,restored)||typeof r.photoInputsSha256!=='string'||!/^[0-9a-f]{64}$/.test(r.photoInputsSha256))throw new Error('사진 출처 기록이 손상되어 복원하지 못했습니다.');
  const digest=await hash(new File([JSON.stringify(r.photoInputs)],'photo-inputs.json',{type:'application/json'}));
  if(!digest||digest!==r.photoInputsSha256)throw new Error('사진 출처 기록 비교값이 일치하지 않아 복원을 중단했습니다.');
  restored.photoInputs=r.photoInputs as PhotoInputs;
 }
 if(data.version===16||data.version===17&&r.photoEdits!==undefined){
  if(!r.photoEdits||typeof r.photoEdits!=='object'||Array.isArray(r.photoEdits)||!Object.keys(r.photoEdits).length||Object.keys(r.photoEdits).length>70)throw new Error('편집 전 사진 이력이 손상됐습니다.');
  let totalOriginalBytes=0;
  const parsedEdits:PhotoEdits={};
  for(const [slot,entry] of Object.entries(r.photoEdits as Record<string,any>)){
   if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).length!==7||typeof entry.name!=='string'||entry.name.length>255||!['image/jpeg','image/png','image/webp'].includes(entry.type)||typeof entry.originalSha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.originalSha256)||typeof entry.derivedSha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.derivedSha256)||![90,180,270].includes(entry.rotationDegrees)||typeof entry.processedAt!=='string'||!Number.isFinite(Date.parse(entry.processedAt))||typeof entry.data!=='string'||entry.data.length>Math.ceil(BACKUP_LIMIT*4/3)+8||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(entry.data))throw new Error('편집 전 사진 백업이 손상됐습니다.');
   let bytes:string;try{bytes=atob(entry.data);}catch{throw new Error('편집 전 사진을 읽을 수 없습니다.');}
   totalOriginalBytes+=bytes.length;if(!bytes.length||totalOriginalBytes>BACKUP_LIMIT)throw new Error('편집 전 사진 백업 크기가 허용 범위를 초과합니다.');
   const originalFile=new File([Uint8Array.from(bytes,ch=>ch.charCodeAt(0))],entry.name,{type:entry.type});
   if(await hash(originalFile)!==entry.originalSha256)throw new Error('편집 전 사진의 SHA-256 비교값이 일치하지 않아 복원을 중단했습니다.');
   parsedEdits[slot]={originalFile,originalSha256:entry.originalSha256,derivedSha256:entry.derivedSha256,rotationDegrees:entry.rotationDegrees,processedAt:entry.processedAt};
  }
  if(!validPhotoEdits(parsedEdits,restored))throw new Error('편집 전 사진과 회전본의 연결 정보를 확인할 수 없어 복원을 중단했습니다.');
  restored.photoEdits=parsedEdits;
 }
 if(data.version===17){
  restored.rechecks=r.rechecks;
  if(!hasRechecks(restored)||!validateRecheckPayload(restored)||typeof r.recheckSha256!=='string'||!/^[a-f0-9]{64}$/.test(r.recheckSha256))throw new Error('재점검 이력이나 사진 연결 정보가 손상되어 복원하지 못했습니다.');
  const digest=await hash(new File([JSON.stringify(recheckPayload(restored))],'recheck-history.json',{type:'application/json'}));
  if(!digest||digest!==r.recheckSha256)throw new Error('재점검 이력의 비교값이 일치하지 않아 복원을 중단했습니다.');
 }
 return restored;
}
function FieldContextEditor({row,busy,onSave}:{row:LocalRecord;busy:boolean;onSave:(row:LocalRecord,next:FieldContext|null,reason:string)=>Promise<boolean>}){
 const [next,setNext]=useState<FieldContext>(row.siteContext||EMPTY_FIELD_CONTEXT),[reason,setReason]=useState('');
 const [editing,setEditing]=useState(false);
 const savedContext=JSON.stringify(row.siteContext||null);
 useEffect(()=>{setNext(row.siteContext||EMPTY_FIELD_CONTEXT);setReason('');},[savedContext]);
 const target=cleanFieldContext(next)||null,changed=JSON.stringify(target)!==savedContext;
 const save=async()=>{if(!changed||reason.trim().length<5||busy)return;if(await onSave(row,target,reason.trim())){setReason('');setEditing(false);}};
 const history=row.siteContextHistory||[];
 return <details aria-label="현장정보 정정 및 이력" open={editing} onToggle={event=>setEditing(event.currentTarget.open)}>
  <summary>현장정보 정정 · 이전 기록 {history.length}건</summary>
  <p>현장정보는 점검자가 작성한 진술입니다. 기기 입력은 실제 사진 촬영 위치를 증명하지 않습니다. 수정 시 이전 내용과 사유를 이력에 남기며 원본 사진은 변경하지 않습니다.</p>
  <fieldset disabled={busy} style={{display:'grid',gap:6}}>
   <label>현장명 정정<input aria-label="기록 현장 이름 수정" maxLength={100} value={next.site} onChange={e=>setNext(v=>({...v,site:e.target.value}))}/></label>
   <label>동 정정<input aria-label="기록 동 정정" maxLength={40} value={next.building} onChange={e=>setNext(v=>({...v,building:e.target.value}))}/></label>
   <label>층 정정<input aria-label="기록 층 정정" maxLength={40} value={next.level} onChange={e=>setNext(v=>({...v,level:e.target.value}))}/></label>
   <label>공종 정정<input aria-label="기록 공종 정정" maxLength={60} value={next.trade} onChange={e=>setNext(v=>({...v,trade:e.target.value}))}/></label>
   <label>변경 사유 (5~200자)<textarea aria-label="현장정보 변경 사유" maxLength={200} value={reason} onChange={e=>setReason(e.target.value)} placeholder="예: 작업반장 확인 후 실제 층을 수정함"/></label>
  </fieldset>
  {!target&&<p>모든 정보를 지우면 '현장정보 미확인'으로 기록되며 이력은 계속 보존됩니다.</p>}
  <button type="button" className="si-btn" disabled={busy||!changed||reason.trim().length<5||history.length>=100} onClick={()=>void save()}>현장정보 정정 저장</button>
  {history.length>=100&&<p role="alert">변경 이력이 100건에 도달했습니다. 기존 이력을 지우지 않고 새 점검 기록을 작성하세요.</p>}
  {history.length>0&&<details><summary>이전 현장정보 변경 이력 {history.length}건</summary>
   {history.map((entry,index)=><p key={index}>{index+1}. {new Date(entry.at).toLocaleString('ko-KR')} (이 기기 시각) · 이전: {entry.before?fieldContextLabel(entry.before):'미확인'} → 변경: {entry.after?fieldContextLabel(entry.after):'미확인'} · 사유: {entry.reason} · 입력: 기기 사용자(개인 신원 확인 아님)</p>)}
  </details>}
 </details>;
}
function LocalEvidenceAudit({inspectionId,busy}:{inspectionId:string;busy:boolean}){
 const [audit,setAudit]=useState<EvidenceManifest|null>(null),[running,setRunning]=useState(false),[errorText,setErrorText]=useState('');
 const downloadOriginal=async(slot:string)=>{
  if(busy||running)return;
  setErrorText('');
  try{
   const fresh=await runStore<LocalRecord|undefined>('readonly',(store,set)=>{const req=store.get(inspectionId);req.onsuccess=()=>set(req.result as LocalRecord|undefined);});
   const entry=fresh?.photoEdits?.[slot];
   if(!fresh||!entry||!validPhotoEdits(fresh.photoEdits,fresh)||await hash(entry.originalFile)!==entry.originalSha256)throw new Error('편집 전 사진 파일의 무결성을 확인하지 못했습니다. 다른 기기 백업을 확인하세요.');
   download(entry.originalFile,entry.originalFile.name);
  }catch(error){setErrorText(error instanceof Error?error.message:'편집 전 사진을 내려받을 수 없습니다.');}
 };
 const assess=async(saveFile:boolean)=>{
  if(busy||running)return;
  setRunning(true);setErrorText('');setAudit(null);
  try{
   const fresh=await runStore<LocalRecord|undefined>('readonly',(store,set)=>{const req=store.get(inspectionId);req.onsuccess=()=>set(req.result as LocalRecord|undefined);});
   if(!fresh)throw new Error('점검 기록을 찾지 못했습니다. 목록을 새로 확인하세요.');
   const manifest=await buildEvidenceManifest(fresh);
   setAudit(manifest);
   if(saveFile)download(new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'}),'PSI-evidence-manifest-'+inspectionId+'.json');
  }catch(err){setErrorText(err instanceof Error?err.message:'사진 증빙 검증을 완료하지 못했습니다.');}
  finally{setRunning(false);}
 };
 return <section aria-label="사진 증빙 검증">
  <h4>사진 증빙·교체 이력 검사</h4>
  <p>현재 저장된 기본·추가·조치 후·조치별 사진과 각각의 이전 버전을 한꺼번에 확인합니다. 사진을 수정하거나 서버에 업로드하지 않습니다.</p>
  <button type="button" className="si-btn" disabled={busy||running} onClick={()=>void assess(false)}>사진 증빙 전체 검증</button>{' '}
  <button type="button" className="si-btn" disabled={busy||running} onClick={()=>void assess(true)}>증빙 검증 목록 JSON 내려받기</button>
  {running&&<p role="status">저장된 모든 사진의 비교값을 확인하고 있습니다…</p>}
  {errorText&&<p role="alert">{errorText}</p>}
  {audit&&<div aria-label="사진 증빙 검증 결과"><p role="status">증빙 검사 결과: 총 {audit.checks.total}개 · 일치 {audit.checks.matched}개 · 불일치 {audit.checks.mismatch}개 · 기록된 비교값 없음 {audit.checks.unrecorded}개 · 계산 불가 {audit.checks.unavailable}개</p>
   {audit.photos.map((entry,index)=><div key={index}><p>{entry.role} · {entry.stage==='archived'?'이전 보관본 '+entry.order:'현재 보관본'} · {entry.filename} · {entry.check==='match'?'SHA-256 일치':entry.check==='mismatch'?'SHA-256 불일치':entry.check==='unrecorded'?'비교값 미기록':'검사 불가'}{entry.previousSha256?' · 이전 버전과 연결됨':''} · 회전 이력: {entry.derivativeStatus==='not-recorded'?'별도 기록 없음':entry.derivativeStatus==='match'?entry.rotationDegrees+'° 회전 · 편집 전/후 파일 일치':entry.derivativeStatus==='mismatch'?'편집 전 사진 검증 불일치':'편집 전 사진 검사 불가'} · 입력 출처: {photoInputLabel(entry.sourceMethod==='unknown'?undefined:{source:entry.sourceMethod,recordedAt:entry.sourceRecordedAt||'',sha256:entry.expectedSha256||''})}</p>{entry.originalFilename&&<button type="button" className="si-btn" disabled={busy||running||entry.derivativeStatus!=='match'} onClick={()=>void downloadOriginal(entry.slot)}>편집 전 사진 내려받기 ({entry.role} · {entry.order}번)</button>}</div>)}
   <p>검사 시각은 이 기기 시각입니다. 파일명·기록상 교체 시각·해시 관계는 실제 촬영 장소·시각·원본 여부·신원·안전조치 완료를 증명하지 않습니다. 최초 받아 저장한 사진이 편집본일 수도 있습니다. 파일 선택 버튼은 OS 카메라 촬영으로 이어질 수도 있으므로 사진첩 사진으로 확정하지 않습니다. 출처 기록은 앱 입력 경로만 나타내며 EXIF·실제 촬영 장소·기기 시각 정확성은 별도 검증되지 않았습니다.</p>
   {audit.photos.some(item=>item.derivativeStatus==='mismatch'||item.derivativeStatus==='unavailable')&&<p role="alert">편집 전 사진 비교값 불일치 또는 확인 불가입니다. 해당 증빙의 원본·가공본 관계를 별도로 확인하세요.</p>}
   {audit.checks.mismatch+audit.checks.unrecorded+audit.checks.unavailable>0&&<p role="alert">일치하지 않거나 검증되지 않은 사진이 있습니다. 원본을 별도로 확인해 주세요. 검증 목록은 참고용이며 인증서가 아닙니다.</p>}
  </div>}
  <p>내려받는 JSON은 사진 원본이 아닌 파일명·크기·SHA-256 검사값·교체 관계의 요약입니다. 암호화되지 않았으며 파일명에 개인정보가 들어 있을 수 있습니다. 사진 파일은 기존 백업 기능으로 별도 보관하세요.</p>
 </section>;
}
function FollowupEditor({row,busy,onSave}:{row:LocalRecord;busy:boolean;onSave:(id:string,value:Followup)=>Promise<boolean>}){
 const current=row.followup;
 const [status,setStatus]=useState(current?.status||'pending'),[assignee,setAssignee]=useState(current?.assignee||''),[dueDate,setDueDate]=useState(current?.dueDate||''),[temporaryMeasure,setTemporaryMeasure]=useState(current?.temporaryMeasure||''),[note,setNote]=useState('');
 const [editing,setEditing]=useState(false);
 const save=async()=>{
  if(!note.trim())return;
  const measure=temporaryMeasure.trim();
  const history=[...(current?.history||[]),{status,assignee:assignee.trim(),dueDate,temporaryMeasure:measure,note:note.trim(),at:new Date().toISOString()}];
  const value={status,assignee:assignee.trim(),dueDate,temporaryMeasure:measure,history};
  if(await onSave(row.id,value)){setNote('');setEditing(false);}
 };
 return <section aria-label="후속 조치 관리"><p><strong>{current?FOLLOWUP_LABELS[current.status]:'상태 미기록'}</strong> · 담당: {current?.assignee||'미지정'} · 기한: {current?.dueDate||'미정'} {current&&overdue(current)?'· 기한 초과':''}</p>
  <p>{current?.temporaryMeasure?'현재 기록된 임시 안전조치: '+current.temporaryMeasure:'임시 안전조치 미기록'} · 임시 안전조치 기록만으로 위험 제거 또는 최종 완료가 확인된 것은 아닙니다.</p>
  <p>기기에만 저장됩니다. 담당자에게 자동 전달되지 않으며, 조치 확인은 사람이 직접 합니다.</p>
  <button type="button" className="si-btn" disabled={busy} onClick={()=>setEditing(!editing)}>{editing?'닫기':'후속 조치 기록'}</button>
  {editing&&<div><label>조치 상태<select value={status} onChange={e=>setStatus(e.target.value)}>{FOLLOWUP_STATES.map(key=><option key={key} value={key}>{FOLLOWUP_LABELS[key]}</option>)}</select></label>
   <label>담당자<input value={assignee} maxLength={100} onChange={e=>setAssignee(e.target.value)} placeholder="미지정 가능"/></label>
   <label>목표 기한<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
   <label>임시 안전조치 (최종 완료와 별개)<textarea value={temporaryMeasure} maxLength={1000} onChange={e=>setTemporaryMeasure(e.target.value)} placeholder="예: 위험 구역 출입 통제·표지 설치. 미실시라면 비워 두세요."/></label>
   <label>진행·확인 내용<textarea value={note} maxLength={2000} onChange={e=>setNote(e.target.value)} placeholder="임시 조치, 진행 상황 또는 확인 내용을 입력"/></label>
   <button type="button" className="si-btn" disabled={busy||!note.trim()} onClick={()=>void save()}>후속 기록 저장</button></div>}
  {!!current?.history.length&&<details><summary>조치 이력 {current.history.length}건</summary>{current.history.map((entry,i)=><p key={i}>{new Date(entry.at).toLocaleString('ko-KR')} · {FOLLOWUP_LABELS[entry.status]} · {entry.note} {entry.temporaryMeasure?'· 당시 임시 안전조치: '+entry.temporaryMeasure:''} · 담당 {entry.assignee||'미지정'} · 기한 {entry.dueDate||'미정'}</p>)}</details>}
 </section>;
}
function RecheckEditor({row,action,busy,onSave}:{row:LocalRecord;action?:AdditionalAction;busy:boolean;onSave:(row:LocalRecord,actionId:string|null,entry:Recheck)=>Promise<boolean>}){
 const [opened,setOpened]=useState(false),[result,setResult]=useState<Recheck['result']>('delayed'),[reason,setReason]=useState(''),[note,setNote]=useState(''),[nextCheckDate,setNextCheckDate]=useState('');
 const history=action?.rechecks||(!action?row.rechecks:undefined)||[];
 const hashes=evidencePhotoHashes(row,action),latestPhoto=action?action.photoSha256||null:row.afterSha256||null;
 const targetLabel=action?'조치별':'점검 전체';
 const submit=async()=>{
  const entry:Recheck={id:crypto.randomUUID(),result,reason:reason.trim(),note:note.trim(),nextCheckDate,at:new Date().toISOString(),photoSha256:latestPhoto,followupStatus:(action?.followup||row.followup)?.status||'unrecorded'};
  if(!validRechecks([entry],hashes,1))return;
  if(await onSave(row,action?.id||null,entry)){setOpened(false);setReason('');setNote('');setNextCheckDate('');}
 };
 return <section aria-label={targetLabel+' 재점검·지연 사유'}>
  <h5>{targetLabel} 지연 조치·재점검 기록</h5>
  <p>재점검 {history.length}건 · {history.length?RECHECK_LABELS[history[history.length-1].result]:'재점검 기록 없음'} · 현재 연결 가능 증빙: {latestPhoto?'조치 후 사진 SHA-256':'사진 없음'}</p>
  <p>즉시 조치가 불가능해도 지연 사유와 임시 통제 상태를 남길 수 있습니다. 이 기록은 자동으로 '확인 완료'를 지정하거나 담당자에게 통보하지 않습니다.</p>
  <button type="button" className="si-btn" disabled={busy||history.length>=(action?50:100)} onClick={()=>setOpened(v=>!v)}>{opened?'재점검 입력 닫기':'지연 사유·재점검 추가'}</button>
  {opened&&<div>
   <label>재점검 결과<select aria-label={targetLabel+' 재점검 결과'} value={result} onChange={e=>setResult(e.target.value as Recheck['result'])}>{(Object.keys(RECHECK_LABELS) as Recheck['result'][]).map(key=><option key={key} value={key}>{RECHECK_LABELS[key]}</option>)}</select></label>
   <label>지연·재점검 사유<textarea aria-label={targetLabel+' 지연·재점검 사유'} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="예: 자재 입고 지연으로 보수 불가, 출입 통제 유지"/></label>
   <label>현장 확인·임시조치 내용<textarea aria-label={targetLabel+' 현장 확인·임시조치 내용'} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="예: 통제선과 경고 표지는 확인, 본 조치는 미완료"/></label>
   <label>다음 확인 예정일 (미정 가능)<input aria-label={targetLabel+' 다음 확인 예정일'} type="date" value={nextCheckDate} onChange={e=>setNextCheckDate(e.target.value)}/></label>
   <p>저장 시 연결 사진: {latestPhoto?'현재 조치 사진의 SHA-256 기록':'없음 (사진 미확인)'}. 이후 사진을 교체해도 당시 연결 해시는 유지됩니다. 촬영 위치·시각·조치 효과는 별도 확인해야 합니다.</p>
   <button type="button" className="si-btn" disabled={busy||reason.trim().length<5||note.trim().length<5||!validRecheckDate(nextCheckDate)} onClick={()=>void submit()}>재점검 이력 저장</button>
  </div>}
  {history.length>0&&<details><summary>재점검·지연 이력 {history.length}건</summary>
   {history.map((entry,i)=><p key={entry.id}>{i+1}. {new Date(entry.at).toLocaleString('ko-KR')} (기기 시각) · {RECHECK_LABELS[entry.result]} · 사유: {entry.reason} · 확인: {entry.note} · 다음 확인: {entry.nextCheckDate||'미정'} · 당시 후속 상태: {FOLLOWUP_LABELS[entry.followupStatus]||'미기록'} · 사진: {entry.photoSha256?'SHA-256 '+entry.photoSha256.slice(0,12)+'…':'연결 없음'}</p>)}
  </details>}
 </section>;
}
function ActionItem({row,item,busy,onUpdate,onPhoto,onRecheck}:{key?:string;row:LocalRecord;item:AdditionalAction;busy:boolean;onUpdate:(row:LocalRecord,actions:AdditionalAction[])=>Promise<boolean>;onPhoto:(row:LocalRecord,item:AdditionalAction,file:File)=>Promise<boolean>;onRecheck:(row:LocalRecord,actionId:string|null,entry:Recheck)=>Promise<boolean>}){
 const [pending,setPending]=useState<File|null>(null);
 const actions=row.additionalActions||[];
 useEffect(()=>{if(!pending)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[pending]);
 return <div><h5>{item.title}</h5><FollowupEditor row={{...row,followup:item.followup}} busy={busy} onSave={async(_id,value)=>onUpdate(row,actions.map(entry=>entry.id===item.id?{...entry,followup:value}:entry))}/><RecheckEditor row={row} action={item} busy={busy} onSave={onRecheck}/>
  <p>이 조치의 사진: {item.photo?.name||'없음'}</p><label>이 조치 사진 선택<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f&&(!pending||window.confirm('저장하지 않은 사진을 바꿀까요?')))setPending(f);}}/></label>
  {pending&&<div><p>저장 전 사진: {pending.name}</p><button type="button" className="si-btn" disabled={busy} onClick={async()=>{if(await onPhoto(row,item,pending))setPending(null);}}>이 조치에 사진 저장</button> <button type="button" className="si-btn" onClick={()=>download(pending,pending.name)}>저장 전 사진 내려받기</button></div>}
  {item.photo&&<button type="button" className="si-btn" onClick={()=>download(item.photo!,item.photo!.name)}>이 조치 사진 내려받기</button>}
  {!!item.photoHistory?.length&&<details><summary>이 조치의 이전 사진 {item.photoHistory.length}장</summary><p>교체 시각은 기기 시각이며 촬영 시각과 다를 수 있습니다.</p>{item.photoHistory.map((entry,i)=><p key={i}>{entry.photo.name} · {new Date(entry.replacedAt).toLocaleString('ko-KR')} <button type="button" className="si-btn" onClick={()=>download(entry.photo,entry.photo.name)}>이 조치의 이전 사진 내려받기</button></p>)}</details>}
 </div>;
}
function AdditionalActions({row,busy,onUpdate,onPhoto,onRecheck}:{row:LocalRecord;busy:boolean;onUpdate:(row:LocalRecord,actions:AdditionalAction[])=>Promise<boolean>;onPhoto:(row:LocalRecord,item:AdditionalAction,file:File)=>Promise<boolean>;onRecheck:(row:LocalRecord,actionId:string|null,entry:Recheck)=>Promise<boolean>}){
 const [title,setTitle]=useState('');
 const actions=row.additionalActions||[];
 const add=async()=>{if(!title.trim()||actions.length>=20)return;if(await onUpdate(row,[...actions,{id:crypto.randomUUID(),title:title.trim()}]))setTitle('');};
 return <section aria-label="추가 조치 항목"><h4>추가 조치 항목 {actions.length}건</h4><p>각 조치를 따로 관리합니다. 조치별 사진은 합계 20MB까지 저장할 수 있습니다.</p>
  {actions.map(item=><ActionItem key={item.id} row={row} item={item} busy={busy} onUpdate={onUpdate} onPhoto={onPhoto} onRecheck={onRecheck}/>)}
  <label>추가할 조치 내용<input value={title} maxLength={200} disabled={busy||actions.length>=20} onChange={e=>setTitle(e.target.value)} placeholder="예: 개구부 덮개 고정"/></label>
  <button type="button" className="si-btn" disabled={busy||!title.trim()||actions.length>=20} onClick={()=>void add()}>조치 항목 추가</button>
  {actions.length>=20&&<p>한 점검에 추가 조치 항목을 20개까지 기록할 수 있습니다.</p>}
 </section>;
}
function PrimaryPhotoEditor({row,busy,onSave}:{row:LocalRecord;busy:boolean;onSave:(row:LocalRecord,file:File,source:PhotoInput['source'],edit?:CameraEditEvidence)=>Promise<boolean>}){
 const [pending,setPending]=useState<File|null>(null),[pendingEdit,setPendingEdit]=useState<CameraEditEvidence|undefined>(),[pendingInputSource,setPendingInputSource]=useState<PhotoInput['source']>('file-picker'),[camera,setCamera]=useState(false),[editing,setEditing]=useState(false);
 useEffect(()=>{if(!pending)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[pending]);
 return <section aria-label="기본 사진 관리"><button type="button" className="si-btn" disabled={busy} onClick={()=>{if(editing&&pending&&!window.confirm('저장하지 않은 사진을 버릴까요?'))return;setPending(null);setEditing(!editing);}}>{editing?'기본 사진 교체 취소':'기본 사진 교체'}</button>
  {editing&&<><p>교체하면 이후 조치 전 비교의 기준이 바뀝니다. 이전 사진은 이력에 보관됩니다.</p><button type="button" className="si-btn" disabled={busy} onClick={()=>{if(pending&&!window.confirm('저장하지 않은 사진을 바꾸고 촬영할까요?'))return;setCamera(true);}}>새 기본 사진 촬영</button> <label>새 기본 사진 선택<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f&&(!pending||window.confirm('저장하지 않은 사진을 바꿀까요?'))){setPending(f);setPendingEdit(undefined);setPendingInputSource('file-picker');}}}/></label></>}
  {pending&&<div><p>저장 전 기본 사진: {pending.name}</p><button type="button" className="si-btn" disabled={busy} onClick={async()=>{if(!window.confirm('기본 사진을 교체할까요? 기존 조치 후 사진의 촬영 당시 기준과 달라질 수 있습니다.'))return;if(await onSave(row,pending,pendingInputSource,pendingEdit)){setPending(null);setEditing(false);}}}>기본 사진 교체 저장</button> <button type="button" className="si-btn" onClick={()=>download(pending,pending.name)}>저장 전 기본 사진 내려받기</button></div>}
  {!!row.primaryHistory?.length&&<details><summary>이전 기본 사진 {row.primaryHistory.length}장</summary><p>교체 시각은 기기 시각이며 촬영 시각과 다를 수 있습니다.</p>{row.primaryHistory.map((entry,i)=><p key={i}>{entry.photo.name} · {new Date(entry.replacedAt).toLocaleString('ko-KR')} <button type="button" className="si-btn" onClick={()=>download(entry.photo,entry.photo.name)}>이전 기본 사진 내려받기</button></p>)}</details>}
  {camera&&<InspectorCameraDialog onClose={()=>setCamera(false)} onUse={(file,edit)=>{setPending(file);setPendingEdit(edit);setPendingInputSource('camera-dialog');setCamera(false);}}/>}
 </section>;
}
function ContextPhotoEditor({row,busy,onSave,onOrder,onLink}:{row:LocalRecord;busy:boolean;onSave:(row:LocalRecord,file:File,role:'overview'|'detail',source:PhotoInput['source'],edit?:CameraEditEvidence)=>Promise<boolean>;onOrder:(row:LocalRecord)=>Promise<void>;onLink:(row:LocalRecord)=>Promise<void>}){
 const [pending,setPending]=useState<File|null>(null),[pendingEdit,setPendingEdit]=useState<CameraEditEvidence|undefined>(),[pendingInputSource,setPendingInputSource]=useState<PhotoInput['source']>('file-picker'),[role,setRole]=useState<'overview'|'detail'>(row.contextRole||(row.photoRole==='overview'?'detail':'overview'));
 const [camera,setCamera]=useState(false),[replacing,setReplacing]=useState(false);
 const [previews,setPreviews]=useState<{primary:string;context:string}>({primary:'',context:''});
 useEffect(()=>{const primary=URL.createObjectURL(row.photo);const context=row.contextPhoto?URL.createObjectURL(row.contextPhoto):'';setPreviews({primary,context});return()=>{URL.revokeObjectURL(primary);if(context)URL.revokeObjectURL(context);};},[row.photo,row.contextPhoto]);
 useEffect(()=>{if(!pending)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[pending]);
 return <section aria-label="현장 사진 묶음"><p>기본 사진: {row.photoRole==='overview'?'현장 전체':row.photoRole==='detail'?'위험 부위':'역할 미지정'} · 추가 사진: {row.contextPhoto?(row.contextDetached?'연결 해제 · 보관 중 · ':'')+(row.contextRole==='overview'?'현장 전체':'위험 부위')+' · '+row.contextPhoto.name:'없음'}</p>
  <p>사진 한 장으로도 점검을 저장할 수 있습니다. 추가 사진은 나중에 연결할 수 있습니다.</p>
  {row.contextPhoto&&!row.contextDetached&&<><div aria-label="현장 사진 표시 순서" style={{display:'flex',gap:12,flexWrap:'wrap'}}>{(row.contextFirst?['context','primary']:['primary','context']).map(which=><figure key={which} style={{margin:0,width:120}}><img src={which==='primary'?previews.primary:previews.context} alt={which==='primary'?'기본 사진':'추가 현장 사진'} style={{width:'100%',height:100,objectFit:'cover'}}/><figcaption>{which==='primary'?'기본 사진':'추가 현장 사진'}</figcaption></figure>)}</div><button type="button" className="si-btn" disabled={busy} onClick={()=>void onOrder(row)}>사진 표시 순서 바꾸기</button><p>표시 순서만 바뀌며 원본과 촬영 구분은 유지됩니다.</p></>}

  {row.contextPhoto&&!row.contextDetached&&!replacing&&<button type="button" className="si-btn" disabled={busy} onClick={()=>setReplacing(true)}>추가 사진 교체</button>}
  {(!row.contextPhoto||replacing)&&<><label>추가 사진 역할<select value={role} disabled={!!row.contextPhoto} onChange={e=>setRole(e.target.value as 'overview'|'detail')}><option value="overview">현장 전체</option><option value="detail">위험 부위</option></select></label><button type="button" className="si-btn" disabled={busy} onClick={()=>{if(pending&&!window.confirm('저장하지 않은 추가 사진을 버리고 다시 촬영할까요?'))return;setCamera(true);}}>추가 현장 사진 촬영</button> <label>현장 사진 추가<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f&&(!pending||window.confirm('저장하지 않은 추가 사진을 바꿀까요?'))){setPending(f);setPendingEdit(undefined);setPendingInputSource('file-picker');}}}/></label></>}
  {pending&&<div><p>저장 전 사진: {pending.name}</p><button type="button" className="si-btn" disabled={busy} onClick={async()=>{if(await onSave(row,pending,role,pendingInputSource,pendingEdit)){setPending(null);setReplacing(false);}}}>현장 사진 연결</button> <button type="button" className="si-btn" onClick={()=>download(pending,pending.name)}>추가 사진 내려받기</button></div>}
  {row.contextPhoto&&<div><button type="button" className="si-btn" disabled={busy||!!pending||replacing} onClick={()=>void onLink(row)}>{row.contextDetached?'추가 사진 다시 연결':'추가 사진 연결 해제'}</button> <button type="button" className="si-btn" onClick={()=>download(row.contextPhoto!,row.contextPhoto!.name)}>보관된 현장 사진 내려받기</button><p>연결을 해제해도 사진은 이 기기와 함께 백업되는 기록에 남습니다.</p></div>}
  {replacing&&<button type="button" className="si-btn" disabled={busy} onClick={()=>{if(pending&&!window.confirm('저장하지 않은 사진을 버릴까요?'))return;setPending(null);setReplacing(false);}}>교체 취소</button>}
  {!!row.contextHistory?.length&&<details><summary>이전 현장 사진 {row.contextHistory.length}장</summary><p>교체 시각은 기기 시각이며 촬영 시각과 다를 수 있습니다.</p>{row.contextHistory.map((entry,i)=><p key={i}>{entry.photo.name} · {new Date(entry.replacedAt).toLocaleString('ko-KR')} <button type="button" className="si-btn" onClick={()=>download(entry.photo,entry.photo.name)}>이전 사진 내려받기</button></p>)}</details>}
  {camera&&<InspectorCameraDialog onClose={()=>setCamera(false)} onUse={(file,edit)=>{setPending(file);setPendingEdit(edit);setPendingInputSource('camera-dialog');setCamera(false);}}/>}
 </section>;
}
/** Local-only manual inspection. No server sync or image inference. */
export default function InspectorLocalDraft({offlineEntry=false}:{offlineEntry?:boolean}){
 const [photo,setPhoto]=useState<File|null>(null),[url,setUrl]=useState(''),[note,setNote]=useState(''),[action,setAction]=useState('');
 const [photoRole,setPhotoRole]=useState<PhotoRole>('unspecified');
 const [singlePhotoSource,setSinglePhotoSource]=useState<PhotoInput['source']|null>(null),[singlePhotoEdit,setSinglePhotoEdit]=useState<CameraEditEvidence|undefined>();
 const [siteContextInput,setSiteContextInput]=useState<FieldContext>(EMPTY_FIELD_CONTEXT);
 const [sequence,setSequence]=useState(false),[draft,setDraft]=useState<PhotoSetDraft|null>(null),[draftState,setDraftState]=useState<'loading'|'ready'|'error'>('loading');
 const draftRef=useRef<PhotoSetDraft|null>(null);
 const [rows,setRows]=useState<LocalRecord[]>([]),[camera,setCamera]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [afterCamera,setAfterCamera]=useState<LocalRecord|null>(null),[afterReferences,setAfterReferences]=useState<{primary:string;context:string}>({primary:'',context:''}),[afterReferenceChoice,setAfterReferenceChoice]=useState<'primary'|'context'>('primary');
 const [capturedAfter,setCapturedAfter]=useState<{row:LocalRecord;file:File;edit?:CameraEditEvidence}|null>(null);
 const flight=useRef(false),readSequence=useRef(0);
 const [readState,setReadState]=useState<'loading'|'ready'|'error'>('loading');
 const [checks,setChecks]=useState<Record<string,string>>({});
 const [filter,setFilter]=useState('all');
 const [backupIds,setBackupIds]=useState<string[]>([]);
 const [batchPreview,setBatchPreview]=useState<BatchPreviewEntry[]|null>(null);
 const [storageStatus,setStorageStatus]=useState<StorageStatus|null>(null);
 const [storageMessage,setStorageMessage]=useState('');
 const [storageBusy,setStorageBusy]=useState(false);
 const visibleRows=rows.filter(row=>{const items=[row.followup,...(row.additionalActions||[]).map(item=>item.followup)];return filter==='all'||items.some(item=>filter==='unassigned'?!item?.assignee:filter==='no_due'?!item?.dueDate:filter==='overdue'?!!item&&overdue(item):filter==='review'?item?.status==='review_requested':false);});
 const refresh=async()=>{const sequence=++readSequence.current;setChecks({});setReadState(previous=>previous==='ready'?'ready':'loading');try{const found=await list();if(sequence===readSequence.current){setRows(found);setReadState('ready');}}catch{if(sequence===readSequence.current)setReadState('error');}};
 useEffect(()=>{void refresh();},[]);
 const loadDraft=async()=>{
  setDraftState('loading');try{
   const saved=await runStore<PhotoSetDraft|undefined>('readonly',(store,set)=>{const request=store.get(DRAFT_KEY);request.onsuccess=()=>set(request.result as PhotoSetDraft|undefined);});
   if(saved&&saved.edits!==undefined&&typeof saved.edits!=='object')throw new Error('invalid edits');
    if(saved&&saved.sources!==undefined&&(!Array.isArray(saved.sources)||saved.sources.length!==saved.photos.length||saved.sources.some(source=>!source||source.source!=='camera-dialog'||!Number.isFinite(Date.parse(source.recordedAt))||typeof source.sha256!=='string'||!/^[a-f0-9]{64}$/.test(source.sha256))))throw new Error('invalid sources');
    if(saved&&(saved.kind!=='photo-set-draft'||typeof saved.revision!=='string'||!Array.isArray(saved.photos)||saved.photos.length<1||saved.photos.length>2||saved.photos.some(file=>!(file instanceof Blob)||!file.size)))throw new Error('invalid');
   draftRef.current=saved||null;setDraft(saved||null);setDraftState('ready');
  }catch{setDraftState('error');}
 };
 useEffect(()=>{void loadDraft();},[]);

 useEffect(()=>{if(!photo){setUrl('');return;}const next=URL.createObjectURL(photo);setUrl(next);return()=>URL.revokeObjectURL(next);},[photo]);
 useEffect(()=>{setAfterReferenceChoice('primary');if(!afterCamera){setAfterReferences({primary:'',context:''});return;}const primary=URL.createObjectURL(afterCamera.photo),context=afterCamera.contextPhoto&&!afterCamera.contextDetached?URL.createObjectURL(afterCamera.contextPhoto):'';setAfterReferences({primary,context});return()=>{URL.revokeObjectURL(primary);if(context)URL.revokeObjectURL(context);};},[afterCamera]);
 useEffect(()=>{if(!photo&&!note&&!action&&!capturedAfter)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[photo,note,action,capturedAfter]);
 const reference=legalForText(note,new Date().toISOString());
 // Do not present legacy, unreviewed, expired, or withdrawn material as guidance.
 const reviewedCards=reference.cards.filter(card=>sourceReviewState(card.sourceReview).code==='reviewed');
 const choose=(file:File,source:PhotoInput['source'],edit?:CameraEditEvidence)=>{if(photo&&!window.confirm('현재 저장 전 사진을 바꿀까요? 입력한 내용은 유지됩니다.'))return;setPhoto(file);setSinglePhotoSource(source);setSinglePhotoEdit(edit);setMessage('');};
 const stagePhoto=async(file:File,edit?:CameraEditEvidence):Promise<boolean>=>{
  if(flight.current||draftState!=='ready'||photo)return false;
  const issue=backupIssue(file);if(issue){setMessage('연속 촬영 사진 '+issue);return false;}
  const old=draftRef.current;if((old?.photos.length||0)>=2){setMessage('현장 전체와 위험 부위 사진을 최대 2장 보관할 수 있습니다.');return false;}
  flight.current=true;setBusy(true);setMessage('');
  try{
   const digest=await hash(file);if(!digest)throw new Error('임시 사진의 비교값을 만들지 못했습니다.');
   const stageEdit=await makePhotoEdit(file,edit);const newSlot=(old?.photos.length||0)===0?'primary:0':'context:0';
   const next:PhotoSetDraft={id:DRAFT_KEY,kind:'photo-set-draft',revision:crypto.randomUUID(),photos:[...(old?.photos||[]),file],sources:!old||old.sources?.length===old.photos.length?[...(old?.sources||[]),photoInput('camera-dialog',digest)]:undefined,edits:stageEdit?{...(old?.edits||{}),[newSlot]:stageEdit}:old?.edits};
   await runStore<void>('readwrite',store=>{const request=store.get(DRAFT_KEY);request.onsuccess=()=>{const current=request.result as PhotoSetDraft|undefined;if((current?.revision||'')!==(old?.revision||'')){request.transaction?.abort();return;}store.put(next);};});
   draftRef.current=next;setDraft(next);setMessage('촬영 사진을 이 기기에 임시 보관했습니다. 점검 내용 저장은 아직 필요합니다.');return true;
  }catch{setMessage('촬영 사진을 보관하지 못했습니다. 사진을 내려받거나 다시 시도하세요.');return false;}
  finally{flight.current=false;setBusy(false);}
 };
 const clearDraft=async()=>{
  const old=draftRef.current;if(!old||flight.current||!window.confirm('이 기기의 임시 촬영 사진을 모두 삭제할까요? 필요한 사진은 먼저 내려받으세요.'))return;
  flight.current=true;setBusy(true);setMessage('');
  try{await runStore<void>('readwrite',store=>{const request=store.get(DRAFT_KEY);request.onsuccess=()=>{if(request.result?.revision!==old.revision){request.transaction?.abort();return;}store.delete(DRAFT_KEY);};});draftRef.current=null;setDraft(null);setMessage('임시 촬영 사진을 삭제했습니다.');}
  catch{setMessage('임시 촬영 사진을 삭제하지 못했습니다. 다른 탭을 확인하고 다시 시도하세요.');}finally{flight.current=false;setBusy(false);}
 };
 const save=async()=>{
  const staged=draftRef.current,primary=staged?.photos[0]||photo;
  if(flight.current||!primary||!note.trim()||draftState!=='ready')return;
  flight.current=true;setBusy(true);setMessage('');
  try{
   const secondary=staged?.photos[1],primaryRole=staged&&secondary&&photoRole==='unspecified'?'overview':photoRole;
   const primaryDigest=await hash(primary),contextDigest=secondary?await hash(secondary):undefined;
   if(staged&&!primaryDigest)throw new Error('기본 사진의 비교값을 만들지 못했습니다. 촬영본은 이 기기에 그대로 보관됩니다.');
   if(secondary&&!contextDigest)throw new Error('추가 사진의 비교값을 만들지 못했습니다. 촬영본은 이 기기에 그대로 보관됩니다.');
   const siteContext=cleanFieldContext(siteContextInput);
   if(siteContext&&!validFieldContext(siteContext))throw new Error('현장정보 항목을 확인해 주세요.');
   const sources:PhotoInputs={};
   if(staged){
    for(const [index,entry] of (staged.sources||[]).entries()){
     if(!['camera-dialog','file-picker'].includes(entry.source)||entry.sha256!==(index===0?primaryDigest:contextDigest))throw new Error('임시 사진 출처와 저장할 파일이 일치하지 않습니다.');
     sources[index===0?'primary:0':'context:0']=entry;
    }
   }else if(singlePhotoSource&&primaryDigest){sources['primary:0']=photoInput(singlePhotoSource,primaryDigest);}
   const initialPhotoEdit=staged?undefined:await makePhotoEdit(primary,singlePhotoEdit);
    const edited:PhotoEdits|undefined=staged?staged.edits:initialPhotoEdit?{'primary:0':initialPhotoEdit}:undefined;
    if(edited&&Object.values(edited).reduce((sum,item)=>sum+(item?.originalFile?.size||0),0)>BACKUP_LIMIT)throw new Error('편집 전 사진 합계가 20MB를 넘습니다. 새 점검을 작성하거나 사진을 별도로 내려받으세요.');
    const record:LocalRecord={photoEdits:edited&&Object.keys(edited).length?edited:undefined,photoInputs:Object.keys(sources).length?sources:undefined,siteContext,photoRole:primaryRole==='unspecified'?undefined:primaryRole,id:crypto.randomUUID(),createdAt:new Date().toISOString(),note:note.trim(),action:action.trim(),photo:primary,sha256:primaryDigest,legalVersion:reference.version,reviewedAt:reference.reviewedAt,...(secondary?{contextPhoto:secondary,contextSha256:contextDigest!,contextRole:primaryRole==='overview'?'detail' as const:'overview' as const}:{})};
   if(record.photoEdits&&!validPhotoEdits(record.photoEdits,record))throw new Error('편집 전 사진과 회전 사진의 연결 정보를 확인하지 못했습니다.');
    await runStore<void>('readwrite',store=>{if(!staged){store.add(record);return;}const request=store.get(DRAFT_KEY);request.onsuccess=()=>{if(request.result?.revision!==staged.revision){request.transaction?.abort();return;}store.add(record);store.delete(DRAFT_KEY);};});
   draftRef.current=null;setDraft(null);setPhoto(null);setSinglePhotoEdit(undefined);setSinglePhotoSource(null);setPhotoRole('unspecified');setSiteContextInput(EMPTY_FIELD_CONTEXT);setNote('');setAction('');setMessage(record.sha256?'기기에 저장했습니다. 서버에는 전송하지 않았습니다.':'기기에 저장했습니다. 파일 해시는 확인하지 못했습니다.');
   await refresh();
  }catch(error){setMessage(error instanceof DOMException&&error.name==='QuotaExceededError'?'저장 공간이 부족합니다. 사진을 내려받거나 공간을 확보한 뒤 다시 시도하세요.':error instanceof Error&&!(error instanceof DOMException)&&error.message?error.message:'기기에 저장하지 못했습니다. 입력과 사진을 유지합니다. 다시 시도하거나 사진을 내려받으세요.');}
  finally{flight.current=false;setBusy(false);}
 };
 const saveFieldContext=async(row:LocalRecord,next:FieldContext|null,reason:string):Promise<boolean>=>{
  if(flight.current||reason.length<5||reason.length>200||reason.trim()!==reason||(next&&!validFieldContext(next)))return false;
  const previous=row.siteContext||null,history=row.siteContextHistory||[];
  if(JSON.stringify(previous)===JSON.stringify(next)){setMessage('현장정보가 변경되지 않았습니다.');return false;}
  if(history.length>=100){setMessage('정정 이력 100건에 도달했습니다. 새 점검을 작성하세요.');return false;}
  flight.current=true;setBusy(true);setMessage('');
  try{
   const entry:SiteContextChange={before:previous,after:next,reason,actor:'device-user',at:new Date().toISOString()};
   const updated=[...history,entry];
   if(!validSiteContextHistory(updated,next))throw new Error('변경 이력을 검증하지 못했습니다.');
   await runStore<void>('readwrite',store=>{const request=store.get(row.id);request.onsuccess=()=>{
    const current=request.result as LocalRecord|undefined;
    if(!current||JSON.stringify(current.siteContext||null)!==JSON.stringify(previous)||JSON.stringify(current.siteContextHistory||[])!==JSON.stringify(history)){request.transaction?.abort();return;}
    store.put({...current,siteContext:next||undefined,siteContextHistory:updated});
   };});
   await refresh();setMessage('현장정보 수정과 이전 내용을 이 기기에 함께 보관했습니다. 백업 파일에도 변경 이력이 포함됩니다.');return true;
  }catch{setMessage('현장정보를 수정하지 못했습니다. 다른 탭에서 변경한 기록이 있는지 확인하고 다시 시도하세요.');return false;}
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
 const savePrimaryPhoto=async(row:LocalRecord,file:File,source:PhotoInput['source'],edit?:CameraEditEvidence):Promise<boolean>=>{
  if(flight.current)return false;
  const issue=backupIssue(file);if(issue){setMessage('기본 사진 '+issue);return false;}
  flight.current=true;setBusy(true);setMessage('');
  try{
   const digest=await hash(file);if(!digest)throw new Error('새 사진의 비교값을 만들지 못했습니다.');
   const history=row.primaryHistory||[];
   const newEdit=await makePhotoEdit(file,edit);
   requirePhotoEditBudget(row.photoEdits,newEdit);
   if(history.length>=5||history.reduce((n,item)=>n+item.photo.size,0)+row.photo.size>BACKUP_LIMIT)throw new Error('이전 기본 사진 보관 한도(5장·합계 20MB)에 도달했습니다. 새 점검으로 기록하세요.');
   if(!row.sha256||await hash(row.photo)!==row.sha256)throw new Error('기존 기본 사진의 무결성을 확인하지 못해 교체하지 않았습니다.');
   await runStore<void>('readwrite',store=>{const request=store.get(row.id);request.onsuccess=()=>{const current=request.result as LocalRecord|undefined;if(!current||current.sha256!==row.sha256||JSON.stringify(current.primaryHistory||[])!==JSON.stringify(history)){request.transaction?.abort();return;}store.put({...current,photo:file,sha256:digest,primaryHistory:[...history,{photo:row.photo,sha256:row.sha256!,replacedAt:new Date().toISOString()}],photoEdits:newEdit?{...(current.photoEdits||{}),['primary:'+(history.length+1)]:newEdit}:current.photoEdits,photoInputs:{...(current.photoInputs||{}),['primary:'+(history.length+1)]:photoInput(source,digest)}});};});
   await refresh();setMessage('기본 사진을 교체하고 이전 사진을 보관했습니다. 조치 전 비교 기준을 확인하세요.');return true;
  }catch(error){setMessage(error instanceof Error&&!(error instanceof DOMException)&&error.message?error.message:'기본 사진을 저장하지 못했습니다. 촬영본을 유지합니다. 다시 확인하세요.');return false;}
  finally{flight.current=false;setBusy(false);}
 };
 const saveContextPhoto=async(row:LocalRecord,file:File,role:'overview'|'detail',source:PhotoInput['source'],edit?:CameraEditEvidence):Promise<boolean>=>{
  if(flight.current)return false;
  const issue=backupIssue(file);if(issue){setMessage('추가 현장 사진 '+issue);return false;}
  if(row.photoRole===role){setMessage('기본 사진과 다른 역할을 선택해 주세요.');return false;}
  flight.current=true;setBusy(true);setMessage('');
  try{
   const digest=await hash(file);if(!digest)throw new Error('사진의 비교값을 만들지 못했습니다.');
   const history=row.contextHistory||[];
   const newEdit=await makePhotoEdit(file,edit);
   requirePhotoEditBudget(row.photoEdits,newEdit);
   if(row.contextPhoto){
    if(row.contextDetached||role!==row.contextRole)throw new Error('사진 연결 상태를 확인한 뒤 다시 시도하세요.');
    if(history.length>=5||history.reduce((n,item)=>n+item.photo.size,0)+row.contextPhoto.size>BACKUP_LIMIT)throw new Error('이전 사진 보관 한도(5장·합계 20MB)에 도달했습니다. 새 점검으로 기록하세요. 기존 사진은 유지됩니다.');
    if(!row.contextSha256||await hash(row.contextPhoto)!==row.contextSha256)throw new Error('이전 사진의 무결성을 확인하지 못해 교체하지 않았습니다.');
   }
   await runStore<void>('readwrite',store=>{const request=store.get(row.id);request.onsuccess=()=>{const current=request.result as LocalRecord|undefined;if(!current||!!current.contextPhoto!==!!row.contextPhoto||current.contextSha256!==row.contextSha256||!!current.contextDetached!==!!row.contextDetached||JSON.stringify(current.contextHistory||[])!==JSON.stringify(history)){request.transaction?.abort();return;}const contextHistory=row.contextPhoto?[...history,{photo:row.contextPhoto,sha256:row.contextSha256!,role:row.contextRole!,replacedAt:new Date().toISOString()}]:history;store.put({...current,contextPhoto:file,contextSha256:digest,contextRole:role,contextHistory:contextHistory.length?contextHistory:undefined,photoEdits:newEdit?{...(current.photoEdits||{}),['context:'+(history.length+(row.contextPhoto?1:0))]:newEdit}:current.photoEdits,photoInputs:{...(current.photoInputs||{}),['context:'+(history.length+(row.contextPhoto?1:0))]:photoInput(source,digest)}});};});
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
 const saveRecheck=async(row:LocalRecord,actionId:string|null,entry:Recheck):Promise<boolean>=>{
  if(flight.current)return false;
  const target=actionId?(row.additionalActions||[]).find(item=>item.id===actionId):undefined;
  if(actionId&&!target){setMessage('해당 조치 항목을 확인하지 못했습니다.');return false;}
  const previous=target?.rechecks||(!actionId?row.rechecks:undefined)||[];
  if(!validRechecks([entry],evidencePhotoHashes(row,target),1)||previous.length>=(actionId?50:100)){setMessage('재점검 입력 내용을 확인해 주세요.');return false;}
  const updated=[...previous,entry];
  if(!validRechecks(updated,evidencePhotoHashes(row,target),actionId?50:100))return false;
  flight.current=true;setBusy(true);setMessage('');
  try{
   await runStore<void>('readwrite',store=>{const request=store.get(row.id);request.onsuccess=()=>{
    const current=request.result as LocalRecord|undefined;
    const currentTarget=actionId?current?.additionalActions?.find(item=>item.id===actionId):undefined;
    const currentEntries=currentTarget?.rechecks||(!actionId?current?.rechecks:undefined)||[];
    const last=currentTarget?.photoSha256||(!actionId?current?.afterSha256:null)||null;
    const expected=target?.photoSha256||(!actionId?row.afterSha256:null)||null;
    const status=(currentTarget?.followup||(!actionId?current?.followup:undefined))?.status||'unrecorded';
    if(!current||(actionId&&!currentTarget)||JSON.stringify(currentEntries)!==JSON.stringify(previous)||last!==expected||status!==entry.followupStatus){request.transaction?.abort();return;}
    const next:LocalRecord=actionId?{...current,additionalActions:(current.additionalActions||[]).map(a=>a.id===actionId?{...a,rechecks:updated}:a)}:{...current,rechecks:updated};
    store.put(next);
   };});
   await refresh();setMessage('지연 사유와 재점검 내용을 이 기기에 기록했습니다. 담당자 통보·최종 완료 처리는 별도로 진행해야 합니다.');return true;
  }catch{setMessage('재점검 이력을 저장하지 못했습니다. 다른 탭에서 변경된 사진·상태를 확인하고 다시 시도하세요.');return false;}
  finally{flight.current=false;setBusy(false);}
 };
 const saveActionPhoto=async(row:LocalRecord,item:AdditionalAction,file:File):Promise<boolean>=>{
  if(flight.current)return false;
  const issue=backupIssue(file);if(issue){setMessage('조치별 '+issue);return false;}
  const other=(row.additionalActions||[]).filter(action=>action.id!==item.id).reduce((n,action)=>n+(action.photo?.size||0),0);
  if(other+file.size>BACKUP_LIMIT){setMessage('조치별 사진의 합계가 20MB를 넘습니다.');return false;}
  if(item.photo&&!window.confirm('기존 조치 사진은 이력에 보관됩니다. 사진을 바꿀까요?'))return false;
  flight.current=true;setBusy(true);setMessage('');
  try{
   const digest=await hash(file);if(!digest)throw new Error('사진의 비교값을 만들지 못했습니다.');
   const oldPhotos=(row.additionalActions||[]).flatMap(action=>action.photoHistory||[]);
   if(item.photo){
    if((item.photoHistory||[]).length>=5||oldPhotos.reduce((n,old)=>n+old.photo.size,0)+item.photo.size>BACKUP_LIMIT)throw new Error('이전 조치별 사진 보관 한도(항목당 5장·점검당 합계 20MB)에 도달했습니다. 새 점검으로 기록하세요.');
    if(!item.photoSha256||await hash(item.photo)!==item.photoSha256)throw new Error('이전 조치별 사진의 무결성을 확인하지 못해 교체하지 않았습니다.');
   }
   await runStore<void>('readwrite',store=>{const request=store.get(row.id);request.onsuccess=()=>{if(!request.result||JSON.stringify(request.result.additionalActions||[])!==JSON.stringify(row.additionalActions||[])){request.transaction?.abort();return;}store.put({...request.result,photoInputs:{...(request.result.photoInputs||{}),['action:'+item.id+':'+((item.photoHistory||[]).length+(item.photo?1:0))]:photoInput('file-picker',digest)},additionalActions:request.result.additionalActions.map((action:AdditionalAction)=>action.id===item.id?{...action,photo:file,photoSha256:digest,photoHistory:item.photo?[...(item.photoHistory||[]),{photo:item.photo,sha256:item.photoSha256!,replacedAt:new Date().toISOString()}]:item.photoHistory}:action)});};});
   await refresh();setMessage('조치별 사진을 이 기기에 저장했습니다.');return true;
  }catch(error){setMessage(error instanceof Error&&!(error instanceof DOMException)&&error.message?error.message:'조치별 사진을 저장하지 못했습니다. 사진을 유지합니다. 다시 시도하세요.');return false;}
  finally{flight.current=false;setBusy(false);}
 };
 const saveAfterPhoto=async(row:LocalRecord,file:File,source:PhotoInput['source']='file-picker',edit?:CameraEditEvidence)=>{
  if(flight.current)return;
  const issue=backupIssue(file);if(issue){setMessage('조치 후 '+issue);return;}
  if(row.afterPhoto&&!window.confirm('기존 조치 후 사진은 이력에 보관됩니다. 사진을 바꿀까요?'))return;
  flight.current=true;setBusy(true);setMessage('');
  try{
   const digest=await hash(file);if(!digest)throw new Error('사진의 비교값을 만들지 못했습니다. 다시 시도하세요.');
   const history=row.afterHistory||[];
   const newEdit=await makePhotoEdit(file,edit);
   requirePhotoEditBudget(row.photoEdits,newEdit);
   if(row.afterPhoto){
    if(history.length>=5||history.reduce((n,item)=>n+item.photo.size,0)+row.afterPhoto.size>BACKUP_LIMIT)throw new Error('이전 조치 후 사진 보관 한도(5장·합계 20MB)에 도달했습니다. 새 점검으로 기록하세요.');
    if(!row.afterSha256||await hash(row.afterPhoto)!==row.afterSha256)throw new Error('이전 조치 후 사진의 무결성을 확인하지 못해 교체하지 않았습니다.');
   }
   await runStore<void>('readwrite',store=>{const request=store.get(row.id);request.onsuccess=()=>{const current=request.result as LocalRecord|undefined;if(!current||!!current.afterPhoto!==!!row.afterPhoto||current.afterSha256!==row.afterSha256||JSON.stringify(current.afterHistory||[])!==JSON.stringify(history)){request.transaction?.abort();return;}const afterHistory=row.afterPhoto?[...history,{photo:row.afterPhoto,sha256:row.afterSha256!,replacedAt:new Date().toISOString()}]:history;store.put({...current,afterPhoto:file,afterSha256:digest,afterHistory:afterHistory.length?afterHistory:undefined,photoEdits:newEdit?{...(current.photoEdits||{}),['after:'+(history.length+(row.afterPhoto?1:0))]:newEdit}:current.photoEdits,photoInputs:{...(current.photoInputs||{}),['after:'+(history.length+(row.afterPhoto?1:0))]:photoInput(source,digest)}});};});
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
 const inspectStorage=async()=>{
  if(storageBusy)return;
  setStorageBusy(true);setStorageMessage('');
  try{setStorageStatus(await readStorageStatus());}
  finally{setStorageBusy(false);}
 };
 const requestStorageRetention=async()=>{
  if(storageBusy)return;
  setStorageBusy(true);setStorageMessage('');
  try{
   if(!navigator.storage||typeof navigator.storage.persist!=='function'){
    setStorageMessage('이 브라우저에서는 저장 유지 요청을 지원하지 않습니다. 백업 파일을 별도 보관해 주세요.');
   }else{
    const granted=await navigator.storage.persist();
    setStorageMessage(granted?'브라우저가 저장 유지 요청을 승인했습니다. 데이터 직접 삭제나 기기 분실까지 막지는 못합니다.':'브라우저가 저장 유지 요청을 승인하지 않았습니다. 백업 파일을 별도로 보관해 주세요.');
   }
  }catch{
   setStorageMessage('저장 유지 요청을 확인하지 못했습니다. 백업 파일을 별도로 보관해 주세요.');
  }finally{
   setStorageStatus(await readStorageStatus());
   setStorageBusy(false);
  }
 };
 const backup=async(row:LocalRecord)=>{if(flight.current)return;flight.current=true;setBusy(true);setMessage('');try{const current=await runStore<LocalRecord|undefined>('readonly',(store,set)=>{const request=store.get(row.id);request.onsuccess=()=>set(request.result as LocalRecord|undefined);});if(!current)throw new Error('해당 점검을 찾을 수 없어 백업하지 않았습니다. 목록을 다시 확인하세요.');download(await packRecord(current),'PSI-backup-'+current.id+'.json');setMessage('백업 파일 내려받기를 요청했습니다. 저장된 파일을 확인하고 안전한 장소에 보관하세요.');}catch(error){setMessage(error instanceof Error?error.message:'백업하지 못했습니다.');}finally{flight.current=false;setBusy(false);}};
 const backupSelected=async()=>{
  if(flight.current||!backupIds.length)return;
  flight.current=true;setBusy(true);setMessage('');
  try{
   if(backupIds.length>BATCH_COUNT_LIMIT)throw new Error('한 번에 최대 10건을 백업할 수 있습니다. 나누어 선택하세요.');
   const latest=await list();
   const found=new Map(latest.map(row=>[row.id,row]));
   const packed:unknown[]=[],issues:string[]=[];
   let bytes=0;
   for(const id of backupIds){
    const selectedRecord=found.get(id);
    if(!selectedRecord){issues.push('선택 기록을 현재 기기에서 찾지 못함');continue;}
    try{
     const blob=await packRecord(selectedRecord);
     const next=await blob.text();
     const nextBytes=new Blob([next]).size;
     if(bytes+nextBytes>BATCH_LIMIT)throw new Error('전체 백업 용량이 50MB를 넘습니다. 기록을 나누어 백업하세요.');
     bytes+=nextBytes;
     packed.push(JSON.parse(next));
    }catch(error){issues.push(selectedRecord.note.slice(0,32)+': '+(error instanceof Error?error.message:'백업 실패'));}
   }
   if(!packed.length)throw new Error('백업 가능한 기록이 없습니다. '+issues.join(' / '));
   const payload=new Blob([JSON.stringify({format:'psi-local-inspection-batch',version:1,exportedAt:new Date().toISOString(),records:packed})],{type:'application/json'});
   if(payload.size>BATCH_LIMIT)throw new Error('전체 백업 파일이 50MB를 넘습니다. 기록을 나누어 선택하세요.');
   download(payload,'PSI-local-inspections-batch-'+new Date().toISOString().slice(0,10)+'.json');
   setMessage('묶음 백업 파일 내려받기 요청: '+packed.length+'건. '+(issues.length?'백업 제외 '+issues.length+'건: '+issues.join(' / '):'제외 기록 없음.')+' 파일 저장을 확인하세요. 암호화되지 않았습니다.');
  }catch(error){setMessage(error instanceof Error?error.message:'묶음 백업을 생성하지 못했습니다.');}
  finally{flight.current=false;setBusy(false);}
 };
 const previewBatch=async(file:File)=>{
  if(flight.current)return;
  flight.current=true;setBusy(true);setBatchPreview(null);setMessage('');
  try{
   if(file.size>BATCH_LIMIT)throw new Error('묶음 백업 파일은 50MB 이하여야 합니다. 파일을 나누어 복원하세요.');
   const data=JSON.parse(await file.text());
   if(data?.format!=='psi-local-inspection-batch'||data.version!==1||!Array.isArray(data.records)||!data.records.length||data.records.length>BATCH_COUNT_LIMIT)throw new Error('지원하지 않거나 손상된 묶음 백업 파일입니다. 최대 10건만 지원합니다.');
   const current=await list(),existing=new Set(current.map(item=>item.id)),seen=new Set<string>();
   const previews:BatchPreviewEntry[]=[];
   for(let i=0;i<data.records.length;i++){
    try{
     const raw=JSON.stringify(data.records[i]);
     if(!raw||new Blob([raw]).size>BATCH_LIMIT)throw new Error('개별 기록 크기가 허용 범위를 초과합니다.');
     const record=await unpackRecord(new File([raw],'batch-entry.json',{type:'application/json'}));
     const summary=record.note.slice(0,90);
     if(existing.has(record.id)||seen.has(record.id)){
      previews.push({index:i,status:'duplicate',summary,message:'같은 기록 ID가 이미 기기 또는 묶음에 있어 덮어쓰지 않습니다.',selected:false});
     }else{
      seen.add(record.id);
      previews.push({index:i,status:'ready',summary,message:'사진 무결성 확인됨 · 복원 가능',record,selected:true});
     }
    }catch(error){previews.push({index:i,status:'invalid',summary:'검증 실패한 기록',message:error instanceof Error?error.message:'기록을 검사하지 못했습니다.',selected:false});}
   }
   setBatchPreview(previews);
   setMessage('묶음 복원 미리보기 완료: 복원 가능 '+previews.filter(item=>item.status==='ready').length+'건 / 중복 '+previews.filter(item=>item.status==='duplicate').length+'건 / 손상 '+previews.filter(item=>item.status==='invalid').length+'건. 실제 복원은 아직 시작하지 않았습니다.');
  }catch(error){setMessage(error instanceof Error?error.message:'묶음 백업을 열지 못했습니다.');}
  finally{flight.current=false;setBusy(false);}
 };
 const restoreSelectedBatch=async()=>{
  if(flight.current||!batchPreview)return;
  const selected=batchPreview.filter(item=>item.status==='ready'&&item.selected&&item.record);
  if(!selected.length)return;
  flight.current=true;setBusy(true);setMessage('');
  let success=0;const errors:string[]=[],restored=new Set<number>();
  try{
   for(const item of selected){
    try{
     await runStore<void>('readwrite',store=>{store.add(item.record!);});
     success++;restored.add(item.index);
    }catch(error){
     const isDuplicate=error instanceof DOMException&&error.name==='ConstraintError';
     errors.push('기록 '+(item.index+1)+': '+(isDuplicate?'동일 ID 존재, 덮어쓰기 방지':'기기 저장 실패 · 저장 공간 또는 다른 탭 확인'));
    }
   }
   setBatchPreview(previous=>previous?.map(item=>restored.has(item.index)?{...item,status:'duplicate' as const,message:'이번 복원에서 저장 완료 · 다시 가져오지 않음',record:undefined,selected:false}:item)||null);
   await refresh();
   setMessage('묶음 복원 결과: '+success+'건 저장 / '+errors.length+'건 실패. '+(errors.length?errors.join(' / ')+' 실패 항목은 원본 백업 파일에서 다시 시도하세요.':'저장된 기록을 확인하세요.')+' 서버에는 전송하지 않았습니다.');
  }finally{flight.current=false;setBusy(false);}
 };
 const restore=async(file:File)=>{if(flight.current)return;flight.current=true;setBusy(true);setMessage('');try{const record=await unpackRecord(file);await runStore<void>('readwrite',store=>{store.add(record);});await refresh();setMessage('백업을 이 기기에 복원했습니다. 서버에는 전송하지 않았습니다.');}catch(error){setMessage(error instanceof DOMException&&error.name==='ConstraintError'?'같은 점검이 이미 이 기기에 있습니다. 기존 기록은 변경하지 않았습니다.':error instanceof Error?error.message:'복원하지 못했습니다.');}finally{flight.current=false;setBusy(false);}};
 return <details id="si-local-inspection" className="si-local-inspection" onToggle={e=>{if(e.currentTarget.open)void refresh();}}>
  <summary>통신 없이 기기에서 직접 점검</summary>
  <section aria-label="기기 직접 점검">
   <h2>사진과 점검 내용을 이 기기에 보관</h2>
   <p>사진을 자동 분석하지 않습니다. 직접 확인한 내용으로 관련 기준을 찾아보는 기능입니다. 서버 업로드와 유료 AI 호출은 하지 않습니다.</p>
   <p>{offlineEntry?'사전에 오프라인 준비를 마친 기기에서는 이 주소로 인터넷 없이 다시 열 수 있습니다.':'인터넷이 끊기기 전 기기 점검 전용 화면에서 오프라인 준비가 필요합니다.'} 브라우저 데이터 삭제나 기기 분실 시 기록이 사라질 수 있으니 별도로 내려받으세요.</p>{!offlineEntry&&<p><a href="/field-local/">오프라인 재실행 준비 화면 열기</a></p>}
   <section aria-label="기기 저장 안정성 확인">
    <h3>기기 저장상태 확인</h3>
    <p>촬영 전후 저장 상태를 확인할 수 있습니다. 조회는 현재 기기의 브라우저에서만 수행하며 서버로 전송하지 않습니다.</p>
    <button type="button" className="si-btn" disabled={storageBusy} onClick={()=>void inspectStorage()}>{storageBusy?'저장상태 확인 중…':'기기 저장공간 확인'}</button>{' '}
    <button type="button" className="si-btn" disabled={storageBusy} onClick={()=>void requestStorageRetention()}>브라우저 저장 유지 요청</button>
    {storageStatus&&<div role="status"><p>{storageStatus.description}</p><p>{storageStatus.retention==='granted'?'저장 유지 요청: 브라우저에서 승인 상태로 확인됨':storageStatus.retention==='not-granted'?'저장 유지 요청: 승인 상태가 아님':'저장 유지 요청: 브라우저에서 상태를 확인할 수 없음'}</p>{storageStatus.kind==='near-limit'&&<p>사용량이 높게 보고됐습니다. 추가 저장에 실패할 수 있으므로 점검 사진과 기록을 먼저 별도 백업하고 파일 저장 여부를 확인해 주세요.</p>}</div>}
    {storageMessage&&<p role="status">{storageMessage}</p>}
    <p>표시 용량은 사이트 전체의 브라우저 추정치이며 실제 기기 여유 공간이나 향후 저장 성공을 보장하지 않습니다. 저장 유지 요청이 승인되어도 브라우저 데이터 직접 삭제·기기 교체·분실 시 기록이 사라질 수 있습니다. 반드시 백업 파일을 내려받아 다른 안전한 장소에서 열리는지 확인하세요.</p>
   </section>
   {photo?<>{url&&<img src={url} alt="기기 점검에 선택한 사진" style={{display:'block',maxWidth:'100%',maxHeight:260,objectFit:'contain'}}/>}<p>{photo.name} · {Math.ceil(photo.size/1024)} KB</p>{backupIssue(photo)&&<p role="alert">저장 전 백업 안내: {backupIssue(photo)} 점검은 기기에 저장할 수 있습니다.</p>}<button type="button" className="si-btn" disabled={busy} onClick={()=>download(photo,photo.name)}>선택 사진 내려받기</button></>:<p>사진을 촬영하거나 선택해 주세요.</p>}
   <div><button type="button" className="si-btn" disabled={busy||!!draft||draftState!=='ready'} onClick={()=>{setSequence(false);setCamera(true);}}>기기 점검 사진 촬영</button> <button type="button" className="si-btn" disabled={busy||!!photo||draftState!=='ready'||(draft?.photos.length||0)>=2} onClick={()=>{setSequence(true);setCamera(true);}}>전체·위험 부위 연속 촬영</button> <label className="si-btn">기기 점검 사진 선택<input aria-label="기기 점검 사진 선택" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||!!draft||draftState!=='ready'} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)choose(file,'file-picker');}}/></label></div>
   {draftState==='loading'&&<p role="status">임시 촬영 사진을 확인하고 있습니다…</p>}
   {draftState==='error'&&<div role="alert"><p>임시 촬영 사진을 확인하지 못했습니다. 저장소를 확인하고 다시 시도하세요.</p><button type="button" className="si-btn" disabled={busy} onClick={()=>void loadDraft()}>임시 사진 다시 확인</button></div>}
   {draft&&<section aria-label="임시 촬영 사진"><p>이 기기에 임시 보관된 촬영 사진 {draft.photos.length}장 · 점검 내용은 아직 저장되지 않았습니다.</p><p>두 장이면 첫 사진의 역할을 선택하세요. 선택하지 않으면 첫 사진은 현장 전체, 둘째는 위험 부위로 저장됩니다.</p>{draft.photos.map((file,i)=><p key={i}>{i+1}. {file.name} <button type="button" className="si-btn" onClick={()=>download(file,file.name)}>임시 사진 내려받기</button></p>)}<button type="button" className="si-btn" disabled={busy} onClick={()=>void clearDraft()}>임시 사진 모두 삭제</button></section>}
   <fieldset aria-label="점검 현장정보" style={{border:'1px solid #8885',borderRadius:8,padding:12}}>
    <legend>점검 현장정보 · 직접 입력</legend>
    <p>알고 있는 정보만 입력하세요. 미확인 항목은 비워 둘 수 있습니다. GPS·주소·촬영 위치는 추정하거나 자동으로 입력하지 않습니다.</p>
    <label>현장명<input aria-label="현장명" value={siteContextInput.site} maxLength={100} disabled={busy} placeholder="예: 용인 현장" onChange={e=>setSiteContextInput(old=>({...old,site:e.target.value}))}/></label>
    <label>동<input aria-label="동" value={siteContextInput.building} maxLength={40} disabled={busy} placeholder="예: 2001동" onChange={e=>setSiteContextInput(old=>({...old,building:e.target.value}))}/></label>
    <label>층<input aria-label="층" value={siteContextInput.level} maxLength={40} disabled={busy} placeholder="예: 지상 16층 / 옥탑" onChange={e=>setSiteContextInput(old=>({...old,level:e.target.value}))}/></label>
    <label>공종<input aria-label="점검 현장 공종" value={siteContextInput.trade} maxLength={60} disabled={busy} placeholder="예: 형틀 / 철근" onChange={e=>setSiteContextInput(old=>({...old,trade:e.target.value}))}/></label>
    <p>저장 시 해당 점검의 기본·추가·조치 후 사진과 후속 이력에 같은 현장정보가 연결됩니다. 기존 점검에는 임의로 채우지 않습니다.</p>
   </fieldset>
   <label>기본 사진 역할<select aria-label="기본 사진 역할" value={photoRole} onChange={e=>setPhotoRole(e.target.value as PhotoRole)}><option value="unspecified">지정하지 않음</option><option value="overview">현장 전체</option><option value="detail">위험 부위</option></select></label>
   <label>직접 확인한 내용<textarea aria-label="직접 확인한 내용" maxLength={4000} value={note} disabled={busy} onChange={e=>setNote(e.target.value)} placeholder="예: 시스템비계 발판 사이가 벌어져 보여 실측이 필요함"/></label>
   <label>현장 조치·확인 계획<textarea aria-label="현장 조치·확인 계획" maxLength={4000} value={action} disabled={busy} onChange={e=>setAction(e.target.value)} placeholder="예: 접근을 통제하고 담당자와 발판 상태 확인"/></label>
   {note.trim()&&<div aria-label="입력 내용으로 찾은 기준"><b>입력 내용으로 찾은 참고 기준</b><p>자료 묶음 버전 {reference.version} · 묶음 기준일 {reference.reviewedAt}. 개별 기준의 현재 적용 여부는 현장에서 확인하세요.</p>{reviewedCards.length?reviewedCards.slice(0,3).map(card=><article key={card.id}><strong>{card.title}</strong><p>{sourceReviewState(card.sourceReview).label}</p>{card.duties.slice(0,2).map(d=><p key={d.url}>{d.label}: {d.summary} <a href={d.url} target="_blank" rel="noreferrer">원문 확인 (인터넷 필요)</a></p>)}<p>{card.scope}</p></article>):<p>현재 입력에 대해 검토 이력과 검토 기한이 확인된 기준을 찾지 못했습니다. 위험이 없다는 뜻이 아니며, 현장 담당자가 적용 기준을 별도로 확인해야 합니다.</p>}</div>}
   <button type="button" className="si-btn si-primary" disabled={busy||(!photo&&!draft)||!note.trim()||draftState!=='ready'} onClick={()=>void save()}>{busy?'기기에 저장 중…':'사진과 내용 기기에 저장'}</button>
   {message&&<p role="status">{message}</p>}
   <h3>{readState==='ready'?`이 브라우저에 보관된 점검 ${rows.length}건`:'이 브라우저의 점검 기록'}</h3>
   {readState==='loading'&&<p role="status">기기 기록을 확인하고 있습니다…</p>}
   {readState==='error'&&<div role="alert"><p>기기 기록을 불러오지 못해 보관 건수를 확인할 수 없습니다. 기록이 없다는 뜻은 아닙니다. 브라우저 저장 설정과 남은 공간을 확인한 뒤 다시 시도하세요.</p><button type="button" className="si-btn" disabled={busy} onClick={()=>void refresh()}>기기 기록 다시 확인</button></div>}
   <p>백업에는 사진과 점검 내용이 모두 들어 있으며 암호화되지 않습니다. 안전한 장소에 보관하세요. 사진은 각각 20MB까지 지원합니다.</p>
   <section aria-label="여러 점검 백업·복원">
    <h4>여러 점검 함께 백업·복원</h4>
    <p>아래 점검의 '묶음 백업에 선택'으로 원하는 기록을 선택하세요. 한 번에 최대 10건, 파일 50MB까지 지원합니다. 암호화되지 않은 백업 파일이므로 접근 권한이 제한된 위치에 보관하세요.</p>
    <button type="button" className="si-btn" disabled={busy||!backupIds.length||backupIds.length>BATCH_COUNT_LIMIT||readState!=='ready'} onClick={()=>void backupSelected()}>선택 기록 묶음 백업 ({backupIds.length}건)</button>
    {backupIds.length>BATCH_COUNT_LIMIT&&<p role="alert">10건을 초과했습니다. 나누어 선택하세요.</p>}
    <label>묶음 백업 파일 미리보기<input type="file" accept="application/json,.json" aria-label="묶음 백업 파일 미리보기" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void previewBatch(file);}}/></label>
    {batchPreview&&<div aria-label="묶음 복원 미리보기"><p>미리보기의 선택 항목만 가져옵니다. 기존 기록은 덮어쓰지 않으며, 일부 항목이 실패해도 성공한 항목은 유지됩니다.</p>
     {batchPreview.map(entry=><div key={entry.index}><label><input type="checkbox" aria-label={`복원 기록 ${entry.index+1} 선택`} checked={entry.selected} disabled={busy||entry.status!=='ready'} onChange={e=>setBatchPreview(previous=>previous?.map(item=>item.index===entry.index?{...item,selected:e.target.checked}:item)||null)}/> {entry.index+1}번 · {entry.summary}</label><p>{entry.status==='ready'?'복원 가능':entry.status==='duplicate'?'중복 건너뜀':'손상 건너뜀'} · {entry.message}</p></div>)}
     <button type="button" className="si-btn" disabled={busy||!batchPreview.some(item=>item.status==='ready'&&item.selected)} onClick={()=>void restoreSelectedBatch()}>선택한 정상 기록 복원</button>
    </div>}
   </section>
   <label className="si-btn">백업 파일 복원<input type="file" accept="application/json,.json" aria-label="백업 파일 복원" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void restore(file);}}/></label>
   {readState==='ready'&&<label>후속 조치 모아보기<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">전체</option><option value="unassigned">담당 미지정</option><option value="no_due">기한 미정</option><option value="overdue">기한 초과</option><option value="review">확인 요청</option></select> · {visibleRows.length}건</label>}
   {readState==='ready'&&visibleRows.map(row=><article key={row.id}><label><input type="checkbox" aria-label="묶음 백업에 선택" checked={backupIds.includes(row.id)} disabled={busy} onChange={e=>setBackupIds(prev=>e.target.checked?[...prev.filter(id=>id!==row.id),row.id]:prev.filter(id=>id!==row.id))}/> 묶음 백업에 선택</label><p>{new Date(row.createdAt).toLocaleString('ko-KR')} · {row.note}</p><p>점검 현장정보: {row.siteContext?fieldContextLabel(row.siteContext):'미기록 (기존 기록 포함)'} · 위치는 점검자 입력이며 자동 검증된 사실이 아닙니다.</p><FieldContextEditor row={row} busy={busy} onSave={saveFieldContext}/><LocalEvidenceAudit inspectionId={row.id} busy={busy}/><p>조치 계획: {row.action||'미작성'} · 파일 무결성 기록: {row.sha256?'SHA-256 기록됨':'미확인'}</p><PrimaryPhotoEditor row={row} busy={busy} onSave={savePrimaryPhoto}/><ContextPhotoEditor row={row} busy={busy} onSave={saveContextPhoto} onOrder={changePhotoOrder} onLink={changeContextLink}/><FollowupEditor row={row} busy={busy} onSave={saveFollowup}/><RecheckEditor row={row} busy={busy} onSave={saveRecheck}/><AdditionalActions row={row} busy={busy} onUpdate={updateAdditionalActions} onPhoto={saveActionPhoto} onRecheck={saveRecheck}/><div><p>조치 후 사진: {row.afterPhoto?row.afterPhoto.name:'아직 없음'}</p><p>이 점검의 조치 후 사진은 위에 표시된 점검 현장정보를 공유합니다. 사진 자체의 촬영 위치를 입증하지는 않습니다.</p><button type="button" className="si-btn" disabled={busy} onClick={()=>{if(capturedAfter&&!window.confirm('아직 저장하지 않은 조치 후 사진을 버리고 다시 촬영할까요?'))return;setCapturedAfter(null);setAfterCamera(row);}}>조치 후 사진 촬영</button> <label className="si-btn">조치 후 사진 {row.afterPhoto?'변경':'연결'}<input aria-label="조치 후 사진 연결" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file&&(!capturedAfter||window.confirm('저장하지 않은 촬영 사진을 버리고 선택한 사진을 연결할까요?')))void saveAfterPhoto(row,file,'file-picker');}}/></label> {row.afterPhoto&&<button type="button" className="si-btn" onClick={()=>download(row.afterPhoto!,row.afterPhoto!.name||'PSI-after.jpg')}>조치 후 사진 내려받기</button>}<p>사진 연결만으로 조치 완료나 안전을 증명하지 않습니다.</p>{!!row.afterHistory?.length&&<details><summary>이전 조치 후 사진 {row.afterHistory.length}장</summary><p>교체 시각은 기기 시각이며 촬영 시각과 다를 수 있습니다.</p>{row.afterHistory.map((entry,i)=><p key={i}>{entry.photo.name} · {new Date(entry.replacedAt).toLocaleString('ko-KR')} <button type="button" className="si-btn" onClick={()=>download(entry.photo,entry.photo.name)}>이전 조치 후 사진 내려받기</button></p>)}</details>}</div><button type="button" className="si-btn" disabled={busy} onClick={()=>void verifyPhoto(row.id)}>사진 변경 확인</button> {checks[row.id]&&<p role="status">{checks[row.id]}</p>} <button type="button" className="si-btn" onClick={()=>download(row.photo,row.photo.name||'PSI-photo.jpg')}>사진 내려받기</button> <button type="button" className="si-btn" onClick={()=>{const {photo:stored,...data}=row;download(new Blob([JSON.stringify({...data,photoName:stored.name,photoType:stored.type},null,2)],{type:'application/json'}),'PSI-local-record-'+row.id+'.json');}}>점검 내용 내려받기</button> <button type="button" className="si-btn" disabled={busy} onClick={()=>void backup(row)}>사진과 기록 함께 백업</button> <button type="button" className="si-btn" disabled={busy} onClick={()=>void remove(row.id)}>이 기기 기록 삭제</button></article>)}
   {capturedAfter&&<div role="status"><p>촬영한 조치 후 사진이 아직 저장되지 않았습니다. 연결할 점검: {capturedAfter.row.note}</p><button type="button" className="si-btn" disabled={busy} onClick={()=>void saveAfterPhoto(capturedAfter.row,capturedAfter.file,'camera-dialog',capturedAfter.edit)}>촬영 사진 연결{busy?' 중…':''}</button> <button type="button" className="si-btn" onClick={()=>download(capturedAfter.file,capturedAfter.file.name||'PSI-after.jpg')}>촬영 사진 내려받기</button> <button type="button" className="si-btn" disabled={busy} onClick={()=>{if(window.confirm('저장하지 않은 조치 후 사진을 버릴까요?'))setCapturedAfter(null);}}>촬영 사진 버리기</button></div>}
   <p>사진 변경 확인은 저장된 사진과 기록된 비교값만 대조합니다. 백업에서 복원한 기록의 비교값은 백업 당시 생성됐을 수 있습니다. 점검 내용의 변경이나 촬영 시각·장소·안전 여부는 증명하지 않습니다.</p>
  </section>
  {camera&&<InspectorCameraDialog onClose={()=>{setCamera(false);setSequence(false);}} onSaveAndContinue={sequence?stagePhoto:undefined} storedCount={draft?.photos.length||0} onUse={(file,edit)=>{if(!sequence){setCamera(false);choose(file,'camera-dialog',edit);return;}void stagePhoto(file,edit).then(ok=>{if(ok){setCamera(false);setSequence(false);}else window.alert('사진을 기기에 보관하지 못했습니다. 사진을 내려받거나 다시 시도하세요.');});}}/>}
  {afterCamera&&<InspectorCameraDialog reference={{url:afterReferenceChoice==='context'?afterReferences.context:afterReferences.primary,label:'조치 전 사진',...(afterReferences.context?{selection:{value:afterReferenceChoice,options:[{value:'primary',label:`기본 사진 · ${afterCamera.photoRole==='overview'?'현장 전체':afterCamera.photoRole==='detail'?'위험 부위':'역할 미지정'}`},{value:'context',label:`추가 사진 · ${afterCamera.contextRole==='overview'?'현장 전체':'위험 부위'}`}],onChange:(value:string)=>setAfterReferenceChoice(value==='context'?'context':'primary')}}:{})}} onClose={()=>setAfterCamera(null)} onUse={(file,edit)=>{setCapturedAfter({row:afterCamera,file,edit});setAfterCamera(null);setMessage('촬영 사진을 확인한 뒤 점검에 연결하세요.');}}/>}
 </details>;
}
