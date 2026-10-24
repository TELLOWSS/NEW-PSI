import React,{useEffect,useRef,useState} from 'react';
import {legalForTopics} from '../../lib/inspector/legal';
import InspectorLegalFocus from './InspectorLegalFocus';
import InspectorCaseTrends from './InspectorCaseTrends';
const reference=legalForTopics(['msds']);
export default function InspectorChemicalReview({photo,onAmend}:{key?:string;photo?:Blob;onAmend?:(text:string)=>void}){
    const [text,setText]=useState(''),[reading,setReading]=useState(false),[message,setMessage]=useState('');
    const abort=useRef<AbortController|null>(null),alive=useRef(true);
    useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
    const read=async()=>{
        if(!photo||reading)return;
        const controller=new AbortController();abort.current=controller;setReading(true);setMessage('기기에서 제품 표시 문자를 읽는 중입니다. 외부 AI 호출은 없습니다.');
        try{const {recognizeLocally}=await import('../../lib/inspector/localOcr');const result=await recognizeLocally(photo,'kor',()=>{},controller.signal);if(alive.current){setText(result.rawText.slice(0,1500));setMessage(result.rawText.trim()?'제품명·제조사·경고표시를 원본과 대조하고 잘못 읽은 문자를 고쳐 주세요.':'읽을 수 있는 문자를 찾지 못했습니다. 제품명·제조사를 직접 적거나 다음 사진으로 표시 부분을 확대 촬영해 주세요.');}}
        catch{if(alive.current)setMessage('문자 읽기를 완료하지 못했습니다. 제품명·제조사를 직접 입력할 수 있습니다.');}
        finally{if(alive.current)setReading(false);if(abort.current===controller)abort.current=null;}
    };
    return <section className="si-context-check" aria-label="화학제품 MSDS 추가 확인"><b>이 제품은 MSDS도 대조해 보세요</b><p>현재 위험과 연결된 제품 단서가 있습니다. 포대·용기만으로 성분·MSDS 대상 여부나 미비치를 확정하지 않습니다. 분진 방지와 MSDS 관리는 따로 확인하세요.</p><details><summary>제품·표시·자료·교육 확인</summary>
        {photo&&<button type="button" className="si-btn" disabled={reading} onClick={()=>void read()}>{reading?'기기에서 문자 읽는 중…':'제품 표시 문자 읽기 · 외부 AI 호출 없음'}</button>}
        <label className="si-label">대조한 제품명·제조사·표시<textarea value={text} onChange={e=>setText(e.target.value)} maxLength={1500} rows={3} placeholder="포대·용기 표시와 일치하는 내용만 입력하세요. OCR 결과도 직접 대조해야 합니다."/></label>
        {onAmend&&<button type="button" className="si-btn" disabled={reading||!text.trim()} onClick={()=>{onAmend(text.trim());setMessage('제품 정보를 사진 설명에 넣었습니다. 설명을 저장하거나 직접 재분석해야 기록·결과에 반영됩니다. 자동 분석·저장은 하지 않았습니다.');}}>대조한 내용을 사진 설명에 넣기</button>}
        {message&&<p className="si-caption" role="status">{message}</p>}
        <ol><li>제품 표시 확대 사진으로 제품명·제조사·경고표시를 대조</li><li>공급자에게 받은 해당 제품 MSDS와 제품명·개정일 대조</li><li>실제 취급 여부와 작업장 내 자료 접근 가능 여부 확인</li><li>대상인 경우 공정별 관리요령·교육·경고표시를 각각 대조</li></ol><p className="si-caption">공단 자료는 참고용입니다. 공급자 제품 MSDS와의 일치 판정을 자동으로 하지 않습니다.</p><InspectorLegalFocus card={reference.cards[0]} reference={reference} evidence="제품 단서에 따른 추가 확인 · 원래 위험의 위반 근거로 확정한 것이 아님"/><InspectorCaseTrends reference={reference} topic="msds"/>
    </details></section>;
}
