import {validLocalInputDraft} from './localInputDraft.mjs';
import {validSinglePhotoDraft} from './localSinglePhotoDraft.mjs';

export const UNFINISHED_BACKUP_FORMAT='psi-local-unfinished-checkpoint';
export const UNFINISHED_BACKUP_LIMIT=50*1024*1024;
const PHOTO_LIMIT=20*1024*1024;
const MIME=new Set(['image/jpeg','image/png','image/webp']);
const SHA=/^[0-9a-f]{64}$/;
const hasKeys=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const safeDate=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
const uuid=s=>typeof s==='string'&&/^[0-9a-f-]{36}$/i.test(s);
const fail=message=>{throw new Error(message);};
const equals=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function digest(bytes){
 const value=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(value)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
function encodeBase64(bytes){
 let s='';for(let i=0;i<bytes.length;i+=0x4000)s+=String.fromCharCode(...bytes.subarray(i,i+0x4000));
 return btoa(s);
}
function decodeBase64(text){
 if(typeof text!=='string'||text.length>Math.ceil(PHOTO_LIMIT*4/3)+8||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text))
  fail('백업 사진 데이터 형식이 손상됐습니다.');
 const value=atob(text);if(!value.length||value.length>PHOTO_LIMIT)fail('백업 사진 크기가 올바르지 않습니다.');
 return Uint8Array.from(value,c=>c.charCodeAt(0));
}
async function packFile(file){
 if(!(file instanceof File)||!MIME.has(file.type)||file.size<1||file.size>PHOTO_LIMIT||!file.name||file.name.length>255)
  fail('사진의 형식·크기·이름을 확인해 주세요. 각 사진은 20MB 이하여야 합니다.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 return {name:file.name,type:file.type,lastModified:file.lastModified,sha256:await digest(bytes),data:encodeBase64(bytes)};
}
async function unpackFile(packed){
 if(!hasKeys(packed,['name','type','lastModified','sha256','data'])||
  typeof packed.name!=='string'||!packed.name||packed.name.length>255||!MIME.has(packed.type)||
  !Number.isFinite(packed.lastModified)||packed.lastModified<0||!SHA.test(packed.sha256))
  fail('백업 사진의 메타정보가 올바르지 않습니다.');
 const bytes=decodeBase64(packed.data);
 if(await digest(bytes)!==packed.sha256)fail('백업 사진의 SHA-256 비교값이 일치하지 않습니다. 복원을 중단했습니다.');
 return new File([bytes],packed.name,{type:packed.type,lastModified:packed.lastModified});
}
async function packEdit(edit,derivedHash){
 if(!edit)return null;
 if(!hasKeys(edit,['originalFile','originalSha256','derivedSha256','rotationDegrees','processedAt'])||
  !SHA.test(edit.originalSha256)||edit.derivedSha256!==derivedHash||
  ![90,180,270].includes(edit.rotationDegrees)||!safeDate(edit.processedAt))fail('사진 회전 이력이 올바르지 않습니다.');
 const original=await packFile(edit.originalFile);
 if(original.sha256!==edit.originalSha256)fail('회전 전 원본 사진의 SHA-256이 일치하지 않습니다.');
 return {...edit,originalFile:original};
}
async function unpackEdit(edit,derivedHash){
 if(edit===null||edit===undefined)return null;
 if(!hasKeys(edit,['originalFile','originalSha256','derivedSha256','rotationDegrees','processedAt'])||
  !SHA.test(edit.originalSha256)||edit.derivedSha256!==derivedHash||
  ![90,180,270].includes(edit.rotationDegrees)||!safeDate(edit.processedAt))fail('백업의 사진 회전 이력이 손상됐습니다.');
 const originalFile=await unpackFile(edit.originalFile);
 if(edit.originalSha256!==await digest(await originalFile.arrayBuffer()))fail('회전 전 사진 비교값이 올바르지 않습니다.');
 return {...edit,originalFile};
}
async function packSingle(s){
 if(!s)return null;
 if(!validSinglePhotoDraft(s))fail('단건 임시사진이 올바르지 않아 백업하지 않았습니다.');
 const photo=await packFile(s.photo);
 if(photo.sha256!==s.sha256)fail('단건 임시사진의 SHA-256이 일치하지 않습니다.');
 return {...s,photo,edit:await packEdit(s.edit,s.sha256)};
}
async function unpackSingle(s){
 if(s===null)return null;
 if(!hasKeys(s,['id','kind','revision','savedAt','photo','sha256','source','edit']))fail('단건 사진 백업 구성이 손상됐습니다.');
 const photo=await unpackFile(s.photo);
 const result={...s,photo,edit:await unpackEdit(s.edit,s.sha256)};
 if(!validSinglePhotoDraft(result)||result.sha256!==await digest(await photo.arrayBuffer()))fail('단건 사진 백업을 검사하지 못했습니다.');
 return result;
}
function validSequence(s){
 if(!s||s.id!=='psi-photo-set-draft-v1'||s.kind!=='photo-set-draft'||!uuid(s.revision)||
 !Array.isArray(s.photos)||s.photos.length<1||s.photos.length>2||
 s.photos.some(p=>!(p instanceof File)||!MIME.has(p.type)||!p.size||p.size>PHOTO_LIMIT))return false;
 if(s.sources!==undefined&&(!Array.isArray(s.sources)||s.sources.length!==s.photos.length||
 s.sources.some(v=>!hasKeys(v,['source','sha256','recordedAt'])||v.source!=='camera-dialog'||!SHA.test(v.sha256)||!safeDate(v.recordedAt))))return false;
 if(s.edits!==undefined&&(!s.edits||typeof s.edits!=='object'||Array.isArray(s.edits)||
 Object.keys(s.edits).some(k=>!['primary:0','context:0'].includes(k))))return false;
 return true;
}
async function packSequence(s){
 if(!s)return null;
 if(!validSequence(s))fail('연속 촬영 임시사진이 올바르지 않아 백업하지 않았습니다.');
 const photos=[];for(const p of s.photos)photos.push(await packFile(p));
 if(s.sources&&s.sources.some((x,i)=>x.sha256!==photos[i].sha256))fail('연속 촬영 사진의 출처 비교값이 일치하지 않습니다.');
 const edits={};
 for(const [slot,entry] of Object.entries(s.edits||{})){
  const index=slot==='primary:0'?0:1;
  if(index>=photos.length)fail('존재하지 않는 사진의 회전 이력이 발견됐습니다.');
  edits[slot]=await packEdit(entry,photos[index].sha256);
 }
 return {id:s.id,kind:s.kind,revision:s.revision,photos,sources:s.sources||null,edits:Object.keys(edits).length?edits:null};
}
async function unpackSequence(s){
 if(s===null)return null;
 if(!hasKeys(s,['id','kind','revision','photos','sources','edits'])||
 !Array.isArray(s.photos)||s.photos.length<1||s.photos.length>2)fail('연속 촬영 백업 구성이 손상됐습니다.');
 const photos=[];for(const item of s.photos)photos.push(await unpackFile(item));
 const edits={};
 if(s.edits!==null){
  if(!s.edits||typeof s.edits!=='object'||Array.isArray(s.edits))fail('연속 촬영 편집 기록이 손상됐습니다.');
  for(const [slot,item] of Object.entries(s.edits)){
   if(!['primary:0','context:0'].includes(slot)||slot==='context:0'&&photos.length<2)fail('연속 촬영 편집 대상이 올바르지 않습니다.');
   edits[slot]=await unpackEdit(item,(await digest(await photos[slot==='primary:0'?0:1].arrayBuffer())));
  }
 }
 const result={id:s.id,kind:s.kind,revision:s.revision,photos,sources:s.sources===null?undefined:s.sources,edits:Object.keys(edits).length?edits:undefined};
 if(!validSequence(result))fail('연속 촬영 백업을 검사하지 못했습니다.');
 if(result.sources){
  for(let i=0;i<photos.length;i++)if(result.sources[i].sha256!==await digest(await photos[i].arrayBuffer()))
   fail('연속 촬영 사진 출처와 파일 비교값이 일치하지 않습니다.');
 }
 return result;
}
export async function packUnfinishedBackup({input=null,single=null,sequence=null}={}){
 if(input&&!validLocalInputDraft(input))fail('작성 중 입력이 올바르지 않습니다.');
 if(!input&&!single&&!sequence)fail('백업할 작성 중 자료가 없습니다.');
 const record={format:UNFINISHED_BACKUP_FORMAT,version:1,exportedAt:new Date().toISOString(),
  input:input||null,single:await packSingle(single),sequence:await packSequence(sequence)};
 const text=JSON.stringify(record);
 if(new Blob([text]).size>UNFINISHED_BACKUP_LIMIT)fail('통합 백업이 50MB를 초과했습니다. 사진을 별도로 내려받아 주세요.');
 return new Blob([text],{type:'application/json'});
}
export async function unpackUnfinishedBackup(file){
 if(!file||typeof file.size!=='number'||file.size>UNFINISHED_BACKUP_LIMIT)fail('작성 중 백업 파일은 50MB 이하여야 합니다.');
 let data;try{data=JSON.parse(await file.text());}catch{fail('작성 중 백업 파일을 읽지 못했습니다.');}
 if(!hasKeys(data,['format','version','exportedAt','input','single','sequence'])||
 data.format!==UNFINISHED_BACKUP_FORMAT||data.version!==1||!safeDate(data.exportedAt))fail('지원하지 않거나 손상된 작성 중 백업입니다.');
 const input=data.input;
 if(input!==null&&!validLocalInputDraft(input))fail('백업의 작성 중 입력이 손상됐습니다.');
 const single=await unpackSingle(data.single);
 const sequence=await unpackSequence(data.sequence);
 if(!input&&!single&&!sequence)fail('비어 있는 작성 중 백업입니다.');
 return {input,single,sequence,exportedAt:data.exportedAt};
}
export function previewUnfinishedBackup(data){
 return {hasInput:Boolean(data?.input),singlePhotos:data?.single?1:0,sequencePhotos:data?.sequence?.photos?.length||0,
  note:typeof data?.input?.note==='string'?data.input.note.slice(0,60):'',exportedAt:data?.exportedAt||null};
}
