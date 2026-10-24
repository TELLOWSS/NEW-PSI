import React from 'react';
import {contextStage,withContextStage,workStages} from '../../lib/inspector/analysisContext';
export default function InspectorContextHints({note,disabled,onChange}:{note:string;disabled:boolean;onChange:(note:string)=>void}){
    const selected=contextStage(note);
    return <fieldset className="si-context-hints" disabled={disabled}><legend>현재 작업 상태 <span>(선택 · 오인식 줄이기)</span></legend><div>{workStages.map(stage=><button type="button" className="si-btn" aria-pressed={stage===selected} key={stage} onClick={()=>onChange(withContextStage(note,stage))}>{stage}</button>)}</div><p className="si-caption">아는 상황만 한 번 눌러 주세요. 선택은 점검자 진술로 저장되며 사진의 사실로 단정하지 않습니다.</p></fieldset>;
}
