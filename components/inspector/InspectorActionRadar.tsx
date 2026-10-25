import React,{useState} from 'react';
import type {InspectorAction,InspectionDocument} from '../../lib/inspector/types';
import {buildNextCycleHandoffDraft} from '../../lib/inspector/educationHandoff';
import {copyInspectorShareText,shareCopyResultMessage} from '../../lib/inspector/sharing';
import {selectPriorityAction,summarizeActionRadar} from '../../lib/inspector/actionRadar';
import {useInspectionDay} from './useInspectionDay';
import './inspector-action-radar.css';

export default function InspectorActionRadar({actions,document:doc,disabled=false,onOpenActions,onOpenInbox,onOpenPriorityAction}:{actions:readonly InspectorAction[];document?:InspectionDocument;disabled?:boolean;onOpenActions?:()=>void;onOpenInbox?:()=>void;onOpenPriorityAction?:(actionId:string)=>void}){
    const [copyFeedback,setCopyFeedback]=useState('');
    const today=useInspectionDay();
    const summary=summarizeActionRadar(actions,today);
    const priority=selectPriorityAction(actions,today);
    const handoff=doc?buildNextCycleHandoffDraft(doc,today):'';
    return <section className="si-action-radar" role="region" aria-label="조치 관리 우선순위" data-action-radar="saved-only">
        <div className="si-action-radar-header">
            <div><p className="si-eyebrow">PSI · ACTION WATCH</p><h2>오늘 확인할 조치</h2></div>
            <span className="si-action-radar-scope">{today} · 한국시간 기준</span>
        </div>
        <p className="si-action-radar-lead" role="status">{summary.immediateMessage}</p>
        <dl className="si-action-radar-grid">
            {[
                {label:'기한 지남',value:summary.overdue,key:'overdue'},
                {label:'기한 내 진행',value:summary.scheduled,key:'scheduled'},
                {label:'현장 재점검 대기',value:summary.awaitingReinspection,key:'review'},
                {label:'미조치',value:summary.open,key:'open'},
                {label:'재점검 확인',value:summary.verified,key:'verified'},
            ].map(row=><div key={row.key} className={'si-action-radar-metric is-'+row.key}><dt>{row.label}</dt><dd>{row.value}<small>건</small></dd></div>)}
        </dl>
        {(summary.dueToday>0||summary.missingAssignment>0)&&<p className="si-action-radar-detail">
            {summary.dueToday>0&&<span>오늘 기한 {summary.dueToday}건 · 기한 초과 아님</span>}
            {summary.missingAssignment>0&&<span>담당·기한 확인 필요 {summary.missingAssignment}건</span>}
        </p>}
        {priority&&onOpenPriorityAction&&<p className="si-caption" data-priority-action-id={priority.actionId}><b>가장 먼저 볼 저장 조치:</b> {priority.title} · {priority.reason==='overdue'?'기한 지남':priority.reason==='reinspection'?'현장 재점검 대기':priority.reason==='assignment'?'담당·기한 확인 필요':'조치 진행 확인'}</p>}
        {(onOpenActions||onOpenInbox||onOpenPriorityAction)&&<div className="si-action-radar-actions">
            {priority&&onOpenPriorityAction
                ?<button className="si-btn si-primary" type="button" onClick={()=>onOpenPriorityAction(priority.actionId)} disabled={disabled}>우선 조치 바로 확인</button>
                :onOpenActions&&<button className="si-btn si-primary" type="button" onClick={onOpenActions} disabled={disabled}>조치 관리 열기</button>}
            {onOpenInbox&&<button className="si-btn" type="button" onClick={onOpenInbox} disabled={disabled}>회신 기록 확인</button>}
        </div>}
        {doc&&actions.length>0&&<details className="si-action-handoff">
            <summary>교육·다음 위험성평가 전달 초안</summary>
            <p className="si-caption">저장한 조치 기록을 바탕으로 작성한 검토용 문구입니다. PSI 지표·다국어 교육·별도 SMART TBM에 자동 전송하거나 승인 처리하지 않습니다. 개인 이름·위치·민감정보를 확인하고 필요한 부분만 전달하세요.</p>
            <label className="si-label">전달 전 수정·선택할 참고 문구
                <textarea aria-label="교육 및 다음 위험성평가 검토 초안" readOnly value={handoff} rows={9}/>
            </label>
            <button type="button" className="si-btn" disabled={disabled} onClick={()=>void copyInspectorShareText(handoff).then(result=>setCopyFeedback(shareCopyResultMessage[result]))}>검토 초안 복사</button>
            {copyFeedback&&<p className="si-caption" role="status">{copyFeedback}</p>}
        </details>}
        <p className="si-caption">컨설팅·정기점검의 기한부 조치는 당일·1일·2일·지정일로 약정할 수 있습니다. 단, 급박한 위험은 기한과 별개로 접근통제·작업중지 필요성을 현장 책임자가 먼저 검토해야 합니다. 기한이 남았다고 안전을 확정할 수 없습니다.</p>
        <p className="si-caption">{summary.scope} 저장된 회신이 없어도 요청이 실제로 전달되지 않았다고 단정할 수 없습니다.</p>
    </section>;
}
