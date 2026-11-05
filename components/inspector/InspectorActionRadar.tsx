import React,{useState} from 'react';
import type {InspectorAction,InspectionDocument} from '../../lib/inspector/types';
import {buildNextCycleHandoffDraft} from '../../lib/inspector/educationHandoff';
import {copyInspectorShareText,shareCopyResultMessage} from '../../lib/inspector/sharing';
import {selectPriorityAction,summarizeActionRadar} from '../../lib/inspector/actionRadar';
import {scheduledCorrectionRows,scheduledCorrectionTotals} from '../../lib/inspector/actionSchedule';
import {actionAttentionBoard,attentionLabels,attentionOrder,type AttentionKind} from '../../lib/inspector/actionAttention';
import {useInspectionDay} from './useInspectionDay';
import './inspector-action-radar.css';

export default function InspectorActionRadar({actions,document:doc,disabled=false,onOpenActions,onOpenInbox,onOpenPriorityAction}:{actions:readonly InspectorAction[];document?:InspectionDocument;disabled?:boolean;onOpenActions?:()=>void;onOpenInbox?:()=>void;onOpenPriorityAction?:(actionId:string)=>void}){
    const [copyFeedback,setCopyFeedback]=useState('');
    const [attentionView,setAttentionView]=useState<AttentionKind|null>(null);
    const today=useInspectionDay();
    const summary=summarizeActionRadar(actions,today);
    const priority=selectPriorityAction(actions,today);
    const schedule=scheduledCorrectionRows(actions,today);
    const scheduleCounts=scheduledCorrectionTotals(schedule);
    const attention=actionAttentionBoard(actions,today);
    const activeAttention=attentionView??attentionOrder.find(kind=>attention.groups[kind].length>0);
    const attentionRows=activeAttention?attention.groups[activeAttention]:[];
    const handoff=doc?buildNextCycleHandoffDraft(doc,today):'';
    return <section className="si-action-radar" role="region" aria-label="조치 관리 우선순위" data-action-radar="saved-only">
        <div className="si-action-radar-header">
            <div><p className="si-eyebrow">PSI · ACTION WATCH</p><h2>오늘 확인할 조치</h2></div>
            <span className="si-action-radar-scope">{today} · 한국시간 기준</span>
        </div>
        <p className="si-action-radar-lead" role="status">{summary.immediateMessage}</p>
        <section className="si-attention-board" aria-label="오늘의 미결 조치 확인" data-psi-attention-board="saved-only">
            <div className="si-attention-header"><b>오늘 먼저 볼 조치</b><span>미결 {attention.unresolved}건 중 확인 필요 {attention.uniqueAttention}건</span></div>
            <div className="si-attention-filters" role="group" aria-label="확인할 조치 분류">
                {attentionOrder.map(kind=><button type="button" key={kind} data-attention-filter={kind}
                  className={'si-attention-filter is-'+kind+(activeAttention===kind?' is-active':'')} aria-pressed={activeAttention===kind}
                  onClick={()=>setAttentionView(kind)}>
                    <span>{attentionLabels[kind]}</span><b>{attention.groups[kind].length}건</b>
                </button>)}
            </div>
            <p className="si-caption">확인 예정일은 기록된 계획일 뿐이며, 알림이 발송되거나 임시조치가 시행됐다는 뜻이 아닙니다. ‘오늘·미확인 현장 확인’에는 예정일이 지난 미확인 건도 포함됩니다.</p>
            {attention.overlap>0&&<p className="si-caption" data-attention-overlap="true" role="note">한 조치가 기한 경과·확인일 도래·재점검 대기 등에 중복 해당합니다. 분류별 숫자를 합산하지 마세요. (중복 집계 {attention.overlap}회)</p>}
            {activeAttention&&attentionRows.length>0?<div className="si-attention-results" role="region" aria-label={attentionLabels[activeAttention]+' 조치 목록'} aria-live="polite">
                <p className="si-attention-results-heading">{attentionLabels[activeAttention]} · 저장된 조치 {attentionRows.length}건</p>
                <ol>{attentionRows.map(row=><li key={row.actionId} data-attention-action-id={row.actionId}>
                    <div className="si-attention-item-heading"><b>{row.title}</b><span>{row.evidenceSubmitted?'개선사진 접수 · 재점검 미확인':'미조치 · 현장 상태 확인 전'}</span></div>
                    <p>담당 {row.owner?.trim()||'미지정'} · 약정 완료기한 {row.dueDate||'미지정'}{row.deadlineLate?' (기한 경과)':''}</p>
                    {row.checkDate&&<p>다음 현장 확인 예정 {row.checkDate}{row.checkLate?' · 예정일 지남 · 현장 확인 필요':''} · 이행 여부 미확인</p>}
                    <p className="si-attention-next">{row.evidenceSubmitted?'접수된 개선사진을 실제 현장과 대조하고 재점검 기록을 남기세요.':row.deadlineLate?'기한 경과 사유·보호조치 실제 시행 여부와 현장 상태를 확인하세요.':row.checkDate&&row.checkDate<=today?'현장 확인 예정일이 도래했습니다. 임시 보호조치 계획의 실제 이행 여부를 확인하세요.':'담당자와 현재 개선 진행상황 및 임시 보호조치를 확인하세요.'}</p>
                    {onOpenPriorityAction&&<button type="button" className="si-btn" disabled={disabled} onClick={()=>onOpenPriorityAction(row.actionId)}>이 조치 확인·재점검</button>}
                </li>)}</ol>
            </div>:<p className="si-attention-empty">{activeAttention?attentionLabels[activeAttention]+' 분류에 해당하는 저장 조치가 없습니다.':'현재 점검의 저장된 조치에서 오늘 확인할 네 분류의 항목이 없습니다.'} 향후 기한·미등록 위험과 현장 안전은 별도로 확인하세요.</p>}
            <p className="si-caption">이 화면은 <b>현재 점검 한 건</b>의 저장된 기록만 표시합니다. 다른 현장·다른 점검의 누락이나 실제 공유·회신·개선 완료를 판단하지 않습니다.</p>
        </section>
        <dl className="si-action-radar-grid">
            {[
                {label:'기한 지남',value:summary.overdue,key:'overdue'},
                {label:'기한 내 진행',value:summary.scheduled,key:'scheduled'},
                {label:'현장 재점검 대기',value:summary.awaitingReinspection,key:'review'},
                {label:'미조치',value:summary.open,key:'open'},
                {label:'재점검 확인',value:summary.verified,key:'verified'},
            ].map(row=><div key={row.key} className={'si-action-radar-metric is-'+row.key}><dt>{row.label}</dt><dd>{row.value}<small>건</small></dd></div>)}
        </dl>
        {schedule.length>0&&<details className="si-correction-schedule" data-psi-correction-schedule="saved-only">
            <summary>기한부 개선조치 일정 보기 · 미결 {scheduleCounts.unresolved}건</summary>
            <p className="si-caption">정기·컨설팅점검의 개선기한은 즉시조치 명령이 아닙니다. 개선사진 제출과 현장 재점검은 다른 단계입니다. 아래 상태는 저장한 현재 점검의 조치만 표시하며 실제 전송·시정·작업재개 여부는 확인하지 않습니다.</p>
            {scheduleCounts.overlappingPastDueReinspection>0&&<p className="si-caption" role="status">
                기한 경과와 재점검 대기가 함께 표시된 조치 {scheduleCounts.overlappingPastDueReinspection}건이 있습니다. 서로 다른 기준이므로 단순 합산하지 마세요. 사진의 실제 제출시점과 이행기한 준수 여부도 이 일정표만으로 판단할 수 없습니다.
            </p>}
            <ol className="si-correction-schedule-list">
                {schedule.map((row,index)=><li key={row.actionId} data-correction-kind={row.kind}>
                    <div className="si-correction-schedule-head">
                        <b>{index+1}. {row.title}</b>
                        <span>{row.deadlineLabel}</span>
                    </div>
                    <p>담당: {row.owner?.trim()||'미지정'} · 약정기한: {row.dueDate||'미지정'}</p>
                    <p><strong>{row.statusLabel}</strong> · {row.nextStep}</p>
                    {onOpenPriorityAction&&<button type="button" className="si-btn" disabled={disabled} onClick={()=>onOpenPriorityAction(row.actionId)}>이 조치 열기</button>}
                </li>)}
            </ol>
        </details>}
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
