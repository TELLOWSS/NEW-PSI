import React from 'react';
import type {ResultAction,ResultJourney} from '../../lib/inspector/resultJourney';
export default function InspectorResultJourney({journey,busy,onAction}:{journey:ResultJourney;busy:boolean;onAction:(action:ResultAction)=>void}){
 return <section className="si-result-journey" aria-label="점검 다음 단계">
  <div className="si-eyebrow">이어서 할 일</div><h2>{journey.title}</h2><p>{journey.description}</p>
  <div className="si-journey-actions"><button type="button" className="si-btn si-primary" disabled={busy} onClick={()=>onAction(journey.action)}>{journey.label}</button>{journey.secondary&&<button type="button" className="si-btn" disabled={busy} onClick={()=>onAction(journey.secondary!.action)}>{journey.secondary.label}</button>}</div>
  <details><summary>현재 진행 상태 보기</summary><ol><li><b>1. 사진·현장 대조</b><span>{journey.reviewStatus}</span></li><li><b>2. 필요한 조치</b><span>{journey.actionStatus}</span></li><li><b>3. 검토용 보고서</b><span>{journey.reportStatus}</span></li></ol>{journey.pendingPhotos.length>0&&<><h3>다음 검토 순서</h3><ol>{journey.pendingPhotos.map(row=><li key={row.id}><b>사진 {row.number} · {row.label}</b><span>{row.problem}</span></li>)}</ol><p className="si-caption">저장된 AI 제안의 우선순위입니다. 사진을 다시 분석하거나 일괄 승인하지 않습니다.</p></>}<p className="si-caption">저장된 상태를 안내합니다. 사진에 보이지 않는 위험이나 실제 개선 완료를 대신 판단하지 않습니다.</p></details>
 </section>;
}
