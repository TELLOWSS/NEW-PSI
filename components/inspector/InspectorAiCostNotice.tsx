import InspectorFreeProjectRegistration from './InspectorFreeProjectRegistration';
import React from 'react';
import {normalizeAiCost,type InspectorAiCost} from '../../lib/inspector/aiCost';
export default function InspectorAiCostNotice({cost,busy=false,onRefresh}:{cost?:InspectorAiCost;busy?:boolean;onRefresh?:()=>void}){
    const value=normalizeAiCost(cost);
    return <section className={`si-cost-notice si-cost-${value.state}`} aria-label="AI 무료 사용 보호">
        <b>무료 전용 보호 {value.state==='operator-confirmed'?'· 운영자 확인':value.allowed?'· 청구 미연결 확인':'· 외부 분석 차단'}</b>
        <p role="status">{value.message}</p>
        <p className="si-caption">무료 잔여 횟수: 확인 불가 · 점검당 20회는 앱 제한이며 공급자 무료 한도가 아닙니다.</p>
        {value.checkedAt&&<p className="si-caption">{value.state==='operator-confirmed'?'운영자 확인':'청구 상태 확인'}: {new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(new Date(value.checkedAt))} · 실행 시 서버에서 등록·조회 상태 재확인</p>}
        <details><summary>무료·유료 상태 확인 방법</summary><p>서버가 현재 API 키의 Google 프로젝트와 청구 연결 여부를 읽기 전용으로 조회합니다. 청구 연결·미검토 모델이면 호출하지 않습니다. 조회 권한이 없거나 조회에 실패한 경우, 유효한 운영자 등록이 있으면 그 확인을 기준으로 분석합니다. 잔여 무료량이나 실제 청구액을 추정해 표시하지 않습니다. 외부에서 청구 설정을 바꾸지 말고, 다른 서비스와 키·프로젝트를 분리해 주세요.</p><p>API 전송 없이 저장·설명 조회·저장 결과 확인은 가능합니다. Supabase·Vercel 사용료는 이 AI 보호 범위와 별개입니다.</p><a href="https://aistudio.google.com/projects" target="_blank" rel="noopener noreferrer">Google 프로젝트·청구 상태 ↗</a>{' · '}<a href="https://aistudio.google.com/rate-limit" target="_blank" rel="noopener noreferrer">공급자 무료 사용 한도 ↗</a><p className="si-caption">요금표 검토: {value.pricingReviewedAt||'미확인'} · 무료 API 전송 내용은 공급자 서비스 개선에 사용될 수 있습니다. 공급자의 데이터 이용 조건을 확인하세요.</p></details>
        {['unverified','operator-confirmed'].includes(value.state)&&<InspectorFreeProjectRegistration cost={value} onRefresh={onRefresh}/>}
        {onRefresh&&<button type="button" className="si-btn" disabled={busy} onClick={onRefresh}>무료 상태 다시 확인</button>}
    </section>;
}
