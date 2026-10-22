import React,{useState} from 'react';
import type {ExpertReview} from '../../lib/inspector/expertReview';
export default function InspectorExpertReview({value,onChange,busy}:{key?:number;value:ExpertReview;onChange:(value:ExpertReview)=>void;busy:boolean}){
    const [open,setOpen]=useState(!!value.note||value.decision==='rejected');
    return <section className="si-expert-review" aria-label="전문가 판단 보완">
        <div><b>현장 판단은 내가 마무리합니다</b><button type="button" className="si-btn" aria-expanded={open} aria-controls="si-expert-fields" disabled={busy} onClick={()=>setOpen(v=>!v)}>{open?'의견 접기':'판단·조치 보완'}</button></div>
        <p className="si-caption">필요한 의견만 적고 하단에서 확인하세요. 의견 보완은 AI 재분석 없이 저장됩니다.</p>
        <div id="si-expert-fields" hidden={!open}>
            <fieldset disabled={busy}><legend>AI 해석에 대한 판단</legend><label><input type="radio" name="expert-decision" checked={value.decision==='accepted'} onChange={()=>onChange({...value,decision:'accepted'})}/>참고해 활용</label><label><input type="radio" name="expert-decision" checked={value.decision==='rejected'} onChange={()=>onChange({...value,decision:'rejected'})}/>AI 해석과 다름</label></fieldset>
            <label htmlFor="si-expert-note">내가 확인한 상태·필요 조치 {value.decision==='rejected'?'(5자 이상 필수)':'(선택)'}</label><textarea id="si-expert-note" value={value.note} maxLength={2000} disabled={busy} onChange={e=>onChange({...value,note:e.target.value})} placeholder="예: 뒤쪽에 난간 설치됨. 사진만으로 미설치 판단 불가. 발판 고정 상태를 보완하도록 요청."/>
            {value.decision==='rejected'&&<p className="si-caption">보고서에는 내 의견과 AI 해석 수용 여부를 구분합니다. 수용하지 않은 AI 제안은 조치요청문·법령 검색 신호에서 제외합니다.</p>}
        </div>
    </section>;
}
