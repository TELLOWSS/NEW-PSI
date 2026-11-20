import React,{useEffect,useMemo,useState,type FormEvent} from 'react';
import {
 addSequenceClaim,checkSequence,checkControlCoverage,createSequence,
 PHASE_LABELS,ACTION_LABELS,SOURCE_LABELS,WIRE_EXAMPLE,
 type CorrectiveCoverage,type EvidenceKind,type EventAction,type InvestigationSequence,
 type SequencePhase
} from './accidentSequenceModel';
import './IncidentSequenceWorkbench.css';

type CaseRef={id:number; date:string; zone:string; processId:string;summary:string};
type Props={
 selected:CaseRef|null;
 drafts:Record<number,InvestigationSequence>;
 onDraftsChange:(next:Record<number,InvestigationSequence>)=>void;
 controls:Record<number,CorrectiveCoverage[]>;
 onControlsChange:(next:Record<number,CorrectiveCoverage[]>)=>void;
 readOnly?:boolean;
};
const shortId=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);

export default function IncidentSequenceWorkbench({selected,drafts,onDraftsChange,controls,onControlsChange,readOnly=false}:Props):React.ReactElement{
 const [phase,setPhase]=useState<SequencePhase>('during');
 const [order,setOrder]=useState(1);
 const [action,setAction]=useState<EventAction>('unknown');
 const [source,setSource]=useState<EvidenceKind>('report');
 const [sourceRef,setSourceRef]=useState('');
 const [description,setDescription]=useState('');
 const [confidence,setConfidence]=useState<'documented'|'needs_confirmation'>('needs_confirmation');
 const [hazard,setHazard]=useState('');
 const [controlType,setControlType]=useState<CorrectiveCoverage['category']>('engineering');
 const [issue,setIssue]=useState('');
 const [measure,setMeasure]=useState('');
 const [controlRef,setControlRef]=useState('');
 const [notice,setNotice]=useState('');
 useEffect(()=>{
  setSourceRef('');setDescription('');setIssue('');setMeasure('');setControlRef('');setHazard('');setNotice('');
 },[selected?.id]);
 const draft=selected?(drafts[selected.id]||createSequence(selected.id)):null;
 const actions=selected?(controls[selected.id]||[]):[];
 const mismatches=useMemo(()=>draft?checkSequence(draft):[],[draft]);
 const controlWarnings=useMemo(()=>checkControlCoverage(hazard,actions),[hazard,actions]);
 const sorted=useMemo(()=>draft?[...draft.claims].sort((a,b)=>(
  ['before','during','after'].indexOf(a.phase)-['before','during','after'].indexOf(b.phase)
 )||a.order-b.order):[],[draft]);
 const addClaim=(event:FormEvent)=>{
  event.preventDefault();if(!selected||!draft||readOnly)return;
  try{
   const updated=addSequenceClaim(draft,{
    id:shortId(),incidentId:selected.id,phase,order,action,source,sourceRef,description,confidence
   });
   onDraftsChange({...drafts,[selected.id]:updated});
   setDescription('');setSourceRef('');setNotice('시퀀스 기록을 세션에 추가했습니다. 원본 검증·사고원인 확정은 수행되지 않았습니다.');
  }catch(error){setNotice(error instanceof Error?error.message:'등록에 실패했습니다.');}
 };
 const addControl=(event:FormEvent)=>{
  event.preventDefault();if(!selected||readOnly)return;
  const candidate:CorrectiveCoverage={category:controlType,issue:issue.trim().slice(0,300),
   measure:measure.trim().slice(0,300),reference:controlRef.trim().slice(0,120)};
  if(candidate.issue.length<8||candidate.measure.length<8||candidate.reference.length<4){
   setNotice('관련 원인·대책은 각각 8자 이상, 근거번호는 4자 이상 입력해야 합니다.');return;
  }
  onControlsChange({...controls,[selected.id]:[...actions,candidate]});
  setIssue('');setMeasure('');setControlRef('');
  setNotice('대책을 원인에 연결했습니다. 적합성·실제 이행 여부는 검증 전입니다.');
 };
 return <section className="hq-sequence" aria-label="사고 발생 경위 시퀀스 및 대책 정합성 검토">
  <div className="hq-sequence-header">
   <div><span className="hq-eyebrow">INCIDENT RECONSTRUCTION / SOURCE ATTRIBUTION</span>
    <h4>사고 발생 시퀀스·원인 대책 연결</h4>
    <p>사고보고서와 진술의 행동 시점·순서를 비교하고, 대책이 위험원 제거로 이어지는지 검토합니다.</p></div>
   <span>규칙 기반 검토 · AI 확정 아님</span>
  </div>
  {!selected?<p className="hq-empty">먼저 사고조사 대상 사례를 선택하세요. 비식별 시연용입니다.</p>:<>
   <div className="hq-sequence-grid">
    <form className="hq-form" onSubmit={addClaim}>
     <fieldset disabled={readOnly} className="hq-sequence-fieldset">
     <h4>사고 전·당시·직후 행동 기록</h4>
     <label>발생 구간
      <select value={phase} onChange={e=>setPhase(e.target.value as SequencePhase)}>
       {(Object.keys(PHASE_LABELS) as SequencePhase[]).map(x=><option key={x} value={x}>{PHASE_LABELS[x]}</option>)}
      </select>
     </label>
     <label>구간 내 동작 순서 <input type="number" min={0} max={99} value={order} onChange={e=>setOrder(Number(e.target.value))}/></label>
     <label>작업자 동작 분류
      <select value={action} onChange={e=>setAction(e.target.value as EventAction)}>
       {(Object.keys(ACTION_LABELS) as EventAction[]).map(x=><option key={x} value={x}>{ACTION_LABELS[x]}</option>)}
      </select>
     </label>
     <label>근거 종류
      <select value={source} onChange={e=>setSource(e.target.value as EvidenceKind)}>
       {(Object.keys(SOURCE_LABELS) as EvidenceKind[]).map(x=><option key={x} value={x}>{SOURCE_LABELS[x]}</option>)}
      </select>
     </label>
     <label>근거 자료번호·원본 위치 <input required maxLength={120} minLength={4} value={sourceRef}
       onChange={e=>setSourceRef(e.target.value)} placeholder="예: DEMO-REP-01 (실제 원본 입력 금지)"/></label>
     <label>설명 <textarea required rows={3} maxLength={400} minLength={8} value={description}
      onChange={e=>setDescription(e.target.value)} placeholder="동작·이동 방향·접촉 지점 등 구체적으로 기록"/></label>
     <label>자료 진위 확인
      <select value={confidence} onChange={e=>setConfidence(e.target.value as typeof confidence)}>
       <option value="needs_confirmation">원본 확인 필요</option>
       <option value="documented">자료번호 기록됨 (진위 확인 아님)</option>
      </select>
     </label>
     <button type="submit" className="hq-primary">시퀀스 항목 임시 등록</button>
     </fieldset>
    </form>
    <div className="hq-sequence-register">
     <h4>사고 행동 흐름 <small>{sorted.length}개 입력</small></h4>
     {sorted.length===0?<p className="hq-empty">현재 사고 시퀀스가 없습니다.</p>:sorted.map(c=><div key={c.id} className="hq-sequence-step">
      <b>{PHASE_LABELS[c.phase]} · {c.order}순서</b>
      <span>{ACTION_LABELS[c.action]} · {c.description}</span>
      <small>{SOURCE_LABELS[c.source]} / {c.sourceRef} / {c.confidence==='documented'?'자료번호 기록':'원본 확인 필요'}</small>
     </div>)}
     <h5>자료 간 차이·누락 검토 <small>{mismatches.length}항목</small></h5>
     {mismatches.length===0?<p className="hq-hint">현재 규칙에 해당하는 차이가 없습니다. 이는 사고 경위의 진위가 확인됐다는 뜻이 아닙니다.</p>:
      <ul className="hq-sequence-mismatch">{mismatches.map((item,i)=><li key={item.code+'-'+i}>
       <strong>{item.severity==='review'?'설명 불일치 의심':'확인 필요'}</strong> {item.message}
      </li>)}</ul>}
     <div className="hq-sequence-example">
      <strong>{WIRE_EXAMPLE.label}</strong>
      <p>기록 A: {WIRE_EXAMPLE.reported}</p>
      <p>기록 B: {WIRE_EXAMPLE.alternative}</p>
      <p>{WIRE_EXAMPLE.note}</p>
      <small>※ 통화상 설명을 데이터 입력 방식으로 설명한 예시이며, 현장조사 완료나 사고 원인 확정이 아닙니다.</small>
     </div>
    </div>
   </div>
   <div className="hq-sequence-grid hq-sequence-controls">
    <form className="hq-form" onSubmit={addControl}>
     <fieldset disabled={readOnly} className="hq-sequence-fieldset">
     <h4>원인과 개선대책 연결 검토</h4>
     <label>위험 발생 메커니즘 <textarea rows={2} minLength={8} maxLength={300} value={hazard}
      onChange={e=>setHazard(e.target.value)} placeholder="예: 데크 통로 바닥 돌출물에 와이어 걸림 가능성"/></label>
     <label>대책 유형 <select value={controlType} onChange={e=>setControlType(e.target.value as CorrectiveCoverage['category'])}>
      <option value="engineering">기술적</option><option value="management">관리적</option><option value="education">교육적</option>
     </select></label>
     <label>관련 원인·문제 <textarea required minLength={8} rows={2} maxLength={300} value={issue} onChange={e=>setIssue(e.target.value)}/></label>
     <label>예방·개선대책 <textarea required minLength={8} rows={2} maxLength={300} value={measure} onChange={e=>setMeasure(e.target.value)}/></label>
     <label>대책 근거번호 <input required minLength={4} maxLength={120} value={controlRef} onChange={e=>setControlRef(e.target.value)} placeholder="예: DEMO-ACT-01"/></label>
     <button type="submit" className="hq-primary">원인–대책 연결 임시 등록</button>
     </fieldset>
    </form>
    <div className="hq-sequence-register">
     <h4>예방대책 정합성 검토 <small>{actions.length}건</small></h4>
     {actions.map((c,i)=><div className="hq-sequence-step" key={i}>
      <b>{c.category==='engineering'?'기술적':c.category==='management'?'관리적':'교육적'} 대책</b>
      <span>원인: {c.issue}</span><span>대책: {c.measure}</span><small>참조: {c.reference} (실제 조치 검증 전)</small>
     </div>)}
     <h5>누락 및 편중 검토</h5>
     <ul className="hq-sequence-mismatch">{controlWarnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>
     <p className="hq-hint">기술·관리·교육 중 하나를 입력했다고 적합 판정하지 않습니다. 임시방호, 작업중지, 현장 확인과 효과검증은 별도의 승인 절차가 필요합니다.</p>
    </div>
   </div>
  </>}
  {notice&&<p role="status" className="hq-notice">{notice}</p>}
 </section>;
}
