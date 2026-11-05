import React from 'react';
import type {ResultAction,ResultJourney} from '../../lib/inspector/resultJourney';

/** Read-only next-action navigator. Never approves AI, changes records, or emits a report itself. */
export default function InspectorResultJourney({journey,busy,onAction}:{journey:ResultJourney;busy:boolean;onAction:(action:ResultAction)=>void}){
 const steps=[
  {title:'1. 사진·현장 확인',detail:journey.reviewStatus},
  {title:'2. 필요한 조치',detail:journey.actionStatus},
  {title:'3. 보고서',detail:journey.reportStatus},
 ];
 return <section className="si-result-journey" aria-label="점검 다음 단계" data-psi-report-journey="true">
  <div className="si-eyebrow">보고서까지 · 지금 할 일 하나</div><h2>{journey.title}</h2><p>{journey.description}</p>
  <div className="si-journey-actions">
   <button type="button" className="si-btn si-primary" disabled={busy} onClick={()=>onAction(journey.action)}>{journey.label}</button>
   {journey.secondary&&<button type="button" className="si-btn" disabled={busy} onClick={()=>onAction(journey.secondary!.action)}>{journey.secondary.label}</button>}
  </div>
  <ol className="si-journey-steps" aria-label="보고서까지의 진행 상태">
   {steps.map(step=><li key={step.title}><b>{step.title}</b><span>{step.detail}</span></li>)}
  </ol>
  <details>
   <summary>남은 사진·보고 기준 자세히 보기</summary>
   {journey.pendingPhotos.length>0&&<><h3>다음 검토 순서</h3><ol>{journey.pendingPhotos.map(row=><li key={row.id}><b>사진 {row.number} · {row.label}</b><span>{row.problem}</span></li>)}</ol><p className="si-caption">저장된 AI 제안의 우선순위이며 다시 분석하거나 일괄 승인하지 않습니다.</p></>}
   <p className="si-caption">보고서는 저장된 확인 내용을 정리합니다. 사진에 보이지 않는 위험, 실제 개선 완료, 위법 및 작업재개 승인을 자동 판단하지 않습니다.</p>
  </details>
 </section>;
}
