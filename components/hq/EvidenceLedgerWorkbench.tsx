import React,{useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {
  addEvidenceRecord,calculateLocalFingerprint,checkEvidenceLinks,EVIDENCE_KINDS,MAX_DEMO_EVIDENCE_BYTES,
  type EvidenceLink,type EvidenceManifestRecord
} from './evidenceManifestModel';
import {SOURCE_LABELS,type EvidenceKind} from './accidentSequenceModel';
import './EvidenceLedgerWorkbench.css';

type CaseIdentity={id:number;summary:string};
interface Props {
 selected:CaseIdentity|null;
 records:Record<number,readonly EvidenceManifestRecord[]>;
 onRecordsChange:(next:Record<number,readonly EvidenceManifestRecord[]>)=>void;
 links:readonly EvidenceLink[];
 readOnly?:boolean;
}
export default function EvidenceLedgerWorkbench({
 selected,records,onRecordsChange,links,readOnly=false
}:Props):React.ReactElement {
 const [ref,setRef]=useState('DEMO-');
 const [kind,setKind]=useState<EvidenceKind>('report');
 const [note,setNote]=useState('');
 const [picked,setPicked]=useState<File|null>(null);
 const [notice,setNotice]=useState('');
 const [working,setWorking]=useState(false);
 const fileInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{
  setRef('DEMO-');setNote('');setPicked(null);setNotice('');
  if(fileInput.current)fileInput.current.value='';
 },[selected?.id]);
 const scoped=selected?(records[selected.id]||[]):[];
 const audit=useMemo(()=>selected?checkEvidenceLinks(selected.id,scoped,links):null,[selected,scoped,links]);
 const add=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();if(!selected||readOnly||working)return;
  setWorking(true);
  try{
   let sha256:string|null=null,byteCount:number|null=null;
   if(picked){
    const fingerprint=await calculateLocalFingerprint(picked);
    sha256=fingerprint.sha256;byteCount=fingerprint.byteCount;
   }
   const record:EvidenceManifestRecord={
    incidentId:selected.id,ref:ref.trim().toUpperCase(),kind,note,
    sha256,byteCount,recordedAt:new Date().toISOString(),
    status:picked?'local_fingerprint':'metadata_only'
   };
   const next=addEvidenceRecord(scoped,record);
   onRecordsChange({...records,[selected.id]:next});
   setRef('DEMO-');setNote('');setPicked(null);
   if(fileInput.current)fileInput.current.value='';
   setNotice(picked?'시연 파일의 SHA-256 지문만 임시 기록했습니다. 원본 진위·보존·송신은 수행하지 않았습니다.':
    '시연 자료번호만 등록했습니다. 파일 원본 존재 여부는 확인하지 않았습니다.');
  }catch(error){setNotice(error instanceof Error?error.message:'증빙 등록에 실패했습니다.');}
  finally{setWorking(false);}
 };
 return <section className="hq-evidence-ledger" aria-label="사고별 증빙자료 참조대장 시제품">
  <div className="hq-evidence-head">
   <div><span className="hq-eyebrow">EVIDENCE REFERENCE / NO CLOUD UPLOAD</span>
    <h4>사고별 증빙 참조대장·근거 연결 검증</h4>
    <p>사고보고서·진술·사진·작업계획서의 참조번호를 먼저 등록하고, 조사문장과 연결합니다.</p></div>
   <span>사내 검토 시연 · 원본 검증 아님</span>
  </div>
  {!selected?<p className="hq-empty">먼저 조사할 사고사례를 선택하세요.</p>:<>
   <p className="hq-evidence-warning">가상의 비식별 파일만 사용하세요. 파일을 선택하면 로컬 SHA-256 지문을 계산하지만 서버에 보내거나 파일을 보관하지 않습니다. 해시는 촬영 시점·원본 진위·보관 이력을 증명하지 않습니다.</p>
   <div className="hq-evidence-grid">
    <form className="hq-form" onSubmit={e=>void add(e)}>
     <h4>시연 증빙 참조 등록</h4>
     <label>자료번호 <input required minLength={9} maxLength={40} value={ref} onChange={e=>setRef(e.target.value)}
      placeholder="DEMO-PHOTO-001" disabled={readOnly||working}/></label>
     <label>자료 유형 <select value={kind} onChange={e=>setKind(e.target.value as EvidenceKind)} disabled={readOnly||working}>
      {EVIDENCE_KINDS.map(x=><option key={x} value={x}>{SOURCE_LABELS[x]}</option>)}
     </select></label>
     <label>비식별 자료 설명 <textarea required minLength={8} maxLength={180} rows={2} value={note}
      onChange={e=>setNote(e.target.value)} placeholder="자료의 성격·수집 목적만 작성 (실명/상병 입력 금지)" disabled={readOnly||working}/></label>
     <label>가상 파일 지문 계산 (선택)
      <input type="file" ref={fileInput} accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.json" disabled={readOnly||working}
       onChange={e=>{const next=e.currentTarget.files?.[0]||null;setPicked(next);setNotice('');}}/>
     </label>
     <p className="hq-hint">최대 {Math.round(MAX_DEMO_EVIDENCE_BYTES/1024/1024)}MiB · 파일명·내용 미저장 · 개인정보가 포함된 실제 사고자료는 절대 선택하지 마세요.</p>
     <button type="submit" className="hq-primary" disabled={readOnly||working}>
      {working?'로컬 지문 계산 중':'증빙 참조 임시 등록'}
     </button>
     {readOnly&&<p className="hq-hint">조사 검토 요청 중에는 등록을 잠급니다. 보완 상태로 변경한 뒤 수정할 수 있습니다.</p>}
    </form>
    <div className="hq-evidence-register">
     <h4>사고별 자료대장 <small>{scoped.length}건</small></h4>
     {!scoped.length?<p className="hq-empty">등록된 참조자료가 없습니다. 번호만 등록한 경우 실재 자료를 증명하지 못합니다.</p>:
      scoped.map(item=><article key={item.ref} className="hq-evidence-item">
       <div><b>{item.ref}</b><span>{SOURCE_LABELS[item.kind]}</span></div>
       <p>{item.note}</p>
       {item.sha256?<small>로컬 SHA-256: <code>{item.sha256}</code></small>:<small>원본 미첨부 · 메타데이터만 기록</small>}
       <small>{item.status==='local_fingerprint'?'선택 파일 지문만 계산됨':'자료번호만 기록'} · {item.recordedAt.slice(0,16).replace('T',' ')}</small>
      </article>)}
     <div className="hq-evidence-audit">
      <h5>조사 근거 연결 점검</h5>
      <div className="hq-evidence-counters">
       <span>참조 <b>{audit?.totalLinks||0}</b></span>
       <span>번호 연결 <b>{audit?.linked||0}</b></span>
       <span>번호 누락 <b>{audit?.missing||0}</b></span>
       <span>유형 불일치 <b>{audit?.mismatched||0}</b></span>
      </div>
      {audit?.issues.length?<ul>{audit.issues.map((item,i)=><li key={item.code+item.ref+i}>
       <b>{item.ref||'확인 필요'}</b> {item.message}</li>)}</ul>:
       <p>참조번호·자료유형의 형식상 연결이 확인되었습니다. 파일 진위 및 사고경위 검증은 별도입니다.</p>}
      {(audit?.metadataOnly||0)>0&&<p className="hq-hint">참조번호만 연결된 항목 {audit?.metadataOnly}건은 원본 실재 여부를 확인하지 않았습니다.</p>}
     </div>
    </div>
   </div>
  </>}
  {notice&&<p className="hq-notice" role="status">{notice}</p>}
 </section>;
}
