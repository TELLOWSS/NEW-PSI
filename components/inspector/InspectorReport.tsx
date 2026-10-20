import React, {useEffect,useState} from 'react';
import {assetHash} from '../../lib/inspector/photoAssets';
import {postAdminJson} from '../../utils/adminApiClient';
import type { InspectionReport } from '../../lib/inspector/types';
import { confirmationAnswerLabel, inspectionState } from '../../lib/inspector/types';
export default function InspectorReport({ report }: { report: InspectionReport }) {
    const {inspection,evidence,generatedAt}=report.snapshot, doc=inspection.document;
    const [photos,setPhotos]=useState<Record<string,{url?:string;failed?:boolean}>>({});
    useEffect(()=>{
        let disposed=false,index=0;const urls:string[]=[],controller=new AbortController();setPhotos({});
        const worker=async()=>{while(index<evidence.length && !disposed){const photo=evidence[index++];try{
            const signed=await postAdminJson<any>('/api/admin/inspector',{op:'photo',id:inspection.id,photoId:photo.id},{fallbackMessage:'보고서 사진을 읽지 못했습니다.'});
            const response=await fetch(signed.url,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error('missing');
            const blob=await response.blob();if(await assetHash(blob)!==photo.sha256)throw new Error('hash mismatch');if(disposed)return;const url=URL.createObjectURL(blob);urls.push(url);const image=new Image();image.src=url;await image.decode();
            if(!disposed)setPhotos(old=>({...old,[photo.id]:{url}}));
        }catch{if(!disposed)setPhotos(old=>({...old,[photo.id]:{failed:true}}));}}};
        void Promise.all([worker(),worker()]);return()=>{disposed=true;controller.abort();urls.forEach(url=>URL.revokeObjectURL(url));};
    },[report.id]);
    return <article className="si-report" aria-label="점검 검토용 보고서">
        <header><p className="si-eyebrow">NEW-PSI · SAFETY INSPECTOR</p><h2>현장점검 검토용 보고서</h2><p>법령 검증 대기 · 최종 승인 전</p></header>
        <div className="si-report-summary"><span>증거사진 <b>{evidence.length}</b>장</span><span>미결 조치 <b>{doc.actions.filter(a=>a.status!=='verified').length}</b>건</span><span>미확인 질문 <b>{Object.entries(doc.analyses).filter(([id])=>evidence.some(p=>p.id===id)).reduce((sum,[id,a])=>sum+a.requires_confirmation.filter((_,n)=>{const answer=doc.confirmationAnswers?.[id]?.find(x=>x.questionIndex===n);return !answer || answer.answer==='unknown';}).length,0)}</b>건</span><span>공식 법령 검증 대기</span></div>
        <dl className="si-report-meta"><div><dt>점검명</dt><dd>{doc.title}</dd></div><div><dt>현장·위치</dt><dd>{doc.siteName || '미입력'} / {doc.location || '미입력'}</dd></div><div><dt>공종·촬영시점</dt><dd>{doc.workType || '미입력'} / {doc.eventAt}</dd></div><div><dt>상태</dt><dd>{inspectionState(doc)}</dd></div><div><dt>점검번호·버전</dt><dd>{inspection.id} · {inspection.revision}</dd></div><div><dt>생성시각</dt><dd>{generatedAt}</dd></div></dl>
        <h3>1. 점검자 설명</h3><p className="si-pre">{doc.notes || '설명이 등록되지 않았습니다.'}</p>
        {doc.urgent && <p className="si-urgent">긴급 검토 요청: 현장 접근통제·작업중지 필요성을 책임자가 먼저 검토해야 합니다.</p>}
        <h3>2. 사진별 관찰과 사실 검토</h3>
        {evidence.map((photo,i)=>{const a=doc.analyses[photo.id],r=doc.reviews[photo.id],ocr=doc.ocrResults[photo.id];return <section key={photo.id} className="si-report-block">
            <h4>사진 {i+1} · {photo.id}</h4><div data-report-photo-state={photos[photo.id]?.url?'ready':photos[photo.id]?.failed?'failed':'loading'}>{photos[photo.id]?.url?<img className="si-report-photo" src={photos[photo.id].url} alt={`점검 사진 ${i+1}`}/>:<p role="status">{photos[photo.id]?.failed?'사진을 불러오지 못했습니다. 삭제 여부·접근 권한을 확인하세요.':'보고서 사진을 준비하고 있습니다…'}</p>}</div><p className="si-pre">사진별 점검자 설명: {doc.photoNotes?.[photo.id] || '미입력'}</p><p className="si-hash">등록 사진 SHA-256: {photo.sha256}</p>
            <p>분석 출처: {a?(a.processing_mode==='PAID_API_APPROVED'?'서버 API 분석':'ChatGPT 사용자 수동 가져오기'):'분석 없음'} · 사실 검토: {r ? r.decision==='accepted'?'검토 수용':'반려':'검토 대기'}</p>
            {r && <p>검토 사유: {r.note}</p>}
            <h4>AI 관찰 제안</h4><ul>{a?.observed_facts.map((x,n)=><li key={n}>{x.text} (시각 근거: {x.visual_basis})</li>)}</ul>
            <h4>AI 추론 · 현장 확인 필요</h4><ul>{a?.ai_hypotheses.map((x,n)=><li key={n}>{x.text} — {x.reason}</li>)}</ul>
            <h4>질문별 현장 확인</h4><ul>{a?.requires_confirmation.map((x,n)=>{const answer=doc.confirmationAnswers?.[photo.id]?.find(a=>a.questionIndex===n);return <li key={n}>{x.question} — {x.why}<p>확인 상태: {answer?confirmationAnswerLabel[answer.answer]:'답변 대기'} · 근거: {answer?.note || '미기록'}</p></li>;})}</ul>
            {a?.limitations.length ? <p>판독 한계: {a.limitations.join(' / ')}</p> : null}
            {ocr && <><h4>기기 내 문자 인식 · 검수 상태: {ocr.reviewStatus==='accepted'?'검수 수용':'검토 필요'}</h4><p className="si-pre">원 인식: {ocr.rawText}</p><p className="si-pre">정정문: {ocr.recognizedText}</p></>}
        </section>;})}
        {!evidence.length && <p>등록된 증거사진이 없습니다.</p>}
        <h3>3. 법령·제재·감독사례 검증</h3><p>공식 법령 수집·조문별 시행일·부칙·적용요건·공식 사례가 아직 검증되지 않았습니다. 현재 시행 / 공포·시행예정 / 입법추진 / 과거를 확인하기 전에는 위반이나 금액을 확정할 수 없습니다.</p><p>형사벌칙·과태료·행정조치·실제 사례 결과는 각각 검증 대기입니다.</p>
        <h3>4. 개선조치와 미결사항</h3>{doc.actions.length ? doc.actions.map(a=><section key={a.id} className="si-report-block"><h4>{a.title}</h4><p>담당: {a.owner} · 기한: {a.dueDate} · 상태: {a.status==='verified'?'재점검 확인됨':a.status==='review-requested'?'완료 검토 요청':'미조치'}</p><p>{a.note || '조치 내용 미입력'}</p><p>개선사진: {a.completionPhotoId || '미등록'} · 확인시각: {a.verifiedAt || '미확인'}</p></section>):<p>개선조치가 등록되지 않았습니다.</p>}
        <h3>5. 보고서 이력</h3><p>이 보고서는 저장한 점검 버전의 스냅샷입니다. 보고서 작성은 개선 완료나 법령 검증 승인을 의미하지 않습니다. 승인된 PSI 지표 및 별도 SMART TBM 프로그램으로 아직 전송되지 않습니다.</p><p>기록 주체: 전용 설치 관리자 계정(개인 전자서명 아님).</p><p className="si-hash">보고서 번호: {report.id}<br/>스냅샷 SHA-256: {report.snapshot_sha256}</p>
    </article>;
}
