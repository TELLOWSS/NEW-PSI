import React, {useEffect, useRef, useState} from 'react';
import InspectorCameraDialog, {type CameraEditEvidence} from './InspectorCameraDialog';
import {legalForText} from '../../lib/inspector/legal';
import {sourceReviewState} from '../../lib/inspector/sourceReview';
import {FOLLOWUP_STATES, FOLLOWUP_LABELS, validateFollowup, validateAdditionalActions, overdue} from '../../lib/inspector/localFollowup.mjs';
import {prepareFollowupChange,analyzeFollowupChangeTrace,TEMPORARY_CONTROL_REVIEWS} from '../../lib/inspector/localFollowupChangeTrace.mjs';
import {buildLocalRecheckQueue,summarizeLocalRecheckQueue,LOCAL_RECHECK_BUCKETS,LOCAL_RECHECK_LABELS,localCalendarDate} from '../../lib/inspector/localRecheckQueue.mjs';
import {classifyLocalRestoreError,verifyLocalRestoreReadback} from '../../lib/inspector/localRestoreRecovery.mjs';
import {localRecordMayDelete} from '../../lib/inspector/localRecordDeletionGuard.mjs';
import {LOCAL_INPUT_DRAFT_KEY,validLocalInputDraft,localInputDraftFields,localInputDraftHasContent,localInputDraftCanReplace} from '../../lib/inspector/localInputDraft.mjs';
import {SINGLE_PHOTO_DRAFT_KEY,validSinglePhotoDraft,singlePhotoDraftCanReplace,singlePhotoDraftMetadataMatches} from '../../lib/inspector/localSinglePhotoDraft.mjs';
import {packUnfinishedBackup,unpackUnfinishedBackup,previewUnfinishedBackup,verifyUnfinishedRestoreReadback} from '../../lib/inspector/localUnfinishedBackup.mjs';
import {buildLocalRecheckReport,selectLocalRecheckReportTargets,matchesLocalFollowupRecordFilter,formatLocalRecheckCsv,formatLocalRecheckPrintHtml,F10_LOCAL_REPORT_LIMIT} from '../../lib/inspector/localRecheckReport.mjs';
import {buildLocalRecheckProgress} from '../../lib/inspector/localRecheckProgress.mjs';
import {buildLocalHandoffPlan,selectLocalHandoffTargets,formatLocalHandoffMessage,formatLocalHandoffHtml,handoffSourceSnapshot,F10_HANDOFF_MAX_ITEMS} from '../../lib/inspector/localRecheckHandoff.mjs';

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
type LocalInputDraft={id:string;kind:'inspection-input-draft';revision:string;savedAt:string;note:string;action:string;photoRole:PhotoRole;siteContext:FieldContext};
type SinglePhotoDraft={id:string;kind:'single-photo-draft';revision:string;savedAt:string;photo:File;sha256:string;source:PhotoInput['source'];edit:PhotoEdit|null};
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
const list=()=>runStore<LocalRecord[]>('readonly',(store,set)=>{const request=store.getAll();request.onsuccess=()=>set((request.result as LocalRecord[]).filter(item=>item.id!==DRAFT_KEY&&item.id!==LOCAL_INPUT_DRAFT_KEY&&item.id!==SINGLE_PHOTO_DRAFT_KEY).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));});
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function useReportDownloadUrl(reportAssetBlob:Blob|null){
 const [current,setCurrent]=useState<{blob:Blob;url:string}|null>(null);
 useEffect(()=>{
  if(!reportAssetBlob){setCurrent(null);return;}
  const url=URL.createObjectURL(reportAssetBlob);
  setCurrent({blob:reportAssetBlob,url});
  return ()=>URL.revokeObjectURL(url);
 },[reportAssetBlob]);
 return current?.blob===reportAssetBlob?current.url:'';
}

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
function FollowupEditor({row,busy,onSave}:{row:LocalRecord;busy:boolean;onSave:(id:string,value:Followup,expected?:Followup)=>Promise<boolean>}){
 const current=row.followup;
 const [status,setStatus]=useState(current?.status||'pending'),[assignee,setAssignee]=useState(current?.assignee||''),[dueDate,setDueDate]=useState(current?.dueDate||''),[temporaryMeasure,setTemporaryMeasure]=useState(current?.temporaryMeasure||''),[note,setNote]=useState('');
 const [dueReason,setDueReason]=useState(''),[controlReason,setControlReason]=useState('');
 const [controlReview,setControlReview]=useState<keyof typeof TEMPORARY_CONTROL_REVIEWS>('unchecked');
 const [formError,setFormError]=useState('');
 const [editing,setEditing]=useState(false);
 const trace=analyzeFollowupChangeTrace(current);
 const dueChanged=!!current&&dueDate!==current.dueDate;
 const controlChanged=!!current&&temporaryMeasure.trim()!==(current.temporaryMeasure||'');
 const openEditor=()=>{
  if(editing){setEditing(false);return;}
  setStatus(current?.status||'pending');setAssignee(current?.assignee||'');
  setDueDate(current?.dueDate||'');setTemporaryMeasure(current?.temporaryMeasure||'');
  setNote('');setDueReason('');setControlReason('');setControlReview('unchecked');setFormError('');
  setEditing(true);
 };
 const save=async()=>{
  setFormError('');
  try{
   const value=prepareFollowupChange(current,{
    status,assignee,dueDate,temporaryMeasure,note,
    dueChangeReason:dueReason,temporaryChangeReason:controlReason,controlReview,
   }) as Followup;
   if(await onSave(row.id,value,current)){
    setNote('');setDueReason('');setControlReason('');setEditing(false);
   }
  }catch(error){
   setFormError(error instanceof Error?error.message:'후속 조치 입력을 다시 확인해 주세요.');
  }
 };
 return <section aria-label="후속 조치 관리"><p><strong>{current?FOLLOWUP_LABELS[current.status]:'상태 미기록'}</strong> · 담당: {current?.assignee||'미지정'} · 기한: {current?.dueDate||'미정'} {current&&overdue(current)?'· 기한 초과':''}</p>
  <p>{current?.temporaryMeasure?'현재 기록된 임시 안전조치: '+current.temporaryMeasure:'임시 안전조치 미기록'} · 임시 안전조치 기록만으로 위험 제거 또는 최종 완료가 확인된 것은 아닙니다.</p>
  <p>기한 변경 {trace.dueChangeCount}건 · 임시조치 변경·해제 {trace.controlChangeCount}건 · 최근 기록된 확인 수준: {trace.latestControlReview}. 모든 상태는 점검자 기기 입력이며 현장 조치가 자동 검증된 것은 아닙니다.</p>
  {trace.inconsistent&&<p role="alert">현재 후속 조치 상태와 마지막 이력의 내용이 다릅니다. 점검자가 기록을 다시 확인해야 합니다.</p>}
  <p>목표 기한과 재점검의 다음 확인 예정일은 서로 다릅니다. 목표 기한을 바꾸어도 기존 재점검 일정은 자동으로 바뀌지 않습니다.</p>
  <p>기기에만 저장됩니다. 담당자에게 자동 전달되지 않으며, 조치 확인은 사람이 직접 합니다.</p>
  <button type="button" className="si-btn" disabled={busy} onClick={openEditor}>{editing?'닫기':'후속 조치 기록'}</button>
  {editing&&<div><label>조치 상태<select value={status} onChange={e=>setStatus(e.target.value)}>{FOLLOWUP_STATES.map(key=><option key={key} value={key}>{FOLLOWUP_LABELS[key]}</option>)}</select></label>
   <label>담당자<input value={assignee} maxLength={100} onChange={e=>setAssignee(e.target.value)} placeholder="미지정 가능"/></label>
   <label>목표 기한<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
   {dueChanged&&<label>목표 기한 변경 사유 (필수)<textarea aria-label="목표 기한 변경 사유" value={dueReason} maxLength={500} onChange={e=>setDueReason(e.target.value)} placeholder="예: 자재 반입 일정 변경으로 목표 기한 재조정"/></label>}
   <label>임시 안전조치 (최종 완료와 별개)<textarea value={temporaryMeasure} maxLength={1000} onChange={e=>setTemporaryMeasure(e.target.value)} placeholder="예: 위험 구역 출입 통제·표지 설치. 미실시라면 비워 두세요."/></label>
   {controlChanged&&<label>임시조치 변경·해제 사유 (필수)<textarea aria-label="임시조치 변경·해제 사유" value={controlReason} maxLength={500} onChange={e=>setControlReason(e.target.value)} placeholder="예: 출입통제 범위 조정, 통제선 상태 변경"/></label>}
   <label>임시조치 현장 확인 수준 (점검자 직접 입력)
    <select aria-label="임시조치 현장 확인 수준" value={controlReview} onChange={e=>setControlReview(e.target.value as keyof typeof TEMPORARY_CONTROL_REVIEWS)}>
     {(Object.entries(TEMPORARY_CONTROL_REVIEWS) as [keyof typeof TEMPORARY_CONTROL_REVIEWS,string][]).map(([key,label])=><option key={key} value={key}>{label}</option>)}
    </select>
   </label>
   <p>현장 확인을 선택하더라도 기록만으로 통제 효과나 위험 해소를 입증하지 않습니다. 통제가 미확인 상태라면 재점검 또는 접근통제 필요성을 현장에서 검토하세요.</p>
   <label>진행·확인 내용<textarea value={note} maxLength={1600} onChange={e=>setNote(e.target.value)} placeholder="5자 이상: 임시 조치, 진행 상황 또는 확인 내용을 입력"/></label>
   {formError&&<p role="alert">{formError}</p>}
   <button type="button" className="si-btn" disabled={busy||note.trim().length<5||(dueChanged&&dueReason.trim().length<5)||(controlChanged&&controlReason.trim().length<5)} onClick={()=>void save()}>후속 기록 저장</button></div>}
  {!!current?.history.length&&<details><summary>조치 이력 {current.history.length}건</summary>{current.history.map((entry,i)=><p key={i}>{new Date(entry.at).toLocaleString('ko-KR')} · {FOLLOWUP_LABELS[entry.status]} · {entry.note} {entry.temporaryMeasure?'· 당시 임시 안전조치: '+entry.temporaryMeasure:''} · 담당 {entry.assignee||'미지정'} · 기한 {entry.dueDate||'미정'}</p>)}</details>}
  {trace.entries.some(event=>event.dueChanged||event.controlChanged)&&<details><summary>기한·임시통제 변경 전후 확인 ({trace.dueChangeCount+trace.controlChangeCount}건)</summary>
   <p>아래는 기기에 저장된 이력의 비교입니다. 이전 백업 기록은 변경 사유가 없을 수 있습니다.</p>
   {trace.entries.filter(event=>event.dueChanged||event.controlChanged).map((event,i)=><p key={i}>
    {new Date(event.at).toLocaleString('ko-KR')} (기기 시각)
    {event.dueChanged?' · 목표 기한 '+event.beforeDate+' → '+event.afterDate+' · 변경 사유: '+(event.dueReason||'사유 확인 불가 (이전 기록)'):''}
    {event.controlChanged?' · 임시조치 변경: '+(event.beforeControl||'미기록')+' → '+(event.afterControl||'미기록')+' · 변경·해제 사유: '+(event.controlReason||'사유 확인 불가 (이전 기록)'):''}
    {' · 점검자 확인 기록: '+event.controlReview}
   </p>)}
  </details>}
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
 const singleDraftRef=useRef<SinglePhotoDraft|null>(null);
 const [singleDraftState,setSingleDraftState]=useState<'loading'|'ready'|'saving'|'error'|'conflict'>('loading');
 const [singleSavedAt,setSingleSavedAt]=useState('');
 const [singleDraftMessage,setSingleDraftMessage]=useState('');
 const [unfinishedBusy,setUnfinishedBusy]=useState(false);
 const [unfinishedMessage,setUnfinishedMessage]=useState('');
 const [unfinishedPreview,setUnfinishedPreview]=useState<{input:LocalInputDraft|null;single:SinglePhotoDraft|null;sequence:PhotoSetDraft|null;exportedAt:string;integrityLevel:'full'|'legacy-photo-only'}|null>(null);
 const inputDraftRef=useRef<LocalInputDraft|null>(null);
 const inputWriteRef=useRef<Promise<void>>(Promise.resolve());
 const inputTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
 const inputEpochRef=useRef(0);
 const [inputDraftState,setInputDraftState]=useState<'loading'|'ready'|'error'|'conflict'>('loading');
 const [inputSavedAt,setInputSavedAt]=useState('');
 const [rows,setRows]=useState<LocalRecord[]>([]),[camera,setCamera]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [afterCamera,setAfterCamera]=useState<LocalRecord|null>(null),[afterReferences,setAfterReferences]=useState<{primary:string;context:string}>({primary:'',context:''}),[afterReferenceChoice,setAfterReferenceChoice]=useState<'primary'|'context'>('primary');
 const [capturedAfter,setCapturedAfter]=useState<{row:LocalRecord;file:File;edit?:CameraEditEvidence}|null>(null);
 const flight=useRef(false),readSequence=useRef(0);
 const [readState,setReadState]=useState<'loading'|'ready'|'error'>('loading');
 const [checks,setChecks]=useState<Record<string,string>>({});
 const [filter,setFilter]=useState('all');
 const [reportScope,setReportScope]=useState<'visible'|'all'>('visible');
 const [handoffScope,setHandoffScope]=useState<'visible'|'all'>('all');
 const handoffGeneration=useRef(0);
 const [handoffPending,setHandoffPending]=useState(false);
 const [handoffMessage,setHandoffMessage]=useState('');
 const [handoffPrepared,setHandoffPrepared]=useState<{html:Blob;text:string;count:number;at:string}|null>(null);
 const handoffHtmlUrl=useReportDownloadUrl(handoffPrepared?.html||null);
 const [reportIncludeAssignees,setReportIncludeAssignees]=useState(false);
 const [reportIncludeDetails,setReportIncludeDetails]=useState(false);
 const [reportIncludeProgress,setReportIncludeProgress]=useState(false);
 const reportGeneration=useRef(0);
 const [reportBusy,setReportBusy]=useState(false);
 const [reportMessage,setReportMessage]=useState('');
 const [reportFiles,setReportFiles]=useState<{csv:Blob;html:Blob;at:string;count:number}|null>(null);
 const reportCsvUrl=useReportDownloadUrl(reportFiles?.csv||null);
 const reportHtmlUrl=useReportDownloadUrl(reportFiles?.html||null);
 const [backupIds,setBackupIds]=useState<string[]>([]);
 const [batchPreview,setBatchPreview]=useState<BatchPreviewEntry[]|null>(null);
 const [storageStatus,setStorageStatus]=useState<StorageStatus|null>(null);
 const [storageMessage,setStorageMessage]=useState('');
 const [storageBusy,setStorageBusy]=useState(false);
 useEffect(()=>{reportGeneration.current++;setReportFiles(null);setReportMessage('');},
  [rows,filter,reportScope,reportIncludeAssignees,reportIncludeDetails,reportIncludeProgress]);
 useEffect(()=>{
  handoffGeneration.current++;
  setHandoffPrepared(null);setHandoffMessage('');
 },[rows,filter,handoffScope]);
 const recheckQueue=buildLocalRecheckQueue(rows);
 const recheckSummary=summarizeLocalRecheckQueue(recheckQueue) as Record<string, number> & {total:number};
 const recheckFilter=filter.startsWith('recheck:')?filter.slice('recheck:'.length):null;
 const recheckRecordIds=new Set(recheckQueue.filter(item=>item.bucket===recheckFilter).map(item=>item.recordId));
 const visibleRows=rows.filter(row=>recheckFilter
  ?recheckRecordIds.has(row.id)
  :matchesLocalFollowupRecordFilter(row,filter));
 const liveInput={note,action,photoRole,siteContext:siteContextInput};
 const inputPending=inputDraftState==='ready'&&(
  inputDraftRef.current
   ?localInputDraftFields(inputDraftRef.current)!==localInputDraftFields(liveInput)
   :localInputDraftHasContent(liveInput)
 );
 const reportTargetQueue=selectLocalRecheckReportTargets(rows,recheckQueue,filter,reportScope==='visible'?'visible':'all');
 const handoffTargetQueue=selectLocalHandoffTargets(
  selectLocalRecheckReportTargets(rows,recheckQueue,filter,handoffScope));
 const reportScopeLabel=reportScope==='all'?'전체 재점검 대상':
  filter.startsWith('recheck:')?('현재 상태 · '+(LOCAL_RECHECK_LABELS[recheckFilter]||'미확인')):
  filter==='all'?'현재 화면 · 전체':
  filter==='unassigned'?'현재 화면 · 담당 미지정':
  filter==='no_due'?'현재 화면 · 기한 미정':
  filter==='overdue'?'현재 화면 · 조치 기한 초과':'현재 화면 · 완료 확인 요청';
 const prepareHandoff=async()=>{
  if(handoffPending||busy||readState!=='ready')return;
  setHandoffPending(true);setHandoffPrepared(null);setHandoffMessage('');
  const generation=handoffGeneration.current;
  try{
   const now=new Date();
   const beforeSnapshot=handoffSourceSnapshot(rows);
   const first=buildLocalHandoffPlan(rows,now,filter,handoffScope);
   // A different tab may update an action after this component rendered.
   // Verify the actual persisted records before creating copyable material.
   const fresh=await list();
   if(beforeSnapshot!==handoffSourceSnapshot(fresh))
    throw new Error('다른 탭에서 점검 기록이 변경됐습니다. 기기 기록 다시 조회 후 인계 내용을 준비하세요.');
   const confirmed=buildLocalHandoffPlan(fresh,now,filter,handoffScope);
   if(JSON.stringify(first)!==JSON.stringify(confirmed)||generation!==handoffGeneration.current)
    throw new Error('인계 대상 또는 화면 선택이 변경됐습니다. 새로 조회한 뒤 다시 준비하세요.');
   const text=formatLocalHandoffMessage(confirmed);
   const html=formatLocalHandoffHtml(confirmed);
   if(text.length>95000||html.length>150000)
    throw new Error('인계 문서가 너무 큽니다. 상태별 필터로 나누어 준비하세요.');
   if(generation!==handoffGeneration.current)
    throw new Error('인계 목록이 바뀌어 이전 문서를 사용하지 않았습니다. 다시 준비하세요.');
   setHandoffPrepared({
    html:new Blob([html],{type:'text/html;charset=utf-8'}),
    text,count:confirmed.entries.length,at:confirmed.localDate,
   });
   setHandoffMessage('기기 원본 기록과 인계 목록을 대조했습니다. 아래 인계 문구는 직접 검토·복사하고, 담당자 전달은 별도로 진행하세요.');
  }catch(error){
   setHandoffMessage(error instanceof Error?error.message:'인계 내용을 준비하지 못했습니다. 기록을 다시 확인하세요.');
  }finally{setHandoffPending(false);}
 };
 const copyHandoff=async()=>{
  if(!handoffPrepared)return;
  try{
   if(!navigator.clipboard?.writeText)throw new Error('클립보드를 사용할 수 없습니다.');
   await navigator.clipboard.writeText(handoffPrepared.text);
   setHandoffMessage('인계 문구를 기기 클립보드에 복사했습니다. 담당자에게 전송하거나 확인받은 것은 아닙니다.');
  }catch{
   setHandoffMessage('자동 복사가 제한된 브라우저입니다. 아래 인계 문구를 길게 눌러 직접 복사하세요.');
  }
 };
 const prepareRecheckReport=async()=>{
  if(reportBusy||busy||readState!=='ready')return;
  setReportBusy(true);setReportFiles(null);setReportMessage('');
  const reportToken=reportGeneration.current;
  try{
   const generatedAt=new Date();
   const oldQueue=buildLocalRecheckQueue(rows,generatedAt);
   const oldSelection=selectLocalRecheckReportTargets(rows,oldQueue,filter,reportScope,generatedAt);
   const options={generatedAt,scopeLabel:reportScopeLabel,
    includeAssignees:reportIncludeAssignees,includeDetails:reportIncludeDetails,includeProgress:reportIncludeProgress};
   const oldReport=buildLocalRecheckReport(oldSelection,rows,options);
   // Re-open the actual IndexedDB immediately before building the export.
   // Never export a stale UI snapshot after another tab edited the record.
   const freshRows=await list();
   const freshQueue=buildLocalRecheckQueue(freshRows,generatedAt);
   const freshSelection=selectLocalRecheckReportTargets(freshRows,freshQueue,filter,reportScope,generatedAt);
   const verifiedReport=buildLocalRecheckReport(freshSelection,freshRows,options);
   if(reportToken!==reportGeneration.current||
      JSON.stringify(oldReport.entries)!==JSON.stringify(verifiedReport.entries)||
      JSON.stringify(oldReport.summary)!==JSON.stringify(verifiedReport.summary)||
      JSON.stringify(oldReport.progress)!==JSON.stringify(verifiedReport.progress))
    throw new Error('점검 기록이 다른 탭에서 변경됐습니다. 기기 기록 다시 조회를 눌러 확인한 후 보고서를 준비하세요.');
   const csv=formatLocalRecheckCsv(verifiedReport);
   const html=formatLocalRecheckPrintHtml(verifiedReport);
   if(csv.length>2*1024*1024||html.length>3*1024*1024)
    throw new Error('보고서 크기가 너무 큽니다. 상태 필터로 대상을 나누어 저장하세요.');
   if(reportToken!==reportGeneration.current)
    throw new Error('보고서 선택이 변경됐습니다. 기기 기록을 다시 확인해 주세요.');
   setReportFiles({
    csv:new Blob([csv],{type:'text/csv;charset=utf-8'}),
    html:new Blob([html],{type:'text/html;charset=utf-8'}),
    at:verifiedReport.localDate,count:verifiedReport.entries.length,
   });
   setReportMessage('실제 기기 저장 기록을 다시 확인했습니다. 아래 파일 링크를 눌러 저장하세요. 실제 저장 완료 여부는 기기에서 확인해야 합니다.');
  }catch(error){
   setReportMessage(error instanceof Error?error.message:'기기 보고서를 준비하지 못했습니다. 기록을 다시 확인하세요.');
  }finally{setReportBusy(false);}
 };
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

 // Single picked/captured photo uses an independent checkpoint.
 // A real hash comparison is required before restoring a saved file.
 const loadSinglePhoto=async()=>{
  if(flight.current)return;
  setSingleDraftState('loading');setSingleDraftMessage('');
  try{
   const found=await runStore<SinglePhotoDraft|undefined>('readonly',(store,set)=>{
    const req=store.get(SINGLE_PHOTO_DRAFT_KEY);
    req.onsuccess=()=>set(req.result as SinglePhotoDraft|undefined);
   });
   if(found){
    if(!validSinglePhotoDraft(found)||await hash(found.photo)!==found.sha256
     ||(found.edit&&await hash(found.edit.originalFile)!==found.edit.originalSha256))
     throw new Error('기기에 임시 보관된 단건 사진의 파일 비교값이 일치하지 않습니다.');
    singleDraftRef.current=found;
    setPhoto(found.photo);setSinglePhotoSource(found.source);
    setSinglePhotoEdit(undefined);setSingleSavedAt(found.savedAt);
   }else{
    singleDraftRef.current=null;setSingleSavedAt('');
    setPhoto(null);setSinglePhotoSource(null);setSinglePhotoEdit(undefined);
   }
   setSingleDraftState('ready');
  }catch(error){
   setSingleDraftState('error');
   setSingleDraftMessage(error instanceof Error?error.message:'단건 사진을 복원하지 못했습니다.');
  }
 };
 useEffect(()=>{void loadSinglePhoto();},[]);


 const loadInputDraft=async()=>{
  setInputDraftState('loading');
  try{
   const saved=await runStore<LocalInputDraft|undefined>('readonly',(store,set)=>{
    const req=store.get(LOCAL_INPUT_DRAFT_KEY);
    req.onsuccess=()=>set(req.result as LocalInputDraft|undefined);
   });
   if(saved&&!validLocalInputDraft(saved))throw new Error('invalid local input draft');
   inputDraftRef.current=saved||null;setNote(saved?.note||'');setAction(saved?.action||'');
   setPhotoRole(saved?.photoRole||'unspecified');setSiteContextInput(saved?.siteContext||EMPTY_FIELD_CONTEXT);
   setInputSavedAt(saved?.savedAt||'');setInputDraftState('ready');
  }catch{setInputDraftState('error');}
 };
 useEffect(()=>{void loadInputDraft();return()=>{inputEpochRef.current++;if(inputTimerRef.current)clearTimeout(inputTimerRef.current);};},[]);
 useEffect(()=>{
  if(inputDraftState!=='ready')return;
  const content={note,action,photoRole,siteContext:siteContextInput};
  if(inputDraftRef.current&&localInputDraftFields(inputDraftRef.current)===localInputDraftFields(content))return;
  if(!inputDraftRef.current&&!localInputDraftHasContent(content))return;
  const epoch=++inputEpochRef.current;
  const timer=setTimeout(()=>{
   const task=inputWriteRef.current.then(async()=>{
    if(epoch!==inputEpochRef.current)return;
    const expected=inputDraftRef.current,empty=!localInputDraftHasContent(content);
    const next:LocalInputDraft={id:LOCAL_INPUT_DRAFT_KEY,kind:'inspection-input-draft',revision:crypto.randomUUID(),savedAt:new Date().toISOString(),...content};
    let conflict=false;
    try{
     await runStore<void>('readwrite',store=>{
      const req=store.get(LOCAL_INPUT_DRAFT_KEY);
      req.onsuccess=()=>{
       try{
        if(!localInputDraftCanReplace(req.result,expected)){conflict=true;req.transaction?.abort();return;}
        if(empty)store.delete(LOCAL_INPUT_DRAFT_KEY);else store.put(next);
       }catch{try{req.transaction?.abort();}catch{/* already closed */}}
      };
     });
    }catch{if(epoch===inputEpochRef.current)setInputDraftState(conflict?'conflict':'error');return;}
    inputDraftRef.current=empty?null:next;
    if(epoch===inputEpochRef.current)setInputSavedAt(empty?'':next.savedAt);
   });
   inputWriteRef.current=task.catch(()=>{});
  },650);
  inputTimerRef.current=timer;
  return()=>clearTimeout(timer);
 },[note,action,photoRole,siteContextInput,inputDraftState]);


 useEffect(()=>{if(!photo){setUrl('');return;}const next=URL.createObjectURL(photo);setUrl(next);return()=>URL.revokeObjectURL(next);},[photo]);
 useEffect(()=>{setAfterReferenceChoice('primary');if(!afterCamera){setAfterReferences({primary:'',context:''});return;}const primary=URL.createObjectURL(afterCamera.photo),context=afterCamera.contextPhoto&&!afterCamera.contextDetached?URL.createObjectURL(afterCamera.contextPhoto):'';setAfterReferences({primary,context});return()=>{URL.revokeObjectURL(primary);if(context)URL.revokeObjectURL(context);};},[afterCamera]);
 useEffect(()=>{if(!photo&&!note&&!action&&!capturedAfter)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[photo,note,action,capturedAfter]);
 const reference=legalForText(note,new Date().toISOString());
 // Do not present legacy, unreviewed, expired, or withdrawn material as guidance.
 const reviewedCards=reference.cards.filter(card=>sourceReviewState(card.sourceReview).code==='reviewed');
 const choose=async(file:File,source:PhotoInput['source'],edit?:CameraEditEvidence)=>{
  if(flight.current||draftRef.current||singleDraftState==='loading'||singleDraftState==='saving')return;
  if(photo&&!window.confirm('현재 저장 전 사진을 바꿀까요? 입력한 내용은 유지됩니다.'))return;
  // Keep the chosen File available for explicit manual download on failures.
  setPhoto(file);setSinglePhotoSource(source);setSinglePhotoEdit(edit);
  setSingleDraftState('saving');setSingleDraftMessage('');
  flight.current=true;setBusy(true);setMessage('');
  let conflict=false;
  try{
   const digest=await hash(file);
   if(!digest)throw new Error('선택 사진의 SHA-256 비교값을 계산하지 못했습니다.');
   const savedEdit=await makePhotoEdit(file,edit);
   const expected=singleDraftRef.current;
   const next:SinglePhotoDraft={id:SINGLE_PHOTO_DRAFT_KEY,kind:'single-photo-draft',
    revision:crypto.randomUUID(),savedAt:new Date().toISOString(),photo:file,sha256:digest,
    source,edit:savedEdit||null};
   if(!validSinglePhotoDraft(next))throw new Error('사진 형식·크기 또는 회전정보를 확인하지 못해 임시저장을 중단했습니다.');
   await runStore<void>('readwrite',store=>{
    const req=store.get(SINGLE_PHOTO_DRAFT_KEY);
    req.onsuccess=()=>{
     try{
      if(!singlePhotoDraftCanReplace(req.result,expected)){conflict=true;req.transaction?.abort();return;}
      store.put(next);
     }catch{try{req.transaction?.abort();}catch{/* already closed */}}
    };
   });
   const stored=await runStore<SinglePhotoDraft|undefined>('readonly',(store,set)=>{
    const req=store.get(SINGLE_PHOTO_DRAFT_KEY);
    req.onsuccess=()=>set(req.result as SinglePhotoDraft|undefined);
   });
   if(!singlePhotoDraftMetadataMatches(next,stored)||await hash(stored!.photo)!==digest)
    throw new Error('임시저장된 사진의 내용을 다시 확인할 수 없습니다.');
   singleDraftRef.current=next;setSingleSavedAt(next.savedAt);
   setSingleDraftState('ready');
   setSingleDraftMessage('사진을 이 브라우저에 임시 보관하고 다시 읽어 확인했습니다. 점검 기록 저장은 별도로 필요합니다.');
  }catch(error){
   setSingleDraftState(conflict?'conflict':'error');
   setSingleDraftMessage(conflict
    ?'다른 탭에서 단건 임시사진을 변경하여 덮어쓰지 않았습니다. 현재 사진을 별도로 내려받아 보관하세요.'
    :'사진을 임시저장하지 못했습니다. '+(error instanceof Error&&error.message?'브라우저 저장 오류: '+error.message+' ':'')+'선택 사진은 이 화면에 유지됩니다. 별도로 내려받거나 임시저장을 다시 시도하세요.');
  }finally{flight.current=false;setBusy(false);}
 };
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
 const clearSingleDraft=async()=>{
  const old=singleDraftRef.current;
  if(flight.current||!old||singleDraftState!=='ready'||!window.confirm('단건 임시사진을 삭제할까요? 이 사진이 필요한 경우 먼저 별도로 내려받아 보관하세요. 연속 촬영 사진과 점검 입력은 삭제하지 않습니다.'))return;
  flight.current=true;setBusy(true);setMessage('');
  let changed=false;
  try{
   await runStore<void>('readwrite',store=>{
    const req=store.get(SINGLE_PHOTO_DRAFT_KEY);
    req.onsuccess=()=>{
     try{
      if(!singlePhotoDraftCanReplace(req.result,old)){changed=true;req.transaction?.abort();return;}
      store.delete(SINGLE_PHOTO_DRAFT_KEY);
     }catch{try{req.transaction?.abort();}catch{/* already closed */}}
    };
   });
   singleDraftRef.current=null;setPhoto(null);setSinglePhotoEdit(undefined);
   setSinglePhotoSource(null);setSingleSavedAt('');setSingleDraftMessage('');
   setMessage('단건 임시사진만 삭제했습니다. 연속 촬영 사진과 점검 입력은 유지했습니다.');
  }catch{
   setSingleDraftState(changed?'conflict':'error');
   setSingleDraftMessage(changed
    ?'다른 탭에서 단건 임시사진이 변경됐습니다. 삭제하지 않았습니다. 최신 사진을 확인하세요.'
    :'단건 임시사진을 삭제하지 못했습니다. 사진을 보관한 후 다시 확인하세요.');
  }finally{flight.current=false;setBusy(false);}
 };
 const save=async()=>{
  const staged=draftRef.current,primary=staged?.photos[0]||photo;
  if(staged&&photo){setMessage('단건 사진과 연속 촬영 사진이 동시에 임시 보관돼 있습니다. 필요한 사진을 백업한 뒤 한쪽을 명시적으로 선택해 주세요. 어느 사진도 자동 삭제하지 않았습니다.');return;}
  if(flight.current||!primary||!note.trim()||draftState!=='ready'||inputDraftState!=='ready'||singleDraftState!=='ready')return;
  inputEpochRef.current++;
  if(inputTimerRef.current)clearTimeout(inputTimerRef.current);
  flight.current=true;setBusy(true);setMessage('');
  let inputConflict=false,singleConflict=false,saveQuotaFailure=false;
  const abortFailedWrite=(error:unknown,tx:IDBTransaction|null|undefined)=>{
   if(error instanceof DOMException&&error.name==='QuotaExceededError')saveQuotaFailure=true;
   try{tx?.abort();}catch{/* Already aborted; never leak a second exception. */}
  };
  try{
   await inputWriteRef.current;
   // Immediate final-save clicks may arrive before the 650ms auto-checkpoint.
   // Commit the current form first, so aborting the final record transaction
   // (quota, crash, tab close) cannot discard the most recent user text.
   const fields={note,action,photoRole,siteContext:siteContextInput};
   const existingInput=inputDraftRef.current;
   if(localInputDraftHasContent(fields)&&
       (!existingInput||localInputDraftFields(existingInput)!==localInputDraftFields(fields))){
    const nextInput:LocalInputDraft={id:LOCAL_INPUT_DRAFT_KEY,kind:'inspection-input-draft',
     revision:crypto.randomUUID(),savedAt:new Date().toISOString(),...fields};
    await runStore<void>('readwrite',store=>{
     const req=store.get(LOCAL_INPUT_DRAFT_KEY);
     req.onsuccess=()=>{
      try{
       if(!localInputDraftCanReplace(req.result,existingInput)){inputConflict=true;req.transaction?.abort();return;}
       store.put(nextInput);
      }catch(error){abortFailedWrite(error,req.transaction);}
     };
    });
    inputDraftRef.current=nextInput;setInputSavedAt(nextInput.savedAt);
   }
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
   const initialPhotoEdit=staged?undefined:singleDraftRef.current?.edit||await makePhotoEdit(primary,singlePhotoEdit);
    const edited:PhotoEdits|undefined=staged?staged.edits:initialPhotoEdit?{'primary:0':initialPhotoEdit}:undefined;
    if(edited&&Object.values(edited).reduce((sum,item)=>sum+(item?.originalFile?.size||0),0)>BACKUP_LIMIT)throw new Error('편집 전 사진 합계가 20MB를 넘습니다. 새 점검을 작성하거나 사진을 별도로 내려받으세요.');
    const record:LocalRecord={photoEdits:edited&&Object.keys(edited).length?edited:undefined,photoInputs:Object.keys(sources).length?sources:undefined,siteContext,photoRole:primaryRole==='unspecified'?undefined:primaryRole,id:crypto.randomUUID(),createdAt:new Date().toISOString(),note:note.trim(),action:action.trim(),photo:primary,sha256:primaryDigest,legalVersion:reference.version,reviewedAt:reference.reviewedAt,...(secondary?{contextPhoto:secondary,contextSha256:contextDigest!,contextRole:primaryRole==='overview'?'detail' as const:'overview' as const}:{})};
   if(record.photoEdits&&!validPhotoEdits(record.photoEdits,record))throw new Error('편집 전 사진과 회전 사진의 연결 정보를 확인하지 못했습니다.');
    const expectedInput=inputDraftRef.current;
    await runStore<void>('readwrite',store=>{
     const req=store.get(LOCAL_INPUT_DRAFT_KEY);
     req.onsuccess=()=>{
      try{
       if(!localInputDraftCanReplace(req.result,expectedInput)){inputConflict=true;req.transaction?.abort();return;}
       if(!staged){
        const photoReq=store.get(SINGLE_PHOTO_DRAFT_KEY);
        photoReq.onsuccess=()=>{
         try{
          if(!singlePhotoDraftCanReplace(photoReq.result,singleDraftRef.current)){
           singleConflict=true;photoReq.transaction?.abort();return;
          }
          store.add(record);
          if(singleDraftRef.current)store.delete(SINGLE_PHOTO_DRAFT_KEY);
          if(expectedInput)store.delete(LOCAL_INPUT_DRAFT_KEY);
         }catch(error){abortFailedWrite(error,photoReq.transaction);}
        };
        return;
       }
       const photoReq=store.get(DRAFT_KEY);
       photoReq.onsuccess=()=>{
        try{
         if(photoReq.result?.revision!==staged.revision){photoReq.transaction?.abort();return;}
         store.add(record);store.delete(DRAFT_KEY);
         if(expectedInput)store.delete(LOCAL_INPUT_DRAFT_KEY);
        }catch(error){abortFailedWrite(error,photoReq.transaction);}
       };
      }catch(error){abortFailedWrite(error,req.transaction);}
     };
    });
    inputDraftRef.current=null;setInputSavedAt('');singleDraftRef.current=null;setSingleSavedAt('');
   draftRef.current=null;setDraft(null);setPhoto(null);setSinglePhotoEdit(undefined);setSinglePhotoSource(null);setSingleDraftState('ready');setSingleDraftMessage('');setPhotoRole('unspecified');setSiteContextInput(EMPTY_FIELD_CONTEXT);setNote('');setAction('');setMessage(record.sha256?'기기에 저장했습니다. 서버에는 전송하지 않았습니다.':'기기에 저장했습니다. 파일 해시는 확인하지 못했습니다.');
   await refresh();
  }catch(error){
   setMessage(singleConflict
    ?'다른 탭에서 임시사진이 변경되어 현재 점검을 저장하지 않았습니다. 사진과 입력을 보존하고 최신 사진을 확인하세요.'
    :inputConflict
    ?'다른 탭의 임시 기록이 변경되어 현재 점검을 저장하지 않았습니다. 입력과 사진은 유지됩니다.'
    :saveQuotaFailure||(error instanceof DOMException&&error.name==='QuotaExceededError')
     ?'저장 공간이 부족합니다. 사진과 입력을 보존한 뒤 저장공간을 확인하고 다시 시도하세요.'
     :error instanceof Error&&!(error instanceof DOMException)&&error.message
      ?error.message
      :'기기 저장이 중단됐습니다. 입력과 사진을 유지합니다. 다시 시도하세요.');
   if(inputConflict)setInputDraftState('conflict');
   if(singleConflict)setSingleDraftState('conflict');
  }
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
 const saveFollowup=async(id:string,value:Followup,expected?:Followup):Promise<boolean>=>{
  if(flight.current||!validateFollowup(value))return false;
  flight.current=true;setBusy(true);setMessage('');
  try{
   await runStore<void>('readwrite',store=>{const request=store.get(id);request.onsuccess=()=>{if(!request.result||JSON.stringify(request.result.followup||null)!==JSON.stringify(expected||null)){request.transaction?.abort();return;}store.put({...request.result,followup:value});};});
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
 const remove=async(displayed:LocalRecord)=>{
  if(busy||flight.current||!window.confirm('이 기기에 보관된 점검과 사진을 삭제할까요? 필요한 자료는 먼저 내려받으세요.'))return;
  flight.current=true;setBusy(true);setMessage('');
  let recordChanged=false;
  try{
   // Verify against persisted state within the SAME write transaction.
   // No read-before-write race, and never delete by ID alone.
   await runStore<void>('readwrite',store=>{
    const request=store.get(displayed.id);
    request.onsuccess=()=>{
     if(!localRecordMayDelete(displayed,request.result)){
      recordChanged=true;
      request.transaction?.abort();
      return;
     }
     store.delete(displayed.id);
    };
   });
   await refresh();
   setMessage('선택한 기기 기록을 삭제했습니다.');
  }catch{
   await refresh();
   setMessage(recordChanged
    ?'다른 탭에서 점검이 변경되었거나 기록을 찾지 못해 삭제하지 않았습니다. 최신 기록을 확인하고 필요한 자료를 백업한 뒤 다시 선택하세요.'
    :'기록을 삭제하지 못했습니다. 기기 기록을 다시 확인하세요.');
  }finally{flight.current=false;setBusy(false);}
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
 // F08-41: emergency backup works even if the recent form/photo checkpoint
 // failed to persist. The currently visible input/photo is the backup source.
 // No API, cloud upload, background sync, or deletion happens here.
 const backupUnfinished=async()=>{
  if(flight.current||busy||unfinishedBusy)return;
  setUnfinishedBusy(true);setUnfinishedMessage('');
  try{
   const fields={note,action,photoRole,siteContext:siteContextInput};
   const input:LocalInputDraft|null=localInputDraftHasContent(fields)
    ?{id:LOCAL_INPUT_DRAFT_KEY,kind:'inspection-input-draft',revision:crypto.randomUUID(),savedAt:new Date().toISOString(),...fields}
    :null;
   let single:SinglePhotoDraft|null=null;
   if(photo){
    const checksum=await hash(photo);
    if(!checksum)throw new Error('선택 사진의 비교값을 확인하지 못했습니다. 사진을 별도로 내려받으세요.');
    single={id:SINGLE_PHOTO_DRAFT_KEY,kind:'single-photo-draft',revision:crypto.randomUUID(),
     savedAt:new Date().toISOString(),photo,sha256:checksum,
     source:singlePhotoSource||'file-picker',
     edit:singleDraftRef.current?.photo===photo?singleDraftRef.current.edit||null:
       await makePhotoEdit(photo,singlePhotoEdit)||null};
   }else if(singleDraftRef.current)single=singleDraftRef.current;
   const sequence=draftRef.current||null;
   const exported=await packUnfinishedBackup({input,single,sequence});
   download(exported,'PSI-unfinished-recovery-'+new Date().toISOString().slice(0,10)+'.json');
   setUnfinishedMessage('작성 중 자료 통합 백업 파일 내려받기를 요청했습니다. 실제 저장된 JSON 파일을 확인하고 기기 밖의 안전한 장소에 보관하세요. 파일은 암호화되지 않았습니다. 작성 중 기록을 삭제하거나 완료 처리하지 않았습니다.');
  }catch(error){
   setUnfinishedMessage(error instanceof Error?error.message:'통합 백업을 만들지 못했습니다. 사진과 입력을 각각 별도 보관해 주세요.');
  }finally{setUnfinishedBusy(false);}
 };
 const previewUnfinished=async(file:File)=>{
  if(flight.current||busy||unfinishedBusy)return;
  setUnfinishedBusy(true);setUnfinishedPreview(null);setUnfinishedMessage('');
  try{
   const data=await unpackUnfinishedBackup(file);
   const info=previewUnfinishedBackup(data);
   setUnfinishedPreview(data);
   setUnfinishedMessage('백업 검증 완료: 입력 '+(info.hasInput?'있음':'없음')+
    ' · 단건 사진 '+info.singlePhotos+'장 · 연속 사진 '+info.sequencePhotos+
    '장. '+info.integrityLabel+'. 아직 복원하지 않았습니다. 현재 작성 중인 자료가 있으면 덮어쓰지 않습니다.');
  }catch(error){
   setUnfinishedMessage(error instanceof Error?error.message:'백업을 검증하지 못했습니다. 기존 기록은 변경하지 않았습니다.');
  }finally{setUnfinishedBusy(false);}
 };
 const restoreUnfinished=async()=>{
  const data=unfinishedPreview;
  if(!data||flight.current||busy||unfinishedBusy)return;
  if(photo||draft||note.trim()||action.trim()||localInputDraftHasContent({note,action,photoRole,siteContext:siteContextInput})){
   setUnfinishedMessage('현재 화면에 작성 중인 자료가 있어 복원을 중단했습니다. 먼저 통합 백업 파일을 보관하고 새 빈 화면에서 진행하세요.');
   return;
  }
  if(!window.confirm('현재 기기의 임시기록 3종이 모두 비어 있을 때만 한 번에 복원합니다. 기존 완료 점검은 변경하지 않습니다. 복원할까요?'))return;
  flight.current=true;setBusy(true);setUnfinishedBusy(true);setUnfinishedMessage('');
  let conflict=false;
  try{
   await runStore<void>('readwrite',store=>{
    const keys=[LOCAL_INPUT_DRAFT_KEY,SINGLE_PHOTO_DRAFT_KEY,DRAFT_KEY];
    const requests=keys.map(key=>store.get(key));
    let remaining=requests.length;
    for(const request of requests)request.onsuccess=()=>{
     if(--remaining!==0)return;
     try{
      if(requests.some(item=>item.result!==undefined)){conflict=true;request.transaction?.abort();return;}
      if(data.input)store.add(data.input);
      if(data.single)store.add(data.single);
      if(data.sequence)store.add(data.sequence);
     }catch{try{request.transaction?.abort();}catch{/*already aborted*/}}
    };
   });
   // Postflight: never say restored if the persisted revisions differ.
   const restored=await runStore<Record<string,unknown>>('readonly',(store,set)=>{
    const keys=[LOCAL_INPUT_DRAFT_KEY,SINGLE_PHOTO_DRAFT_KEY,DRAFT_KEY];
    const requests=keys.map(key=>store.get(key));
    let remaining=requests.length;
    for(const request of requests)request.onsuccess=()=>{
     if(--remaining===0)set(Object.fromEntries(keys.map((key,i)=>[key,requests[i].result])));
    };
   });
   const checked=await verifyUnfinishedRestoreReadback(data,restored);
   if(!checked.ok)
    throw new Error('복원 후 '+(checked.part==='input'?'점검내용·현장정보':checked.part==='single'?'단건 사진':checked.part==='sequence'?'연속 촬영 사진':'임시기록')+'의 실제 저장 내용을 확인하지 못했습니다. 원본 백업 파일을 보관하고 기기 기록을 다시 조회하세요.');
   inputDraftRef.current=data.input;setInputSavedAt(data.input?.savedAt||'');
   setNote(data.input?.note||'');setAction(data.input?.action||'');
   setPhotoRole(data.input?.photoRole||'unspecified');
   setSiteContextInput(data.input?.siteContext||EMPTY_FIELD_CONTEXT);setInputDraftState('ready');
   singleDraftRef.current=data.single;setSingleDraftState('ready');
   setSingleSavedAt(data.single?.savedAt||'');setPhoto(data.single?.photo||null);
   setSinglePhotoSource(data.single?.source||null);setSinglePhotoEdit(undefined);
   draftRef.current=data.sequence;setDraft(data.sequence);setDraftState('ready');
   setUnfinishedPreview(null);
   setUnfinishedMessage('작성 중 사진과 입력을 기기에 함께 복원하고, 점검 내용과 실제 사진 파일을 다시 읽어 비교했습니다. 기존 완료 점검은 유지했습니다. 이어서 작성하세요. 안전 조치 완료나 사진의 법적 원본성을 뜻하지 않습니다.');
  }catch{
   setUnfinishedMessage(conflict
    ?'기기에 이미 다른 임시기록이 있어 복원하지 않았습니다. 기존 자료를 덮어쓰지 않았습니다. 현재 자료를 먼저 백업한 뒤 확인하세요.'
    :'복원 저장 또는 저장 후 재검증에 실패했습니다. 일부 자료가 기기에 남았을 수 있으므로 자동으로 지우지 않습니다. 원본 백업 파일을 보관하고 이 화면을 새로 열어 임시기록을 확인하세요.');
  }finally{flight.current=false;setBusy(false);setUnfinishedBusy(false);}
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
     const original=item.record!;
     await runStore<void>('readwrite',store=>{store.add(original);});
     // A committed write is re-read before reporting successful restoration.
     const stored=await runStore<LocalRecord|undefined>('readonly',(store,set)=>{
      const request=store.get(original.id);
      request.onsuccess=()=>set(request.result as LocalRecord|undefined);
     });
     if(!verifyLocalRestoreReadback(original,stored))throw new Error('unverified-restored-record');
     success++;restored.add(item.index);
    }catch(error){
     errors.push('기록 '+(item.index+1)+': '+classifyLocalRestoreError(error).message);
    }
   }
   setBatchPreview(previous=>previous?.map(item=>restored.has(item.index)?{...item,status:'duplicate' as const,message:'이번 복원에서 저장 완료 · 다시 가져오지 않음',record:undefined,selected:false}:item)||null);
   await refresh();
   setMessage('묶음 복원 결과: '+success+'건 저장 / '+errors.length+'건 실패. '+(errors.length?errors.join(' / ')+' 실패 항목은 원본 백업 파일에서 다시 시도하세요.':'저장된 기록을 확인하세요.')+' 서버에는 전송하지 않았습니다.');
  }finally{flight.current=false;setBusy(false);}
 };
 const restore=async(file:File)=>{
  if(flight.current)return;flight.current=true;setBusy(true);setMessage('');
  let backupValidated=false;
  try{
   const record=await unpackRecord(file);
   backupValidated=true;
   await runStore<void>('readwrite',store=>{store.add(record);});
   const stored=await runStore<LocalRecord|undefined>('readonly',(store,set)=>{
    const request=store.get(record.id);
    request.onsuccess=()=>set(request.result as LocalRecord|undefined);
   });
   if(!verifyLocalRestoreReadback(record,stored))throw new Error('unverified-restored-record');
   await refresh();
   setMessage('기기에서 복원된 기록을 다시 조회하여 사진 파일 정보를 확인했습니다. 사진 바이트 전체의 무결성이나 장기 보존을 입증하지는 않습니다. 서버에는 전송하지 않았습니다.');
  }catch(error){
   // Preserve detailed backup validation failures. Recovery classification
   // applies only after the parsed backup passed its integrity checks.
   setMessage(backupValidated
    ?classifyLocalRestoreError(error).message+' 원본 백업 파일은 삭제하지 마세요.'
    :error instanceof Error?error.message:'복원하지 못했습니다. 원본 백업은 보관하세요.');
  }finally{flight.current=false;setBusy(false);}
 };
 return <details id="si-local-inspection" className="si-local-inspection" onToggle={e=>{if(e.currentTarget.open)void refresh();}}>
  <summary>통신 없이 기기에서 직접 점검</summary>
  <section aria-label="기기 직접 점검">
   <h2>사진과 점검 내용을 이 기기에 보관</h2>
   <p>사진을 자동 분석하지 않습니다. 직접 확인한 내용으로 관련 기준을 찾아보는 기능입니다. 서버 업로드와 유료 AI 호출은 하지 않습니다.</p>
   <p>{offlineEntry?'사전에 오프라인 준비를 마친 기기에서는 이 주소로 인터넷 없이 다시 열 수 있습니다.':'인터넷이 끊기기 전 기기 점검 전용 화면에서 오프라인 준비가 필요합니다.'} 브라우저 데이터 삭제나 기기 분실 시 기록이 사라질 수 있으니 별도로 내려받으세요.</p>{!offlineEntry&&<p><a href="/field-local/">오프라인 재실행 준비 화면 열기</a></p>}
   <section aria-label="작성 중 자료 긴급 백업과 복구" className="rounded-xl border border-slate-300 p-3">
    <h3>작성 중 사진·내용 한번에 백업·복구</h3>
    <p>저장공간 부족이나 앱 종료에 대비해 현재 화면의 점검 내용, 현장정보, 단건 사진 및 연속 촬영 사진을 하나의 JSON 파일로 내려받습니다. 기기에 저장되지 못한 화면의 입력과 사진도 포함할 수 있습니다.</p>
    <button type="button" className="si-btn" disabled={busy||unfinishedBusy||draftState==='loading'||singleDraftState==='loading'||inputDraftState==='loading'} onClick={()=>void backupUnfinished()}>작성 중 자료 한 번에 백업</button>
    <p>내려받기 완료 여부는 기기의 파일 앱에서 직접 확인하세요. 파일은 암호화되지 않았으므로 안전한 장소에 보관해야 합니다. 사진을 포함한 통합 백업은 50MB 이하만 지원하며, 이 기능으로 현장 안전조치가 완료되지는 않습니다.</p>
    <label>작성 중 백업 파일 검사<input type="file" accept="application/json,.json" aria-label="작성 중 백업 파일 검사" disabled={busy||unfinishedBusy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void previewUnfinished(file);}}/></label>
    {unfinishedPreview&&<div aria-label="작성 중 복구 미리보기">
     <p>검사 완료 · 입력 {unfinishedPreview.input?'있음':'없음'} · 단건 사진 {unfinishedPreview.single?1:0}장 · 연속 사진 {unfinishedPreview.sequence?.photos.length||0}장. 복원 전이며 기존 임시기록은 덮어쓰지 않습니다.</p>
     <p role={unfinishedPreview.integrityLevel==='full'?'status':'alert'}>{unfinishedPreview.integrityLevel==='full'?'사진·점검내용·조치계획·현장정보·파일 전체 비교값 확인됨':'이전 백업 형식: 사진 비교값만 확인됐습니다. 점검 내용·현장정보의 변경 여부는 확인할 수 없습니다. 복원 전 직접 검토하세요.'} (비교값은 작성자 신원이나 법적 진본성 증명이 아닙니다.)</p>
     <button type="button" className="si-btn" disabled={busy||unfinishedBusy} onClick={()=>void restoreUnfinished()}>검사된 작성 중 자료 복원</button>
    </div>}
    {unfinishedMessage&&<p role="status">{unfinishedMessage}</p>}
   </section>
   <section aria-label="기기 저장 안정성 확인">
    <h3>기기 저장상태 확인</h3>
    <p>촬영 전후 저장 상태를 확인할 수 있습니다. 조회는 현재 기기의 브라우저에서만 수행하며 서버로 전송하지 않습니다.</p>
    <button type="button" className="si-btn" disabled={storageBusy} onClick={()=>void inspectStorage()}>{storageBusy?'저장상태 확인 중…':'기기 저장공간 확인'}</button>{' '}
    <button type="button" className="si-btn" disabled={storageBusy} onClick={()=>void requestStorageRetention()}>브라우저 저장 유지 요청</button>
    {storageStatus&&<div role="status"><p>{storageStatus.description}</p><p>{storageStatus.retention==='granted'?'저장 유지 요청: 브라우저에서 승인 상태로 확인됨':storageStatus.retention==='not-granted'?'저장 유지 요청: 승인 상태가 아님':'저장 유지 요청: 브라우저에서 상태를 확인할 수 없음'}</p>{storageStatus.kind==='near-limit'&&<p>사용량이 높게 보고됐습니다. 추가 저장에 실패할 수 있으므로 점검 사진과 기록을 먼저 별도 백업하고 파일 저장 여부를 확인해 주세요.</p>}</div>}
    {storageMessage&&<p role="status">{storageMessage}</p>}
    <p>표시 용량은 사이트 전체의 브라우저 추정치이며 실제 기기 여유 공간이나 향후 저장 성공을 보장하지 않습니다. 저장 유지 요청이 승인되어도 브라우저 데이터 직접 삭제·기기 교체·분실 시 기록이 사라질 수 있습니다. 반드시 백업 파일을 내려받아 다른 안전한 장소에서 열리는지 확인하세요.</p>
   </section>
   {singleDraftState==='loading'&&<p role="status">저장 전 단건 사진을 확인하고 있습니다…</p>}
   {singleDraftState==='saving'&&<p role="status">선택한 사진을 기기에 임시 보관하고 다시 확인하고 있습니다…</p>}
   {singleDraftState==='ready'&&singleSavedAt&&photo&&<p role="status">선택 사진 임시저장 확인됨 · {new Date(singleSavedAt).toLocaleString('ko-KR')} · 사진 자체의 장기 보존을 보증하지 않습니다.</p>}
   {(singleDraftState==='error'||singleDraftState==='conflict')&&<div role="alert">
    <p>{singleDraftMessage||'단건 사진을 확인하지 못했습니다. 저장 전 사진은 별도로 내려받으세요.'}</p>
    {photo&&<button type="button" className="si-btn" disabled={busy} onClick={()=>void choose(photo,singlePhotoSource||'file-picker',singlePhotoEdit)}>선택 사진 임시저장 다시 시도</button>}
    <button type="button" className="si-btn" disabled={busy} onClick={()=>{if(window.confirm('현재 선택한 사진을 내려받아 보관했습니까? 기기에 저장된 단건 임시사진을 다시 불러오면 현재 화면 사진이 바뀔 수 있습니다.'))void loadSinglePhoto();}}>기기 단건 임시사진 다시 확인</button>
   </div>}
   {photo?<>{url&&<img src={url} alt="기기 점검에 선택한 사진" style={{display:'block',maxWidth:'100%',maxHeight:260,objectFit:'contain'}}/>}<p>{photo.name} · {Math.ceil(photo.size/1024)} KB</p>{backupIssue(photo)&&<p role="alert">저장 전 백업 안내: {backupIssue(photo)} 점검은 기기에 저장할 수 있습니다.</p>}<button type="button" className="si-btn" disabled={busy} onClick={()=>download(photo,photo.name)}>선택 사진 내려받기</button>{singleDraftState==='ready'&&singleDraftRef.current&&<button type="button" className="si-btn" disabled={busy} onClick={()=>void clearSingleDraft()}>단건 임시사진만 삭제</button>}</>:<p>사진을 촬영하거나 선택해 주세요.</p>}
   <div><button type="button" className="si-btn" disabled={busy||!!draft||draftState!=='ready'||singleDraftState!=='ready'} onClick={()=>{setSequence(false);setCamera(true);}}>기기 점검 사진 촬영</button> <button type="button" className="si-btn" disabled={busy||!!photo||draftState!=='ready'||singleDraftState!=='ready'||(draft?.photos.length||0)>=2} onClick={()=>{setSequence(true);setCamera(true);}}>전체·위험 부위 연속 촬영</button> <label className="si-btn">기기 점검 사진 선택<input aria-label="기기 점검 사진 선택" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||!!draft||draftState!=='ready'||singleDraftState!=='ready'} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void choose(file,'file-picker');}}/></label></div>
   {draft&&photo&&<p role="alert">단건 임시사진과 연속 촬영 임시사진이 함께 있습니다. 혼합 저장은 차단됩니다. 필요한 사진을 내려받아 보관한 뒤, 사용하지 않을 임시사진을 명시적으로 삭제하여 한 가지 촬영본만 남기세요.</p>}
   {draftState==='loading'&&<p role="status">임시 촬영 사진을 확인하고 있습니다…</p>}
   {draftState==='error'&&<div role="alert"><p>임시 촬영 사진을 확인하지 못했습니다. 저장소를 확인하고 다시 시도하세요.</p><button type="button" className="si-btn" disabled={busy} onClick={()=>void loadDraft()}>임시 사진 다시 확인</button></div>}
   {draft&&<section aria-label="임시 촬영 사진"><p>이 기기에 임시 보관된 촬영 사진 {draft.photos.length}장 · 점검 내용은 아직 저장되지 않았습니다.</p><p>두 장이면 첫 사진의 역할을 선택하세요. 선택하지 않으면 첫 사진은 현장 전체, 둘째는 위험 부위로 저장됩니다.</p>{draft.photos.map((file,i)=><p key={i}>{i+1}. {file.name} <button type="button" className="si-btn" onClick={()=>download(file,file.name)}>임시 사진 내려받기</button></p>)}<button type="button" className="si-btn" disabled={busy} onClick={()=>void clearDraft()}>임시 사진 모두 삭제</button></section>}
   <div aria-label="작성 중 점검 임시저장 안내">
    {inputDraftState==='loading'&&<p role="status">이전에 작성 중이던 점검 입력을 확인하고 있습니다…</p>}
    {inputDraftState==='ready'&&<p role="status">점검 내용·현장정보는 이 브라우저에 임시저장됩니다. {inputPending?'현재 입력 임시저장 대기 중 · 저장 완료 표기가 나오기 전에는 화면을 닫지 마세요.':inputSavedAt?'최근 임시저장: '+new Date(inputSavedAt).toLocaleString('ko-KR'):'아직 저장된 입력이 없습니다.'} 연속 촬영 사진과 단건 선택 사진은 각각 임시보관됩니다. 브라우저 데이터 삭제·기기 분실에 대비해 별도로 백업하세요.</p>}
    {inputDraftState==='error'&&<div role="alert"><p>임시 입력을 저장하거나 불러오지 못했습니다. 현재 화면의 내용을 지우지 않았습니다. 입력을 복사해 별도 보관하세요.</p><button type="button" className="si-btn" disabled={busy} onClick={()=>setInputDraftState('ready')}>임시저장 다시 시도</button></div>}
    {inputDraftState==='conflict'&&<div role="alert"><p>다른 탭의 임시 입력이 변경되어 덮어쓰지 않았습니다. 현재 입력을 별도 보관한 뒤 최신 내용을 불러오세요.</p><button type="button" className="si-btn" disabled={busy} onClick={()=>{if(window.confirm('현재 화면의 입력을 다른 탭의 저장된 내용으로 바꿀까요?'))void loadInputDraft();}}>기기 임시 입력 다시 불러오기</button></div>}
   </div>
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
   <label>직접 확인한 내용<textarea aria-label="직접 확인한 내용" maxLength={4000} value={note} disabled={busy||inputDraftState==='loading'} onChange={e=>setNote(e.target.value)} placeholder="예: 시스템비계 발판 사이가 벌어져 보여 실측이 필요함"/></label>
   <label>현장 조치·확인 계획<textarea aria-label="현장 조치·확인 계획" maxLength={4000} value={action} disabled={busy||inputDraftState==='loading'} onChange={e=>setAction(e.target.value)} placeholder="예: 접근을 통제하고 담당자와 발판 상태 확인"/></label>
   {note.trim()&&<div aria-label="입력 내용으로 찾은 기준"><b>입력 내용으로 찾은 참고 기준</b><p>자료 묶음 버전 {reference.version} · 묶음 기준일 {reference.reviewedAt}. 개별 기준의 현재 적용 여부는 현장에서 확인하세요.</p>{reviewedCards.length?reviewedCards.slice(0,3).map(card=><article key={card.id}><strong>{card.title}</strong><p>{sourceReviewState(card.sourceReview).label}</p>{card.duties.slice(0,2).map(d=><p key={d.url}>{d.label}: {d.summary} <a href={d.url} target="_blank" rel="noreferrer">원문 확인 (인터넷 필요)</a></p>)}<p>{card.scope}</p></article>):<p>현재 입력에 대해 검토 이력과 검토 기한이 확인된 기준을 찾지 못했습니다. 위험이 없다는 뜻이 아니며, 현장 담당자가 적용 기준을 별도로 확인해야 합니다.</p>}</div>}
   <button type="button" className="si-btn si-primary" disabled={busy||(!photo&&!draft)||!!(photo&&draft)||!note.trim()||draftState!=='ready'||inputDraftState!=='ready'||singleDraftState!=='ready'} onClick={()=>void save()}>{busy?'기기에 저장 중…':'사진과 내용 기기에 저장'}</button>
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
    {batchPreview&&<div aria-label="묶음 복원 미리보기"><p>미리보기의 선택 항목만 가져옵니다. 기존 기록은 덮어쓰지 않으며, 일부 항목이 실패해도 성공한 항목은 유지됩니다. 저장 후에는 각 기록을 다시 조회하여 파일 정보가 일치하는 경우에만 성공 건수에 포함합니다.</p>
     {batchPreview.map(entry=><div key={entry.index}><label><input type="checkbox" aria-label={`복원 기록 ${entry.index+1} 선택`} checked={entry.selected} disabled={busy||entry.status!=='ready'} onChange={e=>setBatchPreview(previous=>previous?.map(item=>item.index===entry.index?{...item,selected:e.target.checked}:item)||null)}/> {entry.index+1}번 · {entry.summary}</label><p>{entry.status==='ready'?'복원 가능':entry.status==='duplicate'?'중복 건너뜀':'손상 건너뜀'} · {entry.message}</p></div>)}
     <button type="button" className="si-btn" disabled={busy||!batchPreview.some(item=>item.status==='ready'&&item.selected)} onClick={()=>void restoreSelectedBatch()}>선택한 정상 기록 복원</button>
    </div>}
   </section>
   <label className="si-btn">백업 파일 복원<input type="file" accept="application/json,.json" aria-label="백업 파일 복원" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void restore(file);}}/></label>
   {readState==='ready'&&<section aria-label="기한별 재점검 관리 현황" className="rounded-xl border border-slate-300 p-3">
    <h4>F10 · 지연 조치와 재점검 예정 관리</h4>
    <p>기기 날짜 {localCalendarDate()} 기준 · 재점검/조치 대상 {recheckSummary.total}건. 하나의 점검에 여러 조치 대상이 포함될 수 있습니다.</p>
    <p>기한 도래는 재점검 필요성을 알리는 <strong>조회용 분류</strong>입니다. 실제 통보·안전 확인·조치 완료·작업 재개 승인이 아닙니다.</p>
    {(recheckSummary.conflict+recheckSummary.overdue+recheckSummary.today)>0&&<p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-950">
     관리상 우선 확인: 기록 상충 {recheckSummary.conflict}건 · 기한 초과 {recheckSummary.overdue}건 · 오늘 확인 {recheckSummary.today}건.
     아래 상태별 버튼으로 점검 대상을 확인하세요. 이 집계는 실제 위험의 크기나 작업 재개 가능 여부를 자동 판정하지 않습니다.
    </p>}
    <details className="rounded-lg border border-slate-200 p-2">
     <summary>조치를 바로 끝낼 수 없을 때 · 기록 순서 보기</summary>
     <ol className="list-decimal pl-5">
      <li>급박한 위험은 현장 책임자와 작업중지·접근통제 필요성을 먼저 검토합니다.</li>
      <li>임시 안전조치 내용과 확인 수준, 담당자 및 조치 목표 기한을 별도로 기록합니다.</li>
      <li>지연 사유와 다음 재점검일을 남기고, 일정·임시조치를 변경하면 변경 사유도 기록합니다.</li>
      <li>재점검 결과와 조치 완료 확인은 각각 기록하며, 자동으로 완료 또는 작업 재개 승인 처리하지 않습니다.</li>
     </ol>
     <p>기기의 기록은 담당자에게 자동 통보되지 않습니다. 인계·수신·현장 확인은 사람이 별도로 해야 합니다.</p>
    </details>
    <div role="group" aria-label="재점검 상태별 바로 보기" className="flex flex-wrap gap-2">
     {LOCAL_RECHECK_BUCKETS.map(bucket=><button type="button" key={bucket}
      className="si-btn" aria-pressed={filter==='recheck:'+bucket}
      onClick={()=>setFilter(previous=>previous==='recheck:'+bucket?'all':'recheck:'+bucket)}>
      {LOCAL_RECHECK_LABELS[bucket]} {recheckSummary[bucket]}건
     </button>)}
    </div>
    <p>위 버튼을 선택하면 아래 점검 목록이 해당 상태로 좁혀집니다. 담당자 연락은 별도로 수행하고, 재점검 결과는 각 점검의 이력에 직접 저장하세요.</p>
    {recheckQueue.length>0&&<details>
     <summary>확인 우선순위 · 전체 대상 보기 ({recheckQueue.length}건)</summary>
     <ol>{recheckQueue.map(item=><li key={item.id}>
      <strong>{LOCAL_RECHECK_LABELS[item.bucket]}</strong> · {item.label}
      {' · '}{item.recordText||'점검 메모 미기록'}
      {' · '}{item.date?item.dateSource+' '+item.date:'다음 확인 예정일 미정'}
      {!item.hasAssignee?' · 담당자 미지정':''}
      {!item.hasTemporaryMeasure&&item.bucket!=='verified'?' · 임시조치 기록 없음':''}
      {item.bucket==='conflict'?' · 완료 상태와 최신 미완료 재점검 이력이 상충해 전문가 재확인 필요':''}
     </li>)}</ol>
    </details>}
    <div role="group" aria-label="F10 경과 통합 타임라인" className="mt-3 rounded-lg border border-slate-300 p-3">
     <details>
      <summary>30차 · 목표 기한·임시통제·재점검 경과 연결 보기 ({recheckFilter?recheckQueue.filter(item=>item.bucket===recheckFilter).length:recheckQueue.length}개 대상)</summary>
      <p>점검자 기기 이력을 시각순으로 연결합니다. 서로 다른 조치 목표 기한과 재점검 예정일을 구분하고, 임시통제 확인은 점검자 입력으로만 표시합니다. 실제 작업 완료·위험 해소·작업 재개 승인이 아닙니다.</p>
      <p>한 화면에는 우선순위 순서로 최대 30개 대상의 경과를 표시합니다. 30개를 초과하면 상태별 필터로 좁히거나 아래 CSV·인쇄용 보고서에서 전체 경과를 선택해 저장하세요. 표시하지 않은 항목을 자동 완료 처리하지 않습니다.</p>
      <ol>{recheckQueue.filter(item=>recheckFilter?item.bucket===recheckFilter:true).slice(0,30).map(item=>{
       const original=rows.find(row=>row.id===item.recordId);
       if(!original)return null;
       const progress=buildLocalRecheckProgress(original,item.actionId);
       return <li key={item.id}>
        <details><summary>{LOCAL_RECHECK_LABELS[item.bucket]} · {item.label} · 후속 {progress.followupCount}건 / 재점검 {progress.recheckCount}건</summary>
         <p>현재 조치 목표 기한: {progress.currentDueDate||'미정'} · 최신 재점검 다음 확인일: {progress.nextCheckDate===null?'재점검 이력 없음':(progress.nextCheckDate||'미정')}</p>
         <p>기한 변경 {progress.dueChangeCount}건 · 임시조치 변경 {progress.temporaryChangeCount}건 · 최근 임시조치 확인 기록: {progress.lastControlReview}</p>
         {progress.inconsistentFollowup&&<p role="alert">현재 조치 상태와 마지막 이력이 상충합니다. 점검자 재확인이 필요합니다.</p>}
         {progress.total===0?<p>후속 조치 및 재점검 이력이 아직 없습니다.</p>:
          <ol>{progress.events.map(event=><li key={event.id}>
           {event.at?new Date(event.at).toLocaleString('ko-KR'):'기기 시각 미확인'} · {event.title}
           {event.dueBefore!==null?' · 목표 기한 '+event.dueBefore+' → '+event.dueAfter:''}
           {event.dueDate!==null?' · 당시 목표 기한 '+(event.dueDate||'미정'):''}
           {event.nextCheckDate!==null?' · 당시 다음 확인일 '+(event.nextCheckDate||'미정'):''}
           {' · '+event.status}
           {event.controlReview?' · 임시통제 확인 기록: '+event.controlReview:''}
           {event.evidenceLinked?' · 당시 사진 해시 연결 기록 있음':''}
          </li>)}</ol>}
        </details>
       </li>;
      })}</ol>
     </details>
    </div>
    <div role="group" aria-label="F10 오늘 현장 인계 준비" className="mt-3 rounded-xl border border-slate-300 p-3">
     <h5>28차 · 지연 조치 현장 인계 준비</h5>
     <p>즉시 조치가 어려운 항목을 확인하도록 인계 초안을 만듭니다. 상태 불일치·기한 초과·오늘·3일 이내·다음 확인일 미정, 그리고 이후 예정 중 담당 미기록 항목을 포함합니다. 분류는 안전 위험등급이 아닌 업무 확인 순서입니다.</p>
     <label>인계 대상 범위
      <select aria-label="F10 인계 대상 범위" value={handoffScope} disabled={handoffPending||busy} onChange={e=>setHandoffScope(e.target.value as 'visible'|'all')}>
       <option value="all">전체 점검의 인계 대상</option><option value="visible">현재 상태 필터의 인계 대상</option>
      </select>
     </label>
     <p>인계 대상 {handoffTargetQueue.length}건 / 최대 {F10_HANDOFF_MAX_ITEMS}건. 담당자 미기록 {handoffTargetQueue.filter(item=>!item.hasAssignee).length}건, 임시조치 미기록 {handoffTargetQueue.filter(item=>!item.hasTemporaryMeasure).length}건.</p>
     <p>이 인계 문구에는 담당자 실명·개인 연락처·사진 원본·자유기입 지연 사유를 자동 포함하지 않습니다. 미기록은 실제 조치가 없었다는 판정이 아닙니다.</p>
     <button type="button" className="si-btn" disabled={busy||handoffPending||!handoffTargetQueue.length||handoffTargetQueue.length>F10_HANDOFF_MAX_ITEMS}
      onClick={()=>void prepareHandoff()}>{handoffPending?'기기 인계 기록 대조 중…':'인계 문구·A4 인계표 준비'}</button>
     {handoffTargetQueue.length>F10_HANDOFF_MAX_ITEMS&&<p role="alert">인계 대상이 40건을 초과했습니다. 현재 상태 필터로 나누어 준비하고 전체 관리대장도 확인하세요. 대상을 조용히 생략하지 않습니다.</p>}
     {handoffMessage&&<p role="status">{handoffMessage}</p>}
     {handoffPrepared&&<div aria-label="준비된 F10 인계 자료">
      <p>기기 기준일 {handoffPrepared.at} · 인계 대상 {handoffPrepared.count}건. 작성 당시의 기기 기록으로만 준비했습니다.</p>
      <button type="button" className="si-btn" onClick={()=>void copyHandoff()}>인계 문구 복사 (자동 전송 없음)</button>
      {' '}
      {handoffHtmlUrl&&<a className="si-btn" href={handoffHtmlUrl} download={'PSI_F10_handoff_'+handoffPrepared.at+'.html'}>A4 인계표 기기에 저장</a>}
      <label>인계 문구 직접 확인·복사
       <textarea aria-label="F10 인계 문구 직접 복사" readOnly rows={6} value={handoffPrepared.text}/>
      </label>
     </div>}
     <p>인계표는 내부 관리용이며 통보·수신 확인 또는 위험 해소·작업 재개 승인서가 아닙니다. 현장 위험이 급박하면 인계 예정일을 기다리지 말고 접근통제·작업중지 필요성을 먼저 검토하세요.</p>
    </div>
    <div role="group" aria-label="재점검 관리 보고서 만들기" className="mt-3 rounded-lg border border-slate-300 p-3">
     <h5>30차 · F10 현장 관리·경과 연결 보고서</h5>
     <p>기기 저장 기록으로 CSV 대장과 A4 가로 인쇄용 HTML을 준비합니다. 서버 업로드·자동 발송 없이 기기에서만 처리합니다. HTML 파일을 연 뒤 인쇄 기능에서 PDF로 저장할 수 있습니다.</p>
     <label>보고 대상 범위
      <select aria-label="재점검 보고 범위" value={reportScope} disabled={reportBusy||busy} onChange={e=>setReportScope(e.target.value as 'visible'|'all')}>
       <option value="visible">현재 상태 필터 기준</option><option value="all">전체 재점검 대상</option>
      </select>
     </label>
     <p>선택 범위: {reportScopeLabel} · 보고 대상 {reportTargetQueue.length}건 / 최대 {F10_LOCAL_REPORT_LIMIT}건. 점검 기록 수와 조치 대상 수는 다를 수 있습니다.</p>
     <label><input type="checkbox" aria-label="보고서에 담당자 이름 포함" checked={reportIncludeAssignees} disabled={reportBusy} onChange={e=>setReportIncludeAssignees(e.target.checked)}/> 담당자 이름 포함 (선택)</label>
     <label><input type="checkbox" aria-label="보고서에 상세 자유기입 포함" checked={reportIncludeDetails} disabled={reportBusy} onChange={e=>setReportIncludeDetails(e.target.checked)}/> 지연 사유·임시조치·점검 내용 상세 포함 (선택)</label>
     <label><input type="checkbox" aria-label="보고서에 F10 경과 연결 이력 포함" checked={reportIncludeProgress} disabled={reportBusy} onChange={e=>setReportIncludeProgress(e.target.checked)}/> 조치기한 변경·임시통제 기록·재점검 경과 연결 포함 (선택)</label>
     <p>경과 연결을 선택하면 과거 기기 입력 시각·변경 전후 기한·최신 재점검 예정일이 CSV와 A4 문서에 함께 표시됩니다. 과거 자유기입 사유는 ‘상세 자유기입 포함’을 별도로 선택해야 출력됩니다. 1,500개 이력 초과 시 파일 생성을 중단합니다.</p>
     {(reportIncludeAssignees||reportIncludeDetails)&&<p role="note">선택한 상세 정보에는 근로자 이름·연락처 등 개인정보가 들어 있을 수 있습니다. 저장·공유 전 내용을 직접 확인하세요.</p>}
     <p>기본 보고서에는 사진 파일·전체 SHA-256·담당자 실명·자유기입 상세를 넣지 않습니다. 현장정보는 점검자 입력값 그대로 표시하며 실제 현장 확인을 대신하지 않습니다.</p>
     <button type="button" className="si-btn si-primary"
      disabled={busy||reportBusy||!reportTargetQueue.length||reportTargetQueue.length>F10_LOCAL_REPORT_LIMIT}
      onClick={()=>void prepareRecheckReport()}>{reportBusy?'기기 기록 재확인 중…':'CSV·인쇄용 보고서 준비'}</button>
     {reportMessage&&<p role="status">{reportMessage}</p>}
     {reportFiles&&<div aria-label="준비된 재점검 보고서">
      <p>준비된 보고: {reportFiles.count}개 조치 대상 · 기기 날짜 {reportFiles.at}. 기기 기록이나 대상 선택이 바뀌면 새로 준비해야 합니다.</p>
      {reportCsvUrl&&<a className="si-btn" href={reportCsvUrl} download={'PSI_F10_recheck_'+reportFiles.at+'.csv'}>CSV 대장 기기에 저장</a>}
      {' '}
      {reportHtmlUrl&&<a className="si-btn" href={reportHtmlUrl} download={'PSI_F10_recheck_'+reportFiles.at+'.html'}>A4 인쇄용 HTML 기기에 저장</a>}
     </div>}
     <p>두 파일은 암호화되지 않습니다. 외부 제출 전에 내용·개인정보를 검토하고 적절한 접근권한으로 보관하세요. 보고서를 준비하거나 저장해도 조치 완료가 승인되지 않습니다.</p>
    </div>
    <button type="button" className="si-btn" disabled={busy} onClick={()=>void refresh()}>기기 기록 다시 조회</button>
    <p>급박한 추락·낙하·붕괴 등 위험은 다음 확인일까지 기다리지 말고 접근통제·작업중지 필요성을 현장에서 먼저 검토하세요.</p>
   </section>}
   {readState==='ready'&&<label>후속 조치 모아보기<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">전체</option><option value="unassigned">담당 미지정</option><option value="no_due">기한 미정</option><option value="overdue">기한 초과</option><option value="review">확인 요청</option>{LOCAL_RECHECK_BUCKETS.map(bucket=><option value={'recheck:'+bucket} key={bucket}>재점검 · {LOCAL_RECHECK_LABELS[bucket]}</option>)}</select> · 표시 점검 {visibleRows.length}건</label>}
   {readState==='ready'&&visibleRows.length===0&&<div role="status" className="rounded-lg border border-slate-200 p-3">
    <p>{rows.length===0
     ?'현재 브라우저에서 조회된 점검이 없습니다. 이전 기록이 다른 기기나 브라우저에 보관됐을 수 있으니 백업을 확인하세요.'
     :'현재 선택한 후속 조치 조건에 맞는 점검이 없습니다. 기존 저장 기록이 삭제된 것은 아닙니다.'}</p>
    {rows.length>0&&filter!=='all'&&<button type="button" className="si-btn" disabled={busy} onClick={()=>setFilter('all')}>필터 해제 · 전체 기록 보기</button>}
   </div>}
   {readState==='ready'&&visibleRows.map(row=><article key={row.id}><label><input type="checkbox" aria-label="묶음 백업에 선택" checked={backupIds.includes(row.id)} disabled={busy} onChange={e=>setBackupIds(prev=>e.target.checked?[...prev.filter(id=>id!==row.id),row.id]:prev.filter(id=>id!==row.id))}/> 묶음 백업에 선택</label><p>{new Date(row.createdAt).toLocaleString('ko-KR')} · {row.note}</p><p>점검 현장정보: {row.siteContext?fieldContextLabel(row.siteContext):'미기록 (기존 기록 포함)'} · 위치는 점검자 입력이며 자동 검증된 사실이 아닙니다.</p><FieldContextEditor row={row} busy={busy} onSave={saveFieldContext}/><LocalEvidenceAudit inspectionId={row.id} busy={busy}/><p>조치 계획: {row.action||'미작성'} · 파일 무결성 기록: {row.sha256?'SHA-256 기록됨':'미확인'}</p><PrimaryPhotoEditor row={row} busy={busy} onSave={savePrimaryPhoto}/><ContextPhotoEditor row={row} busy={busy} onSave={saveContextPhoto} onOrder={changePhotoOrder} onLink={changeContextLink}/><FollowupEditor row={row} busy={busy} onSave={saveFollowup}/><RecheckEditor row={row} busy={busy} onSave={saveRecheck}/><AdditionalActions row={row} busy={busy} onUpdate={updateAdditionalActions} onPhoto={saveActionPhoto} onRecheck={saveRecheck}/><div><p>조치 후 사진: {row.afterPhoto?row.afterPhoto.name:'아직 없음'}</p><p>이 점검의 조치 후 사진은 위에 표시된 점검 현장정보를 공유합니다. 사진 자체의 촬영 위치를 입증하지는 않습니다.</p><button type="button" className="si-btn" disabled={busy} onClick={()=>{if(capturedAfter&&!window.confirm('아직 저장하지 않은 조치 후 사진을 버리고 다시 촬영할까요?'))return;setCapturedAfter(null);setAfterCamera(row);}}>조치 후 사진 촬영</button> <label className="si-btn">조치 후 사진 {row.afterPhoto?'변경':'연결'}<input aria-label="조치 후 사진 연결" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file&&(!capturedAfter||window.confirm('저장하지 않은 촬영 사진을 버리고 선택한 사진을 연결할까요?')))void saveAfterPhoto(row,file,'file-picker');}}/></label> {row.afterPhoto&&<button type="button" className="si-btn" onClick={()=>download(row.afterPhoto!,row.afterPhoto!.name||'PSI-after.jpg')}>조치 후 사진 내려받기</button>}<p>사진 연결만으로 조치 완료나 안전을 증명하지 않습니다.</p>{!!row.afterHistory?.length&&<details><summary>이전 조치 후 사진 {row.afterHistory.length}장</summary><p>교체 시각은 기기 시각이며 촬영 시각과 다를 수 있습니다.</p>{row.afterHistory.map((entry,i)=><p key={i}>{entry.photo.name} · {new Date(entry.replacedAt).toLocaleString('ko-KR')} <button type="button" className="si-btn" onClick={()=>download(entry.photo,entry.photo.name)}>이전 조치 후 사진 내려받기</button></p>)}</details>}</div><button type="button" className="si-btn" disabled={busy} onClick={()=>void verifyPhoto(row.id)}>사진 변경 확인</button> {checks[row.id]&&<p role="status">{checks[row.id]}</p>} <button type="button" className="si-btn" onClick={()=>download(row.photo,row.photo.name||'PSI-photo.jpg')}>사진 내려받기</button> <button type="button" className="si-btn" onClick={()=>{const {photo:stored,...data}=row;download(new Blob([JSON.stringify({...data,photoName:stored.name,photoType:stored.type},null,2)],{type:'application/json'}),'PSI-local-record-'+row.id+'.json');}}>점검 내용 내려받기</button> <button type="button" className="si-btn" disabled={busy} onClick={()=>void backup(row)}>사진과 기록 함께 백업</button> <button type="button" className="si-btn" disabled={busy} onClick={()=>void remove(row)}>이 기기 기록 삭제</button></article>)}
   {capturedAfter&&<div role="status"><p>촬영한 조치 후 사진이 아직 저장되지 않았습니다. 연결할 점검: {capturedAfter.row.note}</p><button type="button" className="si-btn" disabled={busy} onClick={()=>void saveAfterPhoto(capturedAfter.row,capturedAfter.file,'camera-dialog',capturedAfter.edit)}>촬영 사진 연결{busy?' 중…':''}</button> <button type="button" className="si-btn" onClick={()=>download(capturedAfter.file,capturedAfter.file.name||'PSI-after.jpg')}>촬영 사진 내려받기</button> <button type="button" className="si-btn" disabled={busy} onClick={()=>{if(window.confirm('저장하지 않은 조치 후 사진을 버릴까요?'))setCapturedAfter(null);}}>촬영 사진 버리기</button></div>}
   <p>사진 변경 확인은 저장된 사진과 기록된 비교값만 대조합니다. 백업에서 복원한 기록의 비교값은 백업 당시 생성됐을 수 있습니다. 점검 내용의 변경이나 촬영 시각·장소·안전 여부는 증명하지 않습니다.</p>
  </section>
  {camera&&<InspectorCameraDialog onClose={()=>{setCamera(false);setSequence(false);}} onSaveAndContinue={sequence?stagePhoto:undefined} storedCount={draft?.photos.length||0} onUse={(file,edit)=>{if(!sequence){setCamera(false);void choose(file,'camera-dialog',edit);return;}void stagePhoto(file,edit).then(ok=>{if(ok){setCamera(false);setSequence(false);}else window.alert('사진을 기기에 보관하지 못했습니다. 사진을 내려받거나 다시 시도하세요.');});}}/>}
  {afterCamera&&<InspectorCameraDialog reference={{url:afterReferenceChoice==='context'?afterReferences.context:afterReferences.primary,label:'조치 전 사진',...(afterReferences.context?{selection:{value:afterReferenceChoice,options:[{value:'primary',label:`기본 사진 · ${afterCamera.photoRole==='overview'?'현장 전체':afterCamera.photoRole==='detail'?'위험 부위':'역할 미지정'}`},{value:'context',label:`추가 사진 · ${afterCamera.contextRole==='overview'?'현장 전체':'위험 부위'}`}],onChange:(value:string)=>setAfterReferenceChoice(value==='context'?'context':'primary')}}:{})}} onClose={()=>setAfterCamera(null)} onUse={(file,edit)=>{setCapturedAfter({row:afterCamera,file,edit});setAfterCamera(null);setMessage('촬영 사진을 확인한 뒤 점검에 연결하세요.');}}/>}
 </details>;
}
