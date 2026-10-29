import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import InspectorSafetyCardDeck from '../components/inspector/InspectorSafetyCardDeck';
import type {VisionImport} from '../lib/inspector/types';
import type {LegalReference} from '../lib/inspector/legal';
const analysis:VisionImport={
    schema_version:'1.1',inspection_id:'synthetic-inspection',photo_id:'synthetic-photo-id',
    source_photo_sha256:'synthetic',processing_mode:'CHATGPT_MANUAL',
    observed_facts:[{text:'합성 테스트: 발판 가까이에 틈이 보입니다.',visual_basis:'화면 중앙',confidence:'medium'}],
    ai_hypotheses:[{text:'합성 테스트: 발판 단부에 추가 확인이 필요할 수 있습니다.',reason:'촬영범위 제한'}],
    requires_confirmation:[{question:'합성 테스트: 발판 사용 여부를 현장에서 확인했나요?',why:'사진 밖 상태는 확인할 수 없음'}],
    recommended_controls:[{action:'합성 테스트: 안전한 위치에서 발판 상태를 대조하세요.',priority:'soon'}],
    risk_findings:[
        {observation_index:'0',problem:'합성 위험 단서 1',risk:'추락 가능성 확인 필요',action:'작업구역 통제 필요성을 검토하세요.',priority:'immediate'},
        {observation_index:'0',problem:'합성 위험 단서 2',risk:'발판 상태 현장 대조 필요',action:'현장에서 이격 상태를 확인하세요.',priority:'soon'}
    ],
    law_candidate_keywords:[],limitations:['합성 테스트: 사진 밖 방호 상태는 확인할 수 없습니다.']
};
const exampleImage='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="#b9ced3"/><rect y="280" width="640" height="140" fill="#6f7f78"/><path d="M60 55V340M200 55V340M340 55V340M480 55V340M40 135H510M40 235H510M60 55L200 235M200 55L340 235M340 55L480 235" stroke="#303d49" stroke-width="15"/><path d="M90 241H470" stroke="#e0b665" stroke-width="26"/><path d="M230 240H310" stroke="#cf554d" stroke-width="13" stroke-dasharray="15 10"/></svg>');
const reference:LegalReference={
    version:'synthetic-1',reviewedAt:'2026-10-01',dateStatus:'reference-date',
    cards:[{id:'synthetic-legal',title:'합성 법령 검토 후보 · 실제 법령 아님',keywords:[],actions:[],duties:[],scope:'synthetic',sanctions:[]}],
    inspectionCases:[]
};
function Fixture(){
    const [reviewSaved,setSaved]=useState(false),[rejected,setRejected]=useState(false),[selected,setSelected]=useState(0),[compose,setCompose]=useState(0),[details,setDetails]=useState(0),[variant,setVariant]=useState<'normal'|'empty'|'long'>('normal'),[hasPhoto,setHasPhoto]=useState(true);
    const data:VisionImport=variant==='empty'?{...analysis,risk_findings:[],observed_facts:[],ai_hypotheses:[],recommended_controls:[],requires_confirmation:[],limitations:[]}:variant==='long'?{...analysis,risk_findings:analysis.risk_findings.map(x=>({...x,problem:x.problem+' 긴 설명'.repeat(20),risk:x.risk+' 추가 확인 권고'.repeat(15),action:x.action+' 현장 작업 안전관리'.repeat(22)})),observed_facts:analysis.observed_facts.map(x=>({...x,text:x.text+' 현장 대조가 필요합니다.'.repeat(40)}))}:analysis;
    return <main style={{width:'min(900px,100%)',boxSizing:'border-box',margin:'0 auto',padding:12}}>
        <div style={{display:'flex',gap:8}}>
            <button id="toggle-rejected" onClick={()=>setRejected(v=>!v)}>합성 전문가 의견 반전</button>
            <button id="toggle-saved" onClick={()=>setSaved(v=>!v)}>합성 저장 상태 반전</button>
            <button id="toggle-empty" onClick={()=>{setVariant(v=>v==='empty'?'normal':'empty');setSelected(0);}}>빈 분석 전환</button>
            <button id="toggle-long" onClick={()=>{setVariant(v=>v==='long'?'normal':'long');setSelected(0);}}>긴 분석 전환</button>
            <button id="toggle-photo" onClick={()=>setHasPhoto(v=>!v)}>사진 포함 전환</button>
        </div>
        <InspectorSafetyCardDeck analysis={data} reference={reference} review={{decision:rejected?'rejected':'accepted',note:rejected?'합성 전문가 판단: 사진만으로 상태 확정 불가':''}} reviewSaved={reviewSaved} note="점검자 설명: 시공 중 발판 주변 확인" photoUrl={hasPhoto?exampleImage:undefined} photoId="synthetic-photo-id" selectedFinding={selected} onFindingChange={setSelected} onComposeCard={()=>setCompose(v=>v+1)} onCopy={()=>{}} onSeeDetails={()=>setDetails(v=>v+1)}/>
        <output id="compose-count">{compose}</output><output id="details-count">{details}</output>
    </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
