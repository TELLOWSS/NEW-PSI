import React,{useState,useRef,useEffect} from 'react';
import type {ExpertReview} from '../../lib/inspector/expertReview';
export default function InspectorExpertReview({value,onChange,busy,saved,notice,onSave,editRequest=0}:{key?:number;value:ExpertReview;onChange:(value:ExpertReview)=>void;busy:boolean;saved:boolean;notice:string;onSave:()=>void;editRequest?:number}){
    const [open,setOpen]=useState(!!value.note||value.decision==='rejected');
    const noteRef=useRef<HTMLTextAreaElement>(null);
    useEffect(()=>{if(!editRequest)return;setOpen(true);const frame=requestAnimationFrame(()=>{noteRef.current?.focus();noteRef.current?.scrollIntoView({block:'center',behavior:'smooth'});});return()=>cancelAnimationFrame(frame);},[editRequest]);
    const invalidNote=(value.note.trim().length>0&&value.note.trim().length<5)||(value.decision==='rejected'&&value.note.trim().length<5);
    return <section className="si-expert-review" aria-label="전문가 판단 보완">
        <div><b>현장 판단은 내가 마무리합니다</b><button type="button" className="si-btn" aria-expanded={open} aria-controls="si-expert-fields" disabled={busy} onClick={()=>setOpen(v=>!v)}>{open?'의견 접기':'판단·조치 보완'}</button></div>
        <div className={`si-review-save ${saved?'is-saved':'is-unsaved'}`}><div><b>{saved?'검토 저장됨':'검토 저장 전'}</b><p>{saved?'현재 선택과 의견이 저장본과 같습니다. 다음 사진이나 보고서로 이어가세요.':'사진·분석과 대조한 뒤 저장하세요. AI 재분석 없이 현재 사진의 검토만 저장합니다.'}</p></div><button type="button" className="si-btn" disabled={busy||saved||invalidNote} onClick={onSave}>{saved?'검토 저장 완료':'검토만 저장'}</button></div><p className="si-review-save-notice" role="status" aria-live="polite">{notice}</p>
        <div id="si-expert-fields" hidden={!open}>
            <fieldset disabled={busy}><legend>AI 해석에 대한 판단</legend><label><input type="radio" name="expert-decision" checked={value.decision==='accepted'} onChange={()=>onChange({...value,decision:'accepted'})}/>참고해 활용</label><label><input type="radio" name="expert-decision" checked={value.decision==='rejected'} onChange={()=>onChange({...value,decision:'rejected'})}/>AI 해석과 다름</label></fieldset>
            <label htmlFor="si-expert-note">내가 확인한 상태·필요 조치 {value.decision==='rejected'?'(5자 이상 필수)':'(선택)'}</label><textarea ref={noteRef} aria-describedby={invalidNote?"si-expert-note-guidance":undefined} aria-invalid={invalidNote} id="si-expert-note" value={value.note} maxLength={2000} disabled={busy} onChange={e=>onChange({...value,note:e.target.value})} placeholder="예: 뒤쪽에 난간 설치됨. 사진만으로 미설치 판단 불가. 발판 고정 상태를 보완하도록 요청."/>
            {invalidNote&&<p id="si-expert-note-guidance" className="si-caption" role="status">확인한 상태나 다른 점을 5자 이상 적어 주세요. 짧은 의견이 있으면 보완한 뒤 저장할 수 있습니다.</p>}
            {value.decision==='rejected'&&<p className="si-caption">보고서에는 내 의견과 AI 해석 수용 여부를 구분합니다. 수용하지 않은 AI 제안은 조치요청문·법령 검색 신호에서 제외합니다.</p>}
        </div>
    </section>;
}
