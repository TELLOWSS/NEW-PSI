import React,{useState} from 'react';
import {analysisSupportText,type AnalysisHelp} from '../../lib/inspector/analysisHelp';
import type {InspectorAiCost} from '../../lib/inspector/aiCost';
export default function InspectorAnalysisHelp({help,code,cost,busy=false,retention,onRetry,onStored,onRefresh,onManual}:{help:AnalysisHelp;code?:string;cost?:InspectorAiCost;busy?:boolean;retention:string;onRetry?:()=>void;onStored?:()=>void;onRefresh?:()=>void;onManual?:()=>void}){
    const [support,setSupport]=useState(''),[copyState,setCopyState]=useState('');
    const copy=async()=>{const text=analysisSupportText(code,cost);setSupport(text);try{await navigator.clipboard.writeText(text);setCopyState('안내를 복사했습니다. 관리자에게 직접 전달해 주세요.');}catch{setCopyState('아래 안내를 선택해 복사한 뒤 관리자에게 전달해 주세요.');}};
    return <section className="si-analysis-help" aria-label="자동 분석 이용 안내">
        <h3>{help.title}</h3><p>{help.description}</p><p className="si-help-retention">{retention}</p>
        <div className="si-help-actions">
            {help.kind==='stored'&&onStored&&<button type="button" className="si-btn si-primary" disabled={busy} onClick={onStored}>저장 결과 먼저 확인</button>}
            {help.canRetry&&onRetry&&<button type="button" className="si-btn si-primary" disabled={busy} onClick={onRetry}>사진 분석 다시 시도</button>}
            {onManual&&(help.kind!=='stored'||help.manualAllowed)&&<button type="button" className="si-btn" disabled={busy} onClick={onManual}>직접 점검 계속하기</button>}
            {onRefresh&&<button type="button" className="si-btn" disabled={busy} onClick={onRefresh}>연결 상태 다시 확인</button>}
            <button type="button" className="si-btn" disabled={busy} onClick={()=>void copy()}>관리자에게 전달할 안내 복사</button>
        </div>
        {copyState&&<div><p role="status">{copyState} 자동으로 전송되지는 않습니다.</p><textarea aria-label="관리자에게 전달할 안내" readOnly value={support} rows={6} onFocus={e=>e.currentTarget.select()}/></div>}
        {help.canRetry&&<p className="si-caption">다시 시도하면 분석 이용 횟수를 사용합니다. 자동으로 재시도하지 않습니다.</p>}
        {onManual&&(help.kind!=='stored'||help.manualAllowed)&&<p className="si-caption">직접 점검은 사진을 자동 판독하지 않습니다. 확인한 내용으로 조치와 보고서를 작성하세요.</p>}
    </section>;
}
