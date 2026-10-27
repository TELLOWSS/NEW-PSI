import React,{useId} from 'react';
import {LEGAL_CARDS,legalForTopics} from '../../lib/inspector/legal';
import InspectorLegalResult from './InspectorLegalResult';

const workTypes=['형틀','철근','시스템비계','시스템동바리','콘크리트 타설','양중','해체작업','기타'];
/** Controls for the existing document and per-photo inspector statement. */
export default function InspectorManualContext({workType,topic,showTopic,disabled,eventAt,onWorkType,onTopic}:{
    workType:string;topic:string;showTopic:boolean;disabled:boolean;eventAt?:string;
    onWorkType:(value:string)=>void;onTopic:(value:string)=>void;
}){
    const id=useId(),choices=workType&&!workTypes.includes(workType)?[workType,...workTypes]:workTypes;
    const reference=topic?legalForTopics([topic],eventAt):null;
    return <fieldset disabled={disabled} className="si-manual-context">
        <legend>기본 점검 · 직접 확인</legend>
        <p className="si-caption">공종과 위험은 점검자가 선택한 진술입니다. AI 판정·법 위반 확정이 아니며, 모르면 미선택으로 둘 수 있습니다.</p>
        <p className="si-caption">공종은 이 점검 전체에 적용됩니다. 위험유형은 현재 사진에만 기록됩니다.</p>
        <label className="si-topic-select" htmlFor={id+'work'}>공종<select id={id+'work'} aria-label="공종" value={workType} onChange={e=>onWorkType(e.target.value)}><option value="">미선택 · 확인 필요</option>{choices.map(value=><option key={value}>{value}</option>)}</select></label>
        {showTopic&&<>
            <label className="si-topic-select" htmlFor={id+'risk'}>직접 확인한 위험유형<select id={id+'risk'} aria-label="직접 확인한 위험유형" value={topic} onChange={e=>onTopic(e.target.value)}><option value="">미선택 · 설명으로 기준 조회</option>{LEGAL_CARDS.filter(card=>card.sourceReview?.status!=='withdrawn').map(card=><option key={card.id} value={card.id}>{card.title}</option>)}</select></label>
            {reference&&<details><summary>선택한 위험의 법령·사례·동향 확인</summary><InspectorLegalResult reference={reference}/>{!reference.inspectionCases?.length&&<p className="si-caption">확인 필요 · 이 주제와 연결된 사례는 현재 수록되어 있지 않습니다.</p>}{!reference.recentTrends?.length&&<p className="si-caption">확인 필요 · 이 주제와 연결된 동향은 현재 수록되어 있지 않습니다.</p>}</details>}
        </>}
    </fieldset>;
}
