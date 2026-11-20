import React,{useMemo,useState} from 'react';
import {buildSiteTrainingBrief,type BriefingIncident,type BriefingProcess,type BriefingAction,type BriefingVisit} from './siteTrainingBriefModel';
import './SiteTrainingWorkbench.css';

type Props={incidents:readonly BriefingIncident[];processes:readonly BriefingProcess[];
 actions:readonly BriefingAction[];visits:readonly BriefingVisit[]};
const dateToday=()=>{
 const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
};
export default function SiteTrainingWorkbench({incidents,processes,actions,visits}:Props):React.ReactElement {
 const [siteAlias,setSiteAlias]=useState('');
 const [year,setYear]=useState(2026);
 const [visitDate,setVisitDate]=useState(dateToday);
 const [stageNote,setStageNote]=useState('');
 const [notice,setNotice]=useState('');
 const siteOptions=useMemo(()=>[...new Set([...incidents.map(i=>i.siteAlias),...visits.map(v=>v.site)])].filter(Boolean).sort(),[incidents,visits]);
 const built=useMemo(()=>{
  try{return {value:buildSiteTrainingBrief({siteAlias,year,visitDate,stageNote,incidents,processes,actions,visits}),error:''};}
  catch(e){return {value:null,error:e instanceof Error?e.message:'입력을 확인하세요.'};}
 },[siteAlias,year,visitDate,stageNote,incidents,processes,actions,visits]);
 const copy=async()=>{
  if(!built.value)return;
  try{await navigator.clipboard.writeText(built.value.report);setNotice('현장별 교육자료 검토 초안을 복사했습니다. 공식 승인 문서가 아닙니다.');}
  catch{setNotice('복사할 수 없습니다. 아래 교육자료 본문을 직접 복사해 주세요.');}
 };
 return <div className="hq-training-brief" aria-label="대표이사 현장별 안전교육 사전편성">
  <div className="hq-training-brief-heading">
   <span className="hq-eyebrow">EXECUTIVE SITE-SPECIFIC EDUCATION</span>
   <h4>대표이사·본사 현장 맞춤 안전교육 준비</h4>
   <p>방문 현장과 사고자료 연도, 공정 진행 상황을 먼저 선택한 뒤 교육용 검토 초안을 구성합니다. 사고조사 미확정 내용은 사실로 확정하지 않습니다.</p>
  </div>
  <div className="hq-training-brief-layout">
   <div className="hq-form">
    <h4>현장별 자료 편성 조건</h4>
    <label>교육 대상 현장 구분명
     <input maxLength={40} value={siteAlias} onChange={e=>setSiteAlias(e.target.value)} placeholder="예: A현장 (가상 별칭만 입력)" list="hq-site-aliases"/>
     <datalist id="hq-site-aliases">{siteOptions.map(s=><option key={s} value={s}/>)}</datalist>
    </label>
    <label>사고사례 자료 연도
     <input type="number" min={2020} max={2100} value={year} onChange={e=>setYear(Number(e.target.value))}/>
    </label>
    <label>대표이사 교육 예정일 <input type="date" value={visitDate} onChange={e=>setVisitDate(e.target.value)}/></label>
    <label>현장 공사진행 현황(확인 전 입력)
     <textarea rows={3} maxLength={240} value={stageNote} onChange={e=>setStageNote(e.target.value)}
      placeholder="예: 지하 합벽 시공 중 / 지상층 AL폼 설치 중 — 실제 현장진행 검증 전"/>
    </label>
    {siteAlias&&<p className="hq-hint">동일 현장 별칭으로 등록한 사고 중 해당 연도 자료만 편성합니다. 별칭은 로그인된 실제 현장ID가 아닙니다.</p>}
    <button type="button" className="hq-primary" onClick={()=>void copy()} disabled={!built.value}>교육 검토 초안 복사</button>
   </div>
   <div className="hq-training-brief-preview">
    <h4>교육자료 사전 편성 현황</h4>
    {!built.value?<p className="hq-empty">{built.error||'현장과 교육일을 입력해 주세요.'}</p>:<>
     <div className="hq-training-brief-metrics">
      <div><span>해당 현장·연도 사고등록</span><strong>{built.value.caseCount}건</strong></div>
      <div><span>다른 현장 자료 제외</span><strong>{built.value.otherSiteRecordsExcluded}건</strong></div>
      <div><span>교육자료 상태</span><strong>{built.value.status==='review_draft'?'내부 검토 초안':'추가 자료 필요'}</strong></div>
     </div>
     <h5>월별 사고사례 등록 현황</h5>
     <div className="hq-month-chart">
      {built.value.monthlyCounts.map((count,i)=><div key={i}>
       <b>{i+1}월</b><span style={{height:(8+Math.min(count,12)*8)+'px'}}/><small>{count}</small>
      </div>)}
     </div>
     <h5>현장별 공사구간</h5>
     <div className="hq-training-zone-row">{built.value.zoneBreakdown.map(v=><span key={v.zone}>{v.zone} <b>{v.cases}</b></span>)}</div>
     <h5>교육안 본문 · 공식 승인 전</h5>
     <pre>{built.value.report}</pre>
     <details><summary>자료 검증·보고 유의사항</summary><ul>{built.value.sourceWarnings.map(w=><li key={w}>{w}</li>)}</ul></details>
    </>}
   </div>
  </div>
  {notice&&<p className="hq-notice" role="status">{notice}</p>}
 </div>;
}
