import React,{useRef,useState} from 'react';
import {postAdminJson} from '../../utils/adminApiClient';
import {normalizeAiCost,type InspectorAiCost} from '../../lib/inspector/aiCost';
export default function InspectorAiDiagnostics({disabled,onCost}:{disabled:boolean;onCost:(cost:InspectorAiCost)=>void}){
    const lock=useRef(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
    const check=async()=>{
        if(lock.current||disabled)return;lock.current=true;setBusy(true);setMessage('합성 이미지 1회 분석 및 응답 형식 검증 중…');setFailed(false);
        try{
            const result=await postAdminJson('/api/admin/inspector',{op:'ai-analysis-check',confirmed:true},{requireOk:false,timeoutMs:90000,fallbackMessage:'AI 작동 시험을 완료하지 못했습니다.'});
            if(!result?.ok)throw Object.assign(new Error(result?.message||'AI 작동 시험을 완료하지 못했습니다.'),{code:result?.code,cost:result?.cost});
            if(result.cost)onCost(normalizeAiCost(result.cost));
            if(result.connected!==true||result.syntheticOnly!==true||result.inferenceRequests!==1)throw new Error('작동 시험의 완료 증빙을 확인하지 못했습니다.');
            setMessage(`실제 이미지 분석·응답 형식 검증 통과 · ${result.model} · ${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',timeStyle:'short'}).format(new Date(result.checkedAt))}. 고객 사진 전송·점검기록 생성 없음. 현장 분석 정확도를 보증하는 시험은 아닙니다.`);
        }catch(error){if(error&&typeof error==='object'&&'cost' in error&&error.cost)onCost(normalizeAiCost(error.cost));setFailed(true);setMessage(error instanceof Error?error.message:'AI 작동 시험을 완료하지 못했습니다.');}
        finally{lock.current=false;setBusy(false);}
    };
    return <section aria-label="AI 실제 작동 시험"><p className="si-caption">서버의 합성 색상 카드만 전송해 이미지 분석과 응답 형식을 시험합니다. 무료 한도 1회를 사용하며 서버 전체에서 1분에 한 번 가능합니다. 고객 사진·점검기록은 사용하지 않습니다.</p><button type="button" className="si-btn" disabled={disabled||busy} onClick={()=>void check()}>{busy?'AI 작동 시험 중…':'AI 실제 작동 시험 · 무료 한도 1회'}</button>{message&&<p role={failed?'alert':'status'}>{message}</p>}</section>;
}
