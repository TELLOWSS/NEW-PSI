import InspectorAiCostNotice from './InspectorAiCostNotice';
import {normalizeAiCost,type InspectorAiCost} from '../../lib/inspector/aiCost';
import React, {useState} from 'react';
import {InspectorIcon} from './InspectorGraphics';

type Props={busy:boolean;dirty:boolean;apiEnabled:boolean;apiReady:boolean|null;apiCost?:InspectorAiCost;consent:boolean;photoUrl:string;prompt:string;text:string;
    onManual:()=>void;retention:string;onConsent:(checked:boolean)=>void;onText:(value:string)=>void;onAnalyze:()=>void;onCopyPhoto:()=>void;onCopyPrompt:()=>void;onImport:()=>void;onSave:()=>void;onRefresh:()=>void};
export default function InspectorAnalysisInput(props:Props) {
    const [method,setMethod]=useState<'api'|'manual'>('api');
    const {busy,dirty,apiReady,consent,photoUrl}=props;
    return <section className="si-analysis-input" aria-label="분석 방법 선택">
        <div className="si-methods"><button className={method==='api'?'is-active':''} aria-pressed={method==='api'} disabled={busy} onClick={()=>setMethod('api')}><InspectorIcon name="layers"/><strong>앱에서 바로 분석</strong><span>결과 확인 후 조치·보고서 작성</span></button><button className={method==='manual'?'is-active':''} aria-pressed={method==='manual'} disabled={busy} onClick={()=>setMethod('manual')}><InspectorIcon name="document"/><strong>ChatGPT로 직접 분석</strong><span>사진과 표준 질문 전달 후 답변 가져오기</span></button></div>
        <label className="si-check"><input type="checkbox" disabled={busy} checked={consent} onChange={e=>props.onConsent(e.target.checked)}/>외부 AI 분석이 허용된 사진이며 불필요한 식별정보를 처리했습니다.</label>
        {method==='api'?<div className="si-api-start">
            <h3>사진과 설명을 보내고 결과를 바로 확인하세요</h3>
            <p className="si-caption">AI 결과는 관찰·추론·개선 권고로 구분됩니다. 분석 후 현장 상황과 대조해 주세요.</p>
            {apiReady===null?<InspectorAiCostNotice checking cost={props.apiCost} retention={props.retention} busy={busy} onRefresh={props.onRefresh} onManual={props.onManual}/>:apiReady===false?<InspectorAiCostNotice cost={props.apiCost} ready={false} retention={props.retention} busy={busy} onRefresh={props.onRefresh} onManual={props.onManual}/>:<>
                {!consent&&<p className="si-caption">위의 사진 사용 확인을 체크하면 분석 버튼을 사용할 수 있습니다.</p>}
                <InspectorAiCostNotice cost={props.apiCost} retention={props.retention} onManual={props.onManual} busy={busy} onRefresh={props.onRefresh}/><button className="si-btn si-primary" disabled={busy || !consent || !photoUrl || !normalizeAiCost(props.apiCost).allowed} onClick={props.onAnalyze}>{busy?'처리 중…':'이 사진 자동 분석'}</button>
                <p className="si-caption">버튼을 누를 때만 사진을 보내며 자동으로 재시도하지 않습니다. 변경한 설명은 먼저 저장합니다.</p>
            </>}
        </div>:<div className="si-manual-guide">
            <p className="si-caption">아래 순서대로 진행하세요. ChatGPT를 열어도 사진이 자동 첨부되지는 않습니다.</p>
            {dirty&&<p className="si-notice">설명이 변경되었습니다. 표준 질문에 반영하려면 먼저 저장해 주세요. <button className="si-btn" disabled={busy} onClick={props.onSave}>설명 저장</button></p>}
            <section><h3><span>1</span>사진을 ChatGPT에 붙여넣기</h3><p>사진을 복사한 뒤 ChatGPT에 먼저 붙여넣어 이미지 미리보기를 확인하세요. 복사가 지원되지 않으면 다운로드한 사진을 첨부하세요.</p><div className="si-inline"><button className="si-btn" disabled={busy || !consent || !photoUrl} onClick={props.onCopyPhoto}>① 사진 이미지 복사</button><a className="si-link" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPT 열기 ↗</a>{photoUrl&&<a className="si-link" href={photoUrl} download="PSI-inspection.jpg">선택한 저장 사진 다운로드</a>}</div></section>
            <section><h3><span>2</span>표준 질문을 붙여넣고 답변 받기</h3><p>사진을 전달한 다음 표준 질문을 복사하세요. 질문을 복사하면 클립보드의 사진이 교체됩니다.</p><button className="si-btn" disabled={busy || !consent || dirty} onClick={props.onCopyPrompt}>② 표준 프롬프트 복사</button><details><summary>표준 프롬프트 직접 복사</summary><pre className="si-prompt">{props.prompt}</pre></details></section>
            <section><h3><span>3</span>ChatGPT 답변 전체를 가져오기</h3><p>코드 형태의 답변 전체를 그대로 붙여넣으면 읽기 쉬운 분석으로 보여드립니다. 보고서 사진은 PSI에 등록한 사본이 연결됩니다.</p><label className="si-label">ChatGPT 답변 붙여넣기<textarea aria-label="AI 분석결과 JSON" rows={6} maxLength={100000} disabled={busy} value={props.text} onChange={e=>props.onText(e.target.value)} placeholder="표준 질문으로 받은 답변 전체를 붙여넣으세요."/></label><button className="si-btn si-primary" disabled={busy || !props.text.trim() || !consent || dirty} onClick={props.onImport}>원본 대조 후 결과 가져오기</button></section>
        </div>}
    </section>;
}
