import React,{useState,type FormEvent} from 'react';
import {
 appendIndependentReviewFeedback,checkIndependentReviewCycle,FEEDBACK_KIND_LABELS,
 planIndependentReview,reviewSimulationSummary,REVIEW_TOPIC_LABELS,
 type FeedbackKind,type IndependentReviewCycle,type ReviewTopic
} from './independentReviewCycleModel';
import type {IncidentReportVersion} from './incidentReportRevisionModel';
import './IndependentReviewWorkbench.css';

type Props={
 /** Remount on incident change, preventing unsaved cross-incident draft mixing. */
 key?:React.Key;
 incidentId:number|null;
 report:IncidentReportVersion|null;
 reportIsFresh:boolean;
 requestMarked:boolean;
 cycles:readonly IndependentReviewCycle[];
 onCyclesChange:(next:IndependentReviewCycle[])=>void;
};
const id=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);

export default function IndependentReviewWorkbench({
 incidentId,report,reportIsFresh,requestMarked,cycles,onCyclesChange
}:Props):React.ReactElement{
 const [authorCode,setAuthorCode]=useState('DEMO-AUTHOR01');
 const [siteReviewerCode,setSiteReviewerCode]=useState('DEMO-SITE02');
 const [hqReviewerCode,setHqReviewerCode]=useState('DEMO-HQ03');
 const [actor,setActor]=useState<'site'|'hq'>('site');
 const [kind,setKind]=useState<FeedbackKind>('question');
 const [topic,setTopic]=useState<ReviewTopic>('chronology');
 const [note,setNote]=useState('');
 const [sourceRef,setSourceRef]=useState('');
 const [notice,setNotice]=useState('');
 const active=cycles[cycles.length-1]||null;
 const cycleState=active?checkIndependentReviewCycle(active,report,reportIsFresh,requestMarked):null;
 const addCycle=(event:FormEvent<HTMLFormElement>)=>{
   event.preventDefault();
   if(!report||incidentId===null||!requestMarked||!reportIsFresh){
     setNotice('최신 사고조사 보고서를 먼저 등록하고 검토 요청 표시를 완료하세요.');return;
   }
   try{
    const created=planIndependentReview({
     incidentId,report,authorCode,siteReviewerCode,hqReviewerCode,
     cycleId:id(),createdAt:new Date().toISOString()
    });
    if(cycles.some(c=>c.id===created.id))throw new Error('검토 시연번호가 중복됐습니다.');
    if(active&&active.reportVersionId===created.reportVersionId&&cycleState?.ready){
     throw new Error('이미 해당 보고서 버전의 유효한 시연 검토계획이 있습니다.');
    }
    onCyclesChange([...cycles,created]);
    setNotice('독립 검토 역할 배정 계획을 임시 기록했습니다. 실제 직원에게 배정·통지되지 않습니다.');
   }catch(error){setNotice(error instanceof Error?error.message:'검토 계획을 등록하지 못했습니다.');}
 };
 const addFeedback=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!active||!report)return;
  try{
   const reviewerCode=actor==='site'?active.siteReviewerCode:active.hqReviewerCode;
   const updated=appendIndependentReviewFeedback(active,{
    id:id(),at:new Date().toISOString(),actorCode:reviewerCode,kind,topic,
    note,evidenceRef:sourceRef||null,report,reportIsFresh,requestMarked
   });
   onCyclesChange(cycles.map(c=>c.id===active.id?updated:c));
   setNote('');setSourceRef('');
   setNotice('시연 검토 의견을 추가했습니다. 실제 검토자가 작성했다는 증명이나 승인 기록이 아닙니다.');
  }catch(error){setNotice(error instanceof Error?error.message:'시연 검토 의견 등록 실패');}
 };
 const metrics=active?reviewSimulationSummary(active):null;
 const canRecord=Boolean(active&&cycleState?.ready);
 return <section className="hq-independent-review" aria-label="본사·현장 독립 검토 시연">
  <div className="hq-independent-header">
   <div><span className="hq-eyebrow">INDEPENDENT HUMAN REVIEW / PRE-AUTH PROTOTYPE</span>
    <h4>작성자·현장 검토자·본사 검토자 분리</h4>
    <p>서로 다른 역할로 사고경위에 대한 확인 질문·보완 의견을 남기는 시연 단계입니다.</p></div>
   <span>실제 계정 인증·결재 없음</span>
  </div>
  <p className="hq-independent-warning">
   이 화면의 DEMO 코드는 개인 로그인이나 실제 직원 신원을 확인하지 않습니다.
   기록한 의견은 법적·조직적 승인, 독립 조사 완료, 작업 재개 허가를 뜻하지 않습니다.
  </p>
  {incidentId===null?<p className="hq-empty">먼저 사고사례를 선택해 주세요.</p>:<>
   <div className="hq-independent-grid">
    <form className="hq-form" onSubmit={addCycle}>
     <h4>독립 검토 역할 계획</h4>
     <label>조사 작성자 시연 코드 <input required pattern="DEMO-[A-Z0-9]{3,18}" maxLength={23}
      value={authorCode} onChange={e=>setAuthorCode(e.target.value)} /></label>
     <label>현장 검토자 시연 코드 <input required pattern="DEMO-[A-Z0-9]{3,18}" maxLength={23}
      value={siteReviewerCode} onChange={e=>setSiteReviewerCode(e.target.value)} /></label>
     <label>본사 검토자 시연 코드 <input required pattern="DEMO-[A-Z0-9]{3,18}" maxLength={23}
      value={hqReviewerCode} onChange={e=>setHqReviewerCode(e.target.value)} /></label>
     <p className="hq-hint">세 코드는 모두 달라야 합니다. 실명·사번·근로자 정보는 입력하지 마세요.</p>
     <button className="hq-primary" type="submit" disabled={!report||!reportIsFresh||!requestMarked}>
      검토 역할 계획 임시 등록
     </button>
     {!requestMarked&&<p className="hq-hint">이전 단계에서 사고조사 검토 요청 표시가 필요합니다.</p>}
    </form>
    <div className="hq-independent-overview">
     <h4>시연 검토 상태</h4>
     {!active?<p className="hq-empty">등록된 검토 역할 계획이 없습니다.</p>:<>
      <div className="hq-independent-cards">
       <span>사고 <b>{active.incidentId}</b></span>
       <span>보고서 <b>v{active.reportVersion}</b></span>
       <span>현장 의견 <b>{metrics?.siteNotes||0}</b></span>
       <span>본사 의견 <b>{metrics?.hqNotes||0}</b></span>
      </div>
      <p className="hq-hint">작성: {active.authorCode} / 현장: {active.siteReviewerCode} / 본사: {active.hqReviewerCode}</p>
      {!cycleState?.ready&&<ul className="hq-independent-errors">{cycleState?.messages.map((message,i)=><li key={i}>{message}</li>)}</ul>}
      <p className="hq-hint">조사자료 변경 후에는 새로운 보고서 버전과 검토계획을 생성해야 합니다. 이전 의견은 시연 이력으로 유지됩니다.</p>
     </>}
     <h5>독립 검토 체크</h5>
     <div className="hq-independent-checks">
      <div><b>01</b> 작성자와 현장·본사 검토 역할 분리</div>
      <div><b>02</b> 사고보고서 최신 버전과 증빙 연결 확인</div>
      <div><b>03</b> 시퀀스·원인·개선대책에 대한 질문·보완</div>
      <div><b>04</b> 실제 서명·결재는 별도 인증 시스템에서 처리</div>
     </div>
    </div>
   </div>
   {active&&<>
    <form className="hq-independent-feedback" onSubmit={addFeedback}>
     <h4>검토자의 확인 질문·보완 의견 <small>시연 기록</small></h4>
     <div className="hq-independent-fields">
      <label>검토 역할 <select value={actor} onChange={e=>setActor(e.target.value as 'site'|'hq')}>
        <option value="site">현장 검토자</option><option value="hq">본사 검토자</option>
      </select></label>
      <label>의견 구분 <select value={kind} onChange={e=>setKind(e.target.value as FeedbackKind)}>
       {(Object.keys(FEEDBACK_KIND_LABELS) as FeedbackKind[]).map(x=><option key={x} value={x}>{FEEDBACK_KIND_LABELS[x]}</option>)}
      </select></label>
      <label>확인 대상 <select value={topic} onChange={e=>setTopic(e.target.value as ReviewTopic)}>
       {(Object.keys(REVIEW_TOPIC_LABELS) as ReviewTopic[]).map(x=><option key={x} value={x}>{REVIEW_TOPIC_LABELS[x]}</option>)}
      </select></label>
      <label>관련 근거 참조번호 <select value={sourceRef} onChange={e=>setSourceRef(e.target.value)}>
       <option value="">없음 / 추가자료 요구</option>
       {report?.evidenceRefs.map(x=><option key={x} value={x}>{x}</option>)}
      </select></label>
     </div>
     <label>확인·보완 의견 (8자 이상) <textarea rows={3} minLength={8} maxLength={500} required
      value={note} onChange={e=>setNote(e.target.value)} placeholder="예: 사고경위가 기립 도중인지, 이동 과정인지 현장 사진과 대조 필요" /></label>
     <button type="submit" className="hq-primary" disabled={!canRecord}>시연 검토 의견 기록</button>
     {!canRecord&&<p className="hq-hint">검토 요청 상태, 현재 보고서 버전, 근거의 최신성이 모두 일치해야 합니다.</p>}
    </form>
    <div className="hq-independent-history">
     <h4>사고별 검토 이력 <small>{cycles.length}개 계획 · 현재 {active.feedback.length}개 의견</small></h4>
     {cycles.map(c=><div key={c.id} className="hq-independent-cycle">
      <b>v{c.reportVersion} · 독립 검토 역할 계획</b><small>{c.createdAt.slice(0,16).replace('T',' ')} · 공식 배정 아님</small>
      {c.feedback.length===0?<p>아직 의견을 기록하지 않았습니다.</p>:<ol>{c.feedback.map(f=>
       <li key={f.id}><strong>{f.role==='site'?'현장':'본사'} / {FEEDBACK_KIND_LABELS[f.kind]}</strong>
        <span>{REVIEW_TOPIC_LABELS[f.topic]} — {f.note}</span>
        <small>{f.evidenceRef||'근거 추가 확인'} · {f.at.slice(0,16).replace('T',' ')}</small>
       </li>)}</ol>}
     </div>)}
    </div>
   </>}
  </>}
  {notice&&<p role="status" className="hq-notice">{notice}</p>}
  <p className="hq-review-footnote">실제 독립 검토자 신원·권한 확인, 자료 보존, 서명·승인 및 이행 확인은 서버 인증·RLS·불변 감사로그가 준비되기 전까지 불가능합니다.</p>
 </section>;
}
