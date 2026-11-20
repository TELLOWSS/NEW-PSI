/**
 * HQ-SAFE in-memory evidence reference manifest for NON-IDENTIFIABLE demo files only.
 *
 * A hash proves only the bytes the local browser processed, NOT who collected a file,
 * its date, original provenance, content accuracy, authenticity or chain of custody.
 * Files, narratives, filenames and media bytes must never be uploaded, persisted or logged.
 */
import type {EvidenceKind} from './accidentSequenceModel';

export const MAX_DEMO_EVIDENCE_BYTES=8*1024*1024;
export const REF_PATTERN=/^DEMO-[A-Z0-9][A-Z0-9_-]{3,35}$/;
export const EVIDENCE_KINDS:readonly EvidenceKind[]=['report','statement','photo','plan','inspection'];

export interface EvidenceManifestRecord{
  incidentId:number;
  ref:string;
  kind:EvidenceKind;
  note:string;
  sha256:string|null;
  byteCount:number|null;
  recordedAt:string;
  status:'metadata_only'|'local_fingerprint';
}
export type EvidenceManifest=Record<number,readonly EvidenceManifestRecord[]>;
export interface EvidenceLink{
  id:string;
  sourceRef:string;
  expectedKind:EvidenceKind|null;
  context:'sequence'|'fact';
}
export interface EvidenceIssue{
  code:'MISSING_REFERENCE'|'SOURCE_KIND_MISMATCH'|'REFERENCE_FORMAT'|'UNIDENTIFIED_MATERIAL';
  ref:string;
  message:string;
  context:EvidenceLink['context'];
}
export interface EvidenceLinkAudit{
  totalLinks:number;
  linked:number;
  missing:number;
  mismatched:number;
  metadataOnly:number;
  issues:readonly EvidenceIssue[];
  readyToRequestDemoReview:boolean;
}
const isValidHash=(s:string):boolean=>/^[a-f0-9]{64}$/.test(s);
const isValidDateTime=(s:string):boolean=>Boolean(s)&&Number.isFinite(Date.parse(s));
export function addEvidenceRecord(records:readonly EvidenceManifestRecord[],record:EvidenceManifestRecord):EvidenceManifestRecord[]{
  if(!Number.isSafeInteger(record.incidentId)||record.incidentId<1)throw new Error('사고 식별자를 확인하세요.');
  if(!REF_PATTERN.test(record.ref))throw new Error('시연 자료번호는 DEMO-로 시작하는 영문·숫자 형식이어야 합니다.');
  if(!EVIDENCE_KINDS.includes(record.kind))throw new Error('증빙 종류가 유효하지 않습니다.');
  const note=record.note.trim().slice(0,180);
  if(note.length<8)throw new Error('비식별 자료 설명을 8자 이상 입력하세요.');
  if(!isValidDateTime(record.recordedAt))throw new Error('증빙 등록시각을 확인하세요.');
  if(records.some(x=>x.ref===record.ref))throw new Error('동일 사고의 증빙 참조번호가 중복됐습니다.');
  if(records.some(x=>x.incidentId!==record.incidentId))throw new Error('다른 사고의 증빙자료를 함께 저장할 수 없습니다.');
  if(record.status==='local_fingerprint'){
    if(!record.sha256||!isValidHash(record.sha256)||!Number.isSafeInteger(record.byteCount)||
      (record.byteCount as number)<=0||(record.byteCount as number)>MAX_DEMO_EVIDENCE_BYTES){
      throw new Error('로컬 파일 지문 정보가 유효하지 않습니다.');
    }
    if(records.some(x=>x.sha256!==null&&x.sha256===record.sha256)){
      throw new Error('같은 파일 지문이 현재 사고 증빙대장에 이미 등록됐습니다.');
    }
  }else if(record.status==='metadata_only'){
    if(record.sha256!==null||record.byteCount!==null)throw new Error('참조번호만 등록한 자료는 해시가 없어야 합니다.');
  }else throw new Error('증빙 등록 상태가 유효하지 않습니다.');
  return [...records,{...record,note}];
}

/** Explicit user-file selection ONLY. Maximum 8 MiB; no network, caches or persistence. */
export async function calculateLocalFingerprint(blob:Blob):Promise<{sha256:string;byteCount:number}>{
  if(blob.size<=0||blob.size>MAX_DEMO_EVIDENCE_BYTES){
    throw new Error('시연 파일은 1바이트 이상 8MB 이하만 사용할 수 있습니다.');
  }
  if(typeof crypto==='undefined'||!crypto.subtle?.digest){
    throw new Error('이 브라우저에서 로컬 SHA-256 계산을 지원하지 않습니다.');
  }
  const data=await blob.arrayBuffer();
  const bytes=await crypto.subtle.digest('SHA-256',data);
  const sha256=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
  return {sha256,byteCount:blob.size};
}
export function checkEvidenceLinks(
  incidentId:number,records:readonly EvidenceManifestRecord[],links:readonly EvidenceLink[]
):EvidenceLinkAudit{
  if(records.some(x=>x.incidentId!==incidentId))throw new Error('다른 사고의 증빙을 혼합할 수 없습니다.');
  const byRef=new Map(records.map(x=>[x.ref,x]));
  if(byRef.size!==records.length)throw new Error('중복 증빙 참조번호가 있습니다.');
  const issues:EvidenceIssue[]=[];
  let linked=0,missing=0,mismatched=0,metadataOnly=0;
  for(const link of links){
    const ref=link.sourceRef.trim().toUpperCase();
    const record=byRef.get(ref);
    if(!REF_PATTERN.test(ref)){
      missing++;
      issues.push({code:'REFERENCE_FORMAT',ref,message:'비식별 증빙대장 참조번호 형식을 확인하세요.',context:link.context});
    }else if(!record){
      missing++;
      issues.push({code:'MISSING_REFERENCE',ref,message:'사고 증빙대장에 해당 자료번호가 등록되지 않았습니다.',context:link.context});
    }else if(link.expectedKind&&record.kind!==link.expectedKind){
      mismatched++;
      issues.push({code:'SOURCE_KIND_MISMATCH',ref,message:'조사기록에 표시된 근거 종류와 증빙대장의 자료 종류가 다릅니다.',context:link.context});
    }else{
      linked++;
      if(record.status==='metadata_only')metadataOnly++;
    }
  }
  if(links.length===0)issues.push({code:'UNIDENTIFIED_MATERIAL',ref:'',
    message:'연결된 조사기록이 없습니다. 증빙만 등록했다고 사고조사가 완료되지 않습니다.',context:'fact'});
  return {totalLinks:links.length,linked,missing,mismatched,metadataOnly,issues,
    readyToRequestDemoReview:links.length>0&&missing===0&&mismatched===0};
}
