import React from 'react';
import type {InspectorAction} from '../../lib/inspector/types';
import {summarizeActionRadar} from '../../lib/inspector/actionRadar';
import {useInspectionDay} from './useInspectionDay';
import './inspector-action-radar.css';

export default function InspectorActionRadar({actions,disabled=false,onOpenActions,onOpenInbox}:{actions:readonly InspectorAction[];disabled?:boolean;onOpenActions?:()=>void;onOpenInbox?:()=>void}){
    const today=useInspectionDay();
    const summary=summarizeActionRadar(actions,today);
    return <section className="si-action-radar" role="region" aria-label="조치 관리 우선순위" data-action-radar="saved-only">
        <div className="si-action-radar-header">
            <div><p className="si-eyebrow">PSI · ACTION WATCH</p><h2>오늘 확인할 조치</h2></div>
            <span className="si-action-radar-scope">{today} · 한국시간 기준</span>
        </div>
        <p className="si-action-radar-lead" role="status">{summary.immediateMessage}</p>
        <dl className="si-action-radar-grid">
            {[
                {label:'기한 지남',value:summary.overdue,key:'overdue'},
                {label:'현장 재점검 대기',value:summary.awaitingReinspection,key:'review'},
                {label:'미조치',value:summary.open,key:'open'},
                {label:'재점검 확인',value:summary.verified,key:'verified'},
            ].map(row=><div key={row.key} className={'si-action-radar-metric is-'+row.key}><dt>{row.label}</dt><dd>{row.value}<small>건</small></dd></div>)}
        </dl>
        {(summary.dueToday>0||summary.missingAssignment>0)&&<p className="si-action-radar-detail">
            {summary.dueToday>0&&<span>오늘 기한 {summary.dueToday}건 · 기한 초과 아님</span>}
            {summary.missingAssignment>0&&<span>담당·기한 확인 필요 {summary.missingAssignment}건</span>}
        </p>}
        {(onOpenActions||onOpenInbox)&&<div className="si-action-radar-actions">
            {onOpenActions&&<button className="si-btn si-primary" type="button" onClick={onOpenActions} disabled={disabled}>조치 관리 열기</button>}
            {onOpenInbox&&<button className="si-btn" type="button" onClick={onOpenInbox} disabled={disabled}>회신 기록 확인</button>}
        </div>}
        <p className="si-caption">{summary.scope} 저장된 회신이 없어도 요청이 실제로 전달되지 않았다고 단정할 수 없습니다.</p>
    </section>;
}
