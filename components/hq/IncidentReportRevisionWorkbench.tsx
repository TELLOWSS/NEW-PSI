import React,{useMemo,useState,type FormEvent} from 'react';
import {
  CAUSE_LABELS,SIX_W_FIELDS,checkReportReadiness,diffReportVersions,
  emptySixW,recordReportVersion,reportAsText,
  type CauseKind,type CauseClaim,type IncidentReportVersion,type SixWFields
} from './incidentReportRevisionModel';
import type {EvidenceManifestRecord} from './evidenceManifestModel';
import type {InvestigationSequence} from './accidentSequenceModel';
import './IncidentReportRevisionWorkbench.css';

interface Props{
 selectedCaseId:number|null;
 evidence:readonly EvidenceManifestRecord[];
 sequence:InvestigationSequence|null;
 versions:readonly IncidentReportVersion[];
 onVersionsChange:(next:IncidentReportVersion[])=>void;
 readOnly?:boolean;
}
const id=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
const emptyCauses=():CauseClaim[]=>[
 {kind:'direct',description:'',sourceRefs:[]},
 {kind:'contributing',description:'',sourceRefs:[]},
 {kind:'root',description:'',sourceRefs:[]}
];
const localDate=()=>new Date().toISOString();
export default function IncidentReportRevisionWorkbench({
 selectedCaseId,evidence,sequence,versions,onVersionsChange,readOnly=false
}:Props):React.ReactElement {
 const [sixW,setSixW]=useState<SixWFields>(emptySixW);
 const [causes,setCauses]=useState<CauseClaim[]>(emptyCauses);
 const [openQuestions,setOpenQuestions]=useState('');
 const [preventionSummary,setPreventionSummary]=useState('');
 const [revisionReason,setRevisionReason]=useState('최초 검토 초안');
 const [compareId,setCompareId]=useState('');
 const [notice,setNotice]=useState('');
 const current=selectedCaseId ? {
  incidentId:selectedCaseId,sixW,causes,openQuestions,preventionSummary,revisionReason
 }:null;
 const readiness=useMemo(()=>current?checkReportReadiness(current,evidence,sequence):null,
  [selectedCaseId,sixW,causes,openQuestions,preventionSummary,revisionReason,evidence,sequence]);
 const latest=versions[versions.length-1];
 const previous=versions.find(v=>v.id===compareId)||(versions.length>1?versions[versions.length-2]:null);
 const differences=latest&&previous&&latest.id!==previous.id?diffReportVersions(previous,latest):[];
 const sourceChoices=evidence.map(e=>({value:e.ref,label:e.ref+' / '+e.kind+' / '+(e.sha256?'지문 기록':'번호만 기록')}));
 const changeCause=(kind:CauseKind,changes:Partial<CauseClaim>)=>{
  setCauses(old=>old.map(item=>item.kind===kind?{...item,...changes}:item));
 };
 const save=(event:FormEvent)=>{
  event.preventDefault();
  if(!current||readOnly)return;
  try{
   const next=recordReportVersion(versions,current,evidence,sequence,id(),localDate());
   onVersionsChange(next);
   setNotice('사고조사 버전 '+next.length+'을 현재 브라우저 세션에 등록했습니다. 본사 승인·원본 진위 확인은 아닙니다.');
  }catch(error){setNotice(error instanceof Error?error.message:'초안 버전을 만들 수 없습니다.');}
 };
 const loadVersion=(version:IncidentReportVersion)=>{
  if(readOnly)return;
  setSixW({...version.sixW});setCauses(version.causes.map(c=>({...c,sourceRefs:[...c.sourceRefs]})));
  setOpenQuestions(version.openQuestions);setPreventionSummary(version.preventionSummary);
  setRevisionReason('버전 '+version.version+' 검토 후 수정');
  setNotice('버전 내용을 편집 칸으로 불러왔습니다. 기존 버전은 유지되며 새로운 버전을 별도로 기록해야 합니다.');
 };
 const copy=async()=>{
  if(!latest)return;
  try{await navigator.clipboard.writeText(reportAsText(latest));setNotice('미승인·비식별 검토 초안을 복사했습니다.');}
  catch{setNotice('복사가 차단되었습니다. 아래 초안을 직접 선택해 복사하세요.');}
 };
 return <section className="hq-report-revision" aria-label="6하원칙 사고조사 보고서 버전 검토">
  <header className="hq-report-head">
   <div><span className="hq-eyebrow">SIX-W / TRACEABLE CAUSATION / VERSION COMPARISON</span>
    <h4>6하원칙 조사보고서·원인별 근거·개정 비교</h4>
    <p>사고보고서와 근거를 바탕으로 직접원인·기여요인·근본원인 가설을 구분합니다. 시연 초안은 실제 검토·승인을 대체하지 않습니다.</p>
   </div>
   <span>원본 검증·결재 전</span>
  </header>
  {selectedCaseId===null?<p className="hq-empty">사고 사례를 선택하면 6하원칙 조사 초안을 작성할 수 있습니다.</p>:<>
   <div className="hq-report-grid">
    <form className="hq-form" onSubmit={save}>
     <h4>사고경위 6하원칙</h4>
     {SIX_W_FIELDS.map(f=><label key={f.key}>{f.label} · {f.hint}
      <textarea rows={2} minLength={8} maxLength={600} required disabled={readOnly}
       value={sixW[f.key]} onChange={e=>setSixW(old=>({...old,[f.key]:e.target.value}))}
       placeholder={f.hint}/>
     </label>)}
     <h4>원인 분류 (확정 아님)</h4>
     {causes.map(c=><div key={c.kind} className="hq-report-cause">
      <strong>{CAUSE_LABELS[c.kind]}</strong>
      <label>원인 주장 또는 가설
       <textarea rows={2} minLength={8} maxLength={500} required disabled={readOnly}
        value={c.description} onChange={e=>changeCause(c.kind,{description:e.target.value})}/>
      </label>
      <label>근거 참조번호 (증빙대장에서 선택)
       <select value={c.sourceRefs[0]||''} disabled={readOnly}
        onChange={e=>changeCause(c.kind,{sourceRefs:e.target.value?[e.target.value]:[]})}>
        <option value="">자료 참조번호 선택</option>
        {sourceChoices.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
       </select>
      </label>
     </div>)}
     <label>미확인 사항·추가 조사 항목 <textarea required minLength={8} maxLength={500} rows={3} disabled={readOnly}
      value={openQuestions} onChange={e=>setOpenQuestions(e.target.value)}/></label>
     <label>재발방지 대책 핵심(검증 전) <textarea required minLength={8} maxLength={500} rows={3} disabled={readOnly}
      value={preventionSummary} onChange={e=>setPreventionSummary(e.target.value)}/></label>
     <label>버전 작성·수정 사유 <input required minLength={4} maxLength={200} disabled={readOnly}
      value={revisionReason} onChange={e=>setRevisionReason(e.target.value)}/></label>
     <button type="submit" disabled={readOnly||!readiness?.ready} className="hq-primary">조사보고서 미승인 버전 기록</button>
     {readOnly&&<p className="hq-hint">기존 조사 검토 요청 표시 상태에서 보고서 내용 추가를 잠급니다. 보완 상태로 되돌린 뒤 작성하세요.</p>}
    </form>
    <div className="hq-report-ledger">
     <h4>조사 자료충분성 확인</h4>
     <p className="hq-report-small">사고별 증빙대장과 행동 시퀀스가 먼저 등록되어야 합니다. 근거번호가 맞아도 실제 증거가 확인된 것은 아닙니다.</p>
     <div className="hq-report-score">
      <span>자료 참조번호 <strong>{readiness?.linkedRefs.length||0}</strong></span>
      <span>사고시퀀스 불일치 <strong>{readiness?.sequenceDiscrepancies||0}</strong></span>
      <span>조사보고서 버전 <strong>{versions.length}</strong></span>
     </div>
     {readiness?.messages.length?<ul className="hq-report-warnings">{readiness.messages.map((message,i)=><li key={i}>{message}</li>)}</ul>:
      <p className="hq-report-ready">입력 항목·자료번호의 형식 연결 조건이 충족되었습니다. 진위 검증과 공식 검토는 별도입니다.</p>}
     <h4>개정 이력·비교</h4>
     {versions.length===0?<p className="hq-empty">기록된 미승인 조사보고서 버전이 없습니다.</p>:<>
      <div className="hq-report-versions">
       {versions.map(v=><div key={v.id}>
        <strong>v{v.version} · {v.reason}</strong><small>{v.createdAt.slice(0,16).replace('T',' ')} / 검토 초안</small>
        <button type="button" disabled={readOnly} onClick={()=>loadVersion(v)}>이 버전을 편집칸으로 불러오기</button>
       </div>)}
      </div>
      {versions.length>1&&<label>최신 버전과 비교
       <select value={compareId} onChange={e=>setCompareId(e.target.value)}>
        <option value="">바로 이전 버전</option>
        {versions.slice(0,-1).map(v=><option key={v.id} value={v.id}>v{v.version} · {v.reason}</option>)}
       </select>
      </label>}
      {versions.length>1&&<div className="hq-report-changes">
       <h5>변경된 항목 {differences.length}건</h5>
       {differences.length===0?<p>작성 내용 변화 없음</p>:differences.map((item,i)=><article key={i}>
        <strong>{item.label}</strong><p>이전: {item.before}</p><p>변경: {item.after}</p>
       </article>)}
      </div>}
      <button className="hq-secondary" type="button" onClick={()=>void copy()}>최신 검토 초안 텍스트 복사</button>
      <pre className="hq-report-preview">{latest&&reportAsText(latest)}</pre>
     </>}
    </div>
   </div>
  </>}
  {notice&&<p role="status" className="hq-notice">{notice}</p>}
  <p className="hq-review-footnote">이 기록은 브라우저 메모리 전용입니다. 제출된 자료·작성자 신원·서명·독립검토·원본 보존·위험 제거·법정 신고·작업재개는 보증하지 않습니다.</p>
 </section>;
}
