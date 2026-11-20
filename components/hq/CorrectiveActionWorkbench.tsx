import React, {useMemo, useState, type FormEvent} from 'react';
import {
  ACTION_STATE_LABELS, CONTROL_CLASS_LABELS, createCorrectiveAction,
  overdueActions, recordInterimControl, requestActionReinspection,
  requestActionRevision, submitActionEvidence,
  type ControlClass, type CorrectiveAction
} from './correctiveActionModel';
import './CorrectiveActionWorkbench.css';

export interface CaseOption {
  id: number;
  date: string;
  zone: string;
  process: string;
  summary: string;
}
interface Props { cases: readonly CaseOption[]; onOpenCases:()=>void }
const eventId = () => 'synthetic-' + Date.now() + '-' + Math.random().toString(36).slice(2,9);
const localDate = () => {
  const t = new Date();
  return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0,10);
};

/** Session-only UI: an action may be submitted for reinspection but NEVER automatically verified. */
export default function CorrectiveActionWorkbench({cases,onOpenCases}:Props):React.ReactElement {
  const [actions,setActions] = useState<CorrectiveAction[]>([]);
  const [caseId,setCaseId] = useState<number | null>(null);
  const [selectedId,setSelectedId] = useState<string | null>(null);
  const [title,setTitle] = useState('');
  const [controlClass,setControlClass] = useState<ControlClass>('engineering');
  const [ownerRole,setOwnerRole] = useState<CorrectiveAction['ownerRole']>('현장 담당자');
  const [dueOn,setDueOn] = useState(localDate);
  const [interim,setInterim] = useState('');
  const [evidenceRef,setEvidenceRef] = useState('');
  const [implementationNote,setImplementationNote] = useState('');
  const [revisionReason,setRevisionReason] = useState('');
  const [notice,setNotice] = useState('');
  const selected=actions.find(x=>x.id===selectedId);
  const visible=useMemo(()=>actions.filter(a=>cases.some(c=>c.id===a.incidentId)),[actions,cases]);
  const overdue=useMemo(()=>overdueActions(visible,localDate()),[visible]);
  const addAction=(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    if(caseId===null || !cases.some(c=>c.id===caseId)){
      setNotice('먼저 사고사례를 선택하세요.');return;
    }
    try {
      const id=eventId();
      const created=createCorrectiveAction({id,incidentId:caseId,title,controlClass,ownerRole,dueOn},eventId(),new Date().toISOString());
      setActions(prev=>[created,...prev]);
      setSelectedId(created.id);setTitle('');setNotice('새 개선조치 계획을 세션에 등록했습니다. 실제 DB에 저장되지 않습니다.');
    }catch(error){setNotice(error instanceof Error?error.message:'등록하지 못했습니다.');}
  };
  const advance=(transition:(action:CorrectiveAction,id:string,at:string)=>CorrectiveAction,success:string)=>{
    if(!selected)return;
    try{
      const updated=transition(selected,eventId(),new Date().toISOString());
      setActions(prev=>prev.map(a=>a.id===selected.id?updated:a));
      setNotice(success+' 실제 조치 완료나 현장 재점검을 증명하지 않습니다.');
    }catch(error){setNotice(error instanceof Error?error.message:'상태를 변경하지 못했습니다.');}
  };
  const selectAction=(id:string)=>{
    setSelectedId(id);setInterim('');setEvidenceRef('');setImplementationNote('');setRevisionReason('');setNotice('');
  };
  return <section className="hq-actions" aria-label="사고별 개선조치 및 재점검 시제품">
    <div className="hq-action-metrics">
      <div><span>조치 계획</span><b>{visible.length}</b><small>현재 세션</small></div>
      <div><span>이행자료 제출</span><b>{visible.filter(a=>a.state==='evidence_submitted').length}</b><small>실제 검증 전</small></div>
      <div><span>재점검 요청 표시</span><b>{visible.filter(a=>a.state==='reinspection_requested').length}</b><small>실제 통지 아님</small></div>
      <div><span>기한 경과·미종결</span><b>{overdue}</b><small>확정 완료 처리 없음</small></div>
    </div>
    <p className="hq-actions-disclaimer">작업 완료 사진·자료를 제출했다고 안전조치가 검증되는 것은 아닙니다. 이 시제품에는 실제 완료·작업재개 승인 기능이 없습니다.</p>
    <div className="hq-action-layout">
      <form className="hq-form" onSubmit={addAction}>
        <h4>사고사례별 개선조치 등록</h4>
        <label>대상 사고사례
          <select value={caseId ?? ''} onChange={e=>setCaseId(e.target.value?Number(e.target.value):null)} required>
            <option value="">사례 선택</option>
            {cases.map(c=><option key={c.id} value={c.id}>{c.date} / {c.zone} / {c.process}</option>)}
          </select>
        </label>
        {cases.length===0 && <p className="hq-empty">연결된 사고사례가 없습니다. 먼저 비식별 사고사례를 등록해 주세요.</p>}
        <label>조치 유형
          <select value={controlClass} onChange={e=>setControlClass(e.target.value as ControlClass)}>
            {(Object.keys(CONTROL_CLASS_LABELS) as ControlClass[]).map(c=><option key={c} value={c}>{CONTROL_CLASS_LABELS[c]}</option>)}
          </select>
        </label>
        <label>개선조치 계획 (8자 이상)
          <textarea rows={3} minLength={8} maxLength={280} value={title} onChange={e=>setTitle(e.target.value)} required placeholder="위험요인과 구체적인 제거·저감조치를 적으세요"/>
        </label>
        <label>담당 역할
          <select value={ownerRole} onChange={e=>setOwnerRole(e.target.value as CorrectiveAction['ownerRole'])}>
            <option>현장 담당자</option><option>현장 안전관리자</option><option>본사 안전담당자</option>
          </select>
        </label>
        <label>조치 기한 <input type="date" required value={dueOn} onChange={e=>setDueOn(e.target.value)}/></label>
        <button type="submit" className="hq-primary" disabled={cases.length===0}>개선조치 계획 임시 등록</button>
        <p className="hq-hint">담당 역할과 기한은 개발 시연값입니다. 실제 알림이나 담당자 배정이 발생하지 않습니다.</p>
      </form>
      <div className="hq-action-list">
        <h4>개선조치 현황 <small>{visible.length}건</small></h4>
        {visible.length===0 && <p className="hq-empty">아직 등록한 개선조치 계획이 없습니다.</p>}
        {visible.map(a=><button type="button" key={a.id} className={'hq-action-option'+(selectedId===a.id?' selected':'')} onClick={()=>selectAction(a.id)} aria-pressed={selectedId===a.id}>
          <strong>{a.title}</strong><small>{cases.find(c=>c.id===a.incidentId)?.process} · {CONTROL_CLASS_LABELS[a.controlClass]}</small>
          <span>{ACTION_STATE_LABELS[a.state]} · 기한 {a.dueOn}{a.dueOn<localDate()?' · 기한 경과':''}</span>
        </button>)}
      </div>
    </div>
    {selected && <div className="hq-action-detail" aria-label="선택한 개선조치의 재점검 흐름">
      <div className="hq-review-heading"><div><span className="hq-eyebrow">CORRECTIVE ACTION / REINSPECTION</span><h4>{selected.title}</h4></div><span className="hq-review-status">{ACTION_STATE_LABELS[selected.state]}</span></div>
      <div className="hq-action-steps">
        <div><b>01</b> 계획 등록</div><div><b>02</b> 임시통제 기록</div><div><b>03</b> 이행자료 제출</div><div><b>04</b> 재점검 요청</div><div><b>05</b> 검토·보완</div>
      </div>
      <div className="hq-action-detail-fields">
        {['open','interim_control','revision_required'].includes(selected.state) && <>
          <div className="hq-action-control">
            <h5>임시통제 내용 기록</h5>
            <p>개선 전 위험 노출이 지속되는 경우 임시통제·접근제한·작업조정 상황을 명시합니다.</p>
            <textarea rows={3} minLength={8} maxLength={500} value={interim} onChange={e=>setInterim(e.target.value)} placeholder="임시통제 내용(8자 이상)"/>
            <button className="hq-secondary" type="button" onClick={()=>advance((a,id,at)=>recordInterimControl(a,interim,id,at),'임시통제를 기록했습니다.')}>임시통제 기록</button>
          </div>
          <div className="hq-action-control">
            <h5>개선 이행자료 제출</h5>
            <p>자료번호는 원본 증빙의 참조값이며, 번호만으로 실제 완료 여부를 확인하지 않습니다.</p>
            <input maxLength={180} value={evidenceRef} onChange={e=>setEvidenceRef(e.target.value)} placeholder="증빙 참조번호(예: ACT-001)"/>
            <textarea rows={3} minLength={8} maxLength={500} value={implementationNote} onChange={e=>setImplementationNote(e.target.value)} placeholder="조치 이행내용(8자 이상)"/>
            <button className="hq-primary" type="button" onClick={()=>advance((a,id,at)=>submitActionEvidence(a,evidenceRef,implementationNote,id,at),'이행자료를 제출 표시했습니다.')}>이행자료 임시 제출</button>
          </div>
        </>}
        {selected.state==='evidence_submitted' && <div className="hq-action-control">
          <h5>재점검 요청</h5><p>증빙자료 접수 상태입니다. 사람의 현장 확인이 별도로 필요합니다.</p>
          <button className="hq-primary" type="button" onClick={()=>advance(requestActionReinspection,'재점검 요청 상태로 전환했습니다.')}>재점검 요청 표시</button>
        </div>}
        {['evidence_submitted','reinspection_requested'].includes(selected.state) && <div className="hq-action-control">
          <h5>보완 요구</h5>
          <input maxLength={300} value={revisionReason} onChange={e=>setRevisionReason(e.target.value)} placeholder="보완 사유(4자 이상)"/>
          <button className="hq-secondary" type="button" onClick={()=>advance((a,id,at)=>requestActionRevision(a,revisionReason,id,at),'보완 요청 상태로 변경했습니다.')}>보완 요청 표시</button>
        </div>}
        {selected.interimDescription && <div className="hq-action-control"><h5>기록된 임시통제</h5><p>{selected.interimDescription}</p></div>}
        {selected.implementationEvidence && <div className="hq-action-control"><h5>마지막 이행자료</h5><p>{selected.implementationEvidence} · {selected.implementationNote}</p></div>}
      </div>
      <div className="hq-review-history"><h5>변경 이력 (시연 기록)</h5>
        <ol>{selected.events.map(e=><li key={e.id}>{e.at.slice(0,16).replace('T',' ')} · {e.note}</li>)}</ol>
      </div>
    </div>}
    {notice&&<p role="status" className="hq-notice">{notice}</p>}
    <p className="hq-review-footnote">모든 기록은 이 화면을 닫거나 새로고침하면 사라집니다. 실제 이행 확인, 재점검, 안전조치 승인, 법정 의무의 이행을 대신할 수 없습니다.</p>
    {cases.length===0&&<button className="hq-secondary" type="button" onClick={onOpenCases}>사고사례 임시 등록 화면으로 이동</button>}
  </section>;
}
