import React,{useState} from 'react';
import type {Inspection} from '../../lib/inspector/types';
import {buildInspectionHandover,reportReadiness} from '../../lib/inspector/handover';
import {buildActionRegisterCsv} from '../../lib/inspector/actionRegister';
import InspectorShareButton from './InspectorShareButton';

export default function InspectorHandover({item,busy,title,onTitle,onOpen,onFinish}:{item:Inspection;busy:boolean;title:string;onTitle:(title:string)=>void;onOpen:(id:string)=>void;onFinish:()=>void}){
    const [message,setMessage]=useState(''),r=reportReadiness(item),text=buildInspectionHandover(item);
    const download=(csv=false)=>{
        let url:string|undefined;
        try{
            url=URL.createObjectURL(new Blob([csv?buildActionRegisterCsv(item):text],{type:csv?'text/csv;charset=utf-8':'text/plain;charset=utf-8'}));
            const link=document.createElement('a');link.href=url;link.download=`PSI-${csv?'조치대장':'인계문'}-${item.id.slice(0,8)}-v${item.revision}.${csv?'csv':'txt'}`;
            document.body.appendChild(link);
            try{link.click();}finally{link.remove();}
            setMessage(`${csv?'조치대장 CSV':'인계문'} 파일을 준비했습니다. 다운로드 목록을 확인하세요.`);
        }catch{setMessage('파일을 준비하지 못했습니다. 다시 시도해 주세요. 저장된 점검은 유지됩니다.');}
        finally{if(url){const release=url;setTimeout(()=>URL.revokeObjectURL(release),30000);}}
    };
    return <section className="si-handover" aria-label="보고서와 현장 인계">
        <h2>보고서·현장 인계</h2>
        <p className="si-handover-state">{r.pending.length?`사진 ${r.pending.length}장만 더 검토하면 보고서를 작성할 수 있습니다.`:'검토용 보고서를 작성할 수 있습니다.'}</p>
        <p className="si-caption">현재 저장본의 보고서 포함 사진 {r.reportPhotos}장 · 미결 조치 {r.unresolved}건</p>
        {r.pending.length>0&&<button type="button" className="si-btn si-primary" disabled={busy} onClick={()=>onOpen(r.pending[0].id)}>남은 사진 {r.pending[0].number} 검토하기</button>}
        <details><summary>보고서 제목 바꾸기</summary>{(r.manual>0||r.expert>0||r.improvement>0)&&<p className="si-caption">설명 자료 {r.manual}장 · AI 미수용 의견 {r.expert}장 · 개선 증빙 {r.improvement}장도 포함 여부와 내용을 대조하세요.</p>}<label htmlFor="si-report-title">보고서 제목</label><input id="si-report-title" value={title} maxLength={200} disabled={busy} onChange={e=>onTitle(e.target.value)}/><p className="si-caption">미결 조치·설명 자료가 있어도 검토용으로 작성할 수 있습니다. 안전 승인·정식 발행은 별도입니다.</p></details>
        <button type="button" className="si-btn si-primary" disabled={busy||!r.canReport} onClick={onFinish}>모은 자료로 보고서 완성</button>
        <div className="si-handover-actions"><button type="button" className="si-btn" disabled={busy||!item.document.actions.length} onClick={()=>download(true)}>조치대장 CSV 내려받기 · {item.document.actions.length}건</button></div>
        <p className="si-caption">저장 버전 {item.revision}의 전체 등록 조치 · 담당·기한·상태·전후 사진 번호를 엑셀로 관리합니다. 입력 중인 조치·사진 파일·AI 제안은 제외합니다. 내려받은 사본은 기기에서 별도로 관리·삭제하세요.</p>
        <details><summary>점검 전체 인계문 · 복사/공유/파일</summary>
            <p className="si-caption">저장 버전 {item.revision}의 사진별 설명·전문가 기록·수용한 AI 대표 제안과 전체 등록 조치를 모읍니다. 입력 중인 제목·조치와 사진 파일은 제외합니다. 긴 문장은 요약합니다.</p>
            <div className="si-handover-actions"><button type="button" className="si-btn" disabled={busy} onClick={()=>void navigator.clipboard.writeText(text).then(()=>setMessage('저장본 인계문을 복사했습니다.')).catch(()=>setMessage('복사하지 못했습니다. 보내기 미리보기에서 문구를 선택하거나 파일을 저장하세요.'))}>점검 전체 인계문 복사</button><InspectorShareButton title="현장점검 인계문 · 저장본" text={text} disabled={busy} label="점검 전체 인계문 보내기"/><button type="button" className="si-btn" disabled={busy} onClick={()=>download()}>인계문 파일 저장</button></div>
        </details>
        {message&&<p role="status" className="si-caption">{message}</p>}
    </section>;
}
