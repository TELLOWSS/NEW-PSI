import React, {useEffect,useRef,useState} from 'react';
import {buildInspectionBrief,controlPriorityLabel,formatInspectionTimestamp} from '../../lib/inspector/journey';
import {assetHash} from '../../lib/inspector/photoAssets';
import {postAdminJson} from '../../utils/adminApiClient';
import type { InspectionReport } from '../../lib/inspector/types';
import { confirmationAnswerLabel, inspectionState } from '../../lib/inspector/types';
import InspectorLegalResult from './InspectorLegalResult';
import {buildReportActionRequests} from '../../lib/inspector/expertReview';
import InspectorShareButton from './InspectorShareButton';
import {sharePhotoFile} from '../../lib/inspector/sharing';
import {actionPhotoSummary} from '../../lib/inspector/actionFollowup';
import InspectorPhotoComparison from './InspectorPhotoComparison';
import {reportPrintState,type ReportPhotoLoadState} from '../../lib/inspector/noviceFollowThrough';
export default function InspectorReport({ report,onPhotoState }: { report: InspectionReport;onPhotoState?:(state:ReportPhotoLoadState)=>void }) {
    const {inspection,evidence,generatedAt}=report.snapshot, doc=inspection.document;
    const reportRef=useRef<HTMLElement>(null);
    const [briefMessage,setBriefMessage]=useState('');
    const [photos,setPhotos]=useState<Record<string,{url?:string;blob?:Blob;failed?:boolean}>>({});
    useEffect(()=>{
        const frame=requestAnimationFrame(()=>{
            const node=reportRef.current;
            if(!node)return;
            const target=node.parentElement?.querySelector<HTMLElement>('.si-quick-print')||node;
            target.scrollIntoView({block:'start',behavior:'auto'});
            node.focus({preventScroll:true});
        });
        return()=>cancelAnimationFrame(frame);
    },[report.id]);
    useEffect(()=>{
        let disposed=false,index=0;const urls:string[]=[],controller=new AbortController();setPhotos({});setBriefMessage('');
        const worker=async()=>{while(index<evidence.length && !disposed){const photo=evidence[index++];try{
            const signed=await postAdminJson<any>('/api/admin/inspector',{op:'photo',id:inspection.id,photoId:photo.id},{fallbackMessage:'보고서 사진을 읽지 못했습니다.'});
            const response=await fetch(signed.url,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error('missing');
            const blob=await response.blob();if(await assetHash(blob)!==photo.sha256)throw new Error('hash mismatch');if(disposed)return;const url=URL.createObjectURL(blob);urls.push(url);const image=new Image();image.src=url;await image.decode();
            if(!disposed)setPhotos(old=>({...old,[photo.id]:{url,blob}}));
        }catch{if(!disposed)setPhotos(old=>({...old,[photo.id]:{failed:true}}));}}};
        void Promise.all([worker(),worker()]);return()=>{disposed=true;controller.abort();urls.forEach(url=>URL.revokeObjectURL(url));};
    },[report.id]);
    const photoState=reportPrintState(evidence.length,evidence.map(photo=>photos[photo.id]?.failed?'failed':photos[photo.id]?.url?'ready':'loading'));
    useEffect(()=>{onPhotoState?.(photoState);},[photoState,onPhotoState]);
    return <article ref={reportRef} tabIndex={-1} className="si-report" aria-label="점검 검토용 보고서">
        <header><p className="si-eyebrow">NEW-PSI · SAFETY INSPECTOR</p><h2>현장점검 검토용 보고서</h2><p>{report.snapshot.legalReference?'공식 법령 요지·조건별 금액 포함 · 현장 적용 및 최종 승인 전':'작성 당시 법령 자료 미수록 · 최종 승인 전'}</p></header>
        <section className="si-report-readers-guide" aria-label="보고서 확인 순서"><b>처음 확인하는 분을 위한 보고서 길잡이</b><ol><li>사진별 위험요인과 현장 전문가 검토 의견을 비교합니다.</li><li>관련 법령·금액은 적용 조건과 공식 원문을 대조합니다.</li><li>미결 조치·개선사진·현장 재점검 결과를 확인한 뒤 공유합니다.</li></ol><p>이 자료는 검토용이며 보고서를 출력했다고 현장 개선이나 법 위반이 확정되지 않습니다.</p><p role="status">{photoState==='loading'?`보고서 사진 ${evidence.filter(photo=>photos[photo.id]?.url).length}/${evidence.length}장 준비 중 · 완료 후 인쇄 가능`:photoState==='failed'?'일부 사진을 불러오지 못했습니다. 사진 누락 여부를 확인하고 인쇄 여부를 결정하세요.':'보고서 사진 준비 완료 · 인쇄/PDF 저장 가능'}</p></section>
        <section className="si-report-brief"><div className="si-section-heading"><h3>바로 활용하는 보고 요약</h3><button className="si-btn" onClick={()=>void navigator.clipboard.writeText(buildReportActionRequests(report)).then(()=>setBriefMessage('현장 전달용 요약을 복사했습니다.')).catch(()=>setBriefMessage('복사하지 못했습니다. 보고 요약 내용을 선택해 주세요.'))}>현장 전달용 요약 복사</button><button className="si-btn" onClick={()=>void Promise.resolve().then(()=>navigator.clipboard.writeText(buildInspectionBrief(report))).then(()=>setBriefMessage('보고 요약을 복사했습니다.')).catch(()=>setBriefMessage('복사할 수 없습니다. 아래 요약을 선택해 복사해 주세요.'))}>보고 요약 복사</button><InspectorShareButton title={doc.title+' · 검토용 보고 요약'} text={buildInspectionBrief(report)} label="보고서 사진·요약 보내기" prepareFiles={async()=>Promise.all(evidence.map(async(photo,n)=>{const blob=photos[photo.id]?.blob;if(!blob)throw new Error('사진 로딩 미완료');return sharePhotoFile(blob,n+1);}))}/></div>{briefMessage&&<p role="status">{briefMessage}</p>}<details><summary>보고 요약 내용 보기</summary><p className="si-pre">{buildInspectionBrief(report)}</p></details></section>
        <div className="si-report-summary"><span>증거사진 <b>{evidence.length}</b>장</span><span>미결 조치 <b>{doc.actions.filter(a=>a.status!=='verified').length}</b>건</span><span>미확인 질문 <b>{Object.entries(doc.analyses).filter(([id])=>evidence.some(p=>p.id===id)).reduce((sum,[id,a])=>sum+a.requires_confirmation.filter((_,n)=>{const answer=doc.confirmationAnswers?.[id]?.find(x=>x.questionIndex===n);return !answer || answer.answer==='unknown';}).length,0)}</b>건</span><span>{report.snapshot.legalReference?'법령 요지·금액 포함 · 적용 검토':'작성 당시 법령 미수록'}</span></div>
        <dl className="si-report-meta"><div><dt>점검명</dt><dd>{doc.title}</dd></div><div><dt>현장·위치</dt><dd>{doc.siteName || '미입력'} / {doc.location || '미입력'}</dd></div><div><dt>공종·촬영시점</dt><dd>{doc.workType || '미입력'} / {formatInspectionTimestamp(doc.eventAt)}</dd></div><div><dt>상태</dt><dd>{inspectionState(doc)}</dd></div><div><dt>점검번호·버전</dt><dd>{inspection.id} · {inspection.revision}</dd></div><div><dt>생성시각</dt><dd>{formatInspectionTimestamp(generatedAt)}</dd></div></dl>
        <h3>1. 현장 공통 설명</h3><p className="si-pre">{doc.notes || '공통 설명은 별도로 입력하지 않았습니다. 사진별 설명은 아래에 표시됩니다.'}</p>
        {doc.urgent && <p className="si-urgent">긴급 검토 요청: 현장 접근통제·작업중지 필요성을 책임자가 먼저 검토해야 합니다.</p>}
        <h3>2. 사진별 관찰과 사실 검토</h3>
        {evidence.map((photo,i)=>{const a=doc.analyses[photo.id],r=doc.reviews[photo.id],ocr=doc.ocrResults[photo.id];return <section key={photo.id} className="si-report-block">
            <h4>사진 {i+1} · {photo.id}</h4><div data-report-photo-state={photos[photo.id]?.url?'ready':photos[photo.id]?.failed?'failed':'loading'}>{photos[photo.id]?.url?<img className="si-report-photo" src={photos[photo.id].url} alt={`점검 사진 ${i+1}`}/>:<p role="status">{photos[photo.id]?.failed?'사진을 불러오지 못했습니다. 삭제 여부·접근 권한을 확인하세요.':'보고서 사진을 준비하고 있습니다…'}</p>}</div><p className="si-pre">사진별 점검자 설명: {doc.photoNotes?.[photo.id] || '미입력'}</p><p className="si-hash">등록 사진 SHA-256: {photo.sha256}</p>
            <p>분석 출처: {a?(a.processing_mode==='PAID_API_APPROVED'?'서버 API 분석':'ChatGPT 사용자 수동 가져오기'):'분석 없음'} · 사실 검토: {r ? r.decision==='accepted'?'검토 수용':'AI 해석 수용 안 함':'검토 대기'}</p>
            {r && <section className="si-human-report"><h4>전문가 검토 의견</h4><p className="si-pre">{r.note}</p>{r.decision==='rejected'&&<p>AI 해석 수용 안 함 · 아래 AI 내용은 원기록 대조용이며 조치 지시가 아닙니다.</p>}</section>}
            {!!a?.risk_findings?.length&&<><h4>문제 지점·위험·우선 조치 · AI 해석</h4>{a.risk_findings.map((f,n)=><div key={n}><b>{f.problem}</b><p>사진 근거: {a.observed_facts[Number(f.observation_index)]?.visual_basis} · {a.observed_facts[Number(f.observation_index)]?.text}</p><p>가능 위험: {f.risk}</p><p>우선 조치: {f.action}</p></div>)}</>}
            <h4>AI 관찰 제안</h4><ul>{a?.observed_facts.map((x,n)=><li key={n}>{x.text} (시각 근거: {x.visual_basis})</li>)}</ul>
            <h4>AI 추론 · 현장 확인 필요</h4><ul>{a?.ai_hypotheses.map((x,n)=><li key={n}>{x.text} — {x.reason}</li>)}</ul>
            <h4>AI 개선 권고 · 현장 적용 검토</h4>{a?.recommended_controls.length?<ul>{a.recommended_controls.map((x,n)=><li key={n}>{controlPriorityLabel[x.priority]}: {x.action}</li>)}</ul>:<p>등록된 개선 권고가 없습니다.</p>}
            <h4>질문별 현장 확인</h4><ul>{a?.requires_confirmation.map((x,n)=>{const answer=doc.confirmationAnswers?.[photo.id]?.find(a=>a.questionIndex===n);return <li key={n}>{x.question} — {x.why}<p>확인 상태: {answer?confirmationAnswerLabel[answer.answer]:'아직 확인하지 못함'} · 근거: {answer?.note || '미기록'}</p></li>;})}</ul>
            {a?.limitations.length ? <p>판독 한계: {a.limitations.join(' / ')}</p> : null}
            {ocr && <><h4>기기 내 문자 인식 · 검수 상태: {ocr.reviewStatus==='accepted'?'검수 수용':'검토 필요'}</h4><p className="si-pre">원 인식: {ocr.rawText}</p><p className="si-pre">정정문: {ocr.recognizedText}</p></>}
        </section>;})}
        {!evidence.length && <p>등록된 증거사진이 없습니다.</p>}
        <h3>3. 관련 법령 요지와 조건별 제재 금액</h3>{report.snapshot.legalReference?<InspectorLegalResult reference={report.snapshot.legalReference}/>:<p>이 보고서를 작성할 당시 법령 자료는 저장되지 않았습니다. 현재 기준을 과거 보고서에 소급해 표시하지 않습니다.</p>}
        <h3>4. 개선조치와 미결사항</h3>{doc.actions.length ? doc.actions.map(a=><section key={a.id} className="si-report-block"><h4>{a.title}</h4><p>담당: {a.owner} · 기한: {a.dueDate} · 상태: {a.status==='verified'?'재점검 확인됨':a.status==='review-requested'?'완료 검토 요청':'미조치'}</p><p className="si-pre">{a.note || '조치 내용 미입력'}</p>{actionPhotoSummary(a,evidence.map(p=>p.id)).map(line=><p key={line}>{line}</p>)}{a.completionPhotoId&&<><InspectorPhotoComparison before={photos[a.sourcePhotoIds?.[0]||'']?.url} after={photos[a.completionPhotoId]?.url} beforeError={photos[a.sourcePhotoIds?.[0]||'']?.failed} afterError={photos[a.completionPhotoId]?.failed}/>{!a.sourcePhotoIds?.length&&<p>작성 당시 조치 전 사진 연결 미수록</p>}{a.sourcePhotoIds&&a.sourcePhotoIds.length>1&&<p>조치 전 대표 1장 비교 · 나머지 적용 사진은 사진별 기록을 함께 확인하세요.</p>}</>}<p>현장 재점검 확인시각: {a.verifiedAt?formatInspectionTimestamp(a.verifiedAt):'미확인'}</p></section>):<p>개선조치가 등록되지 않았습니다.</p>}
        <h3>5. 보고서 이력</h3><p>이 보고서는 저장한 점검 버전의 스냅샷입니다. 보고서 작성은 개선 완료나 법령 검증 승인을 의미하지 않습니다. 승인된 PSI 지표 및 별도 SMART TBM 프로그램으로 아직 전송되지 않습니다.</p><p>기록 주체: 전용 설치 관리자 계정(개인 전자서명 아님).</p><p className="si-hash">보고서 번호: {report.id}<br/>스냅샷 SHA-256: {report.snapshot_sha256}</p>
    </article>;
}
