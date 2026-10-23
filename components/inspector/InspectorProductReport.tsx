import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {ProductReportSnapshot} from '../../lib/inspector/productReport';
import FieldDrawing from './InspectorProductDrawing';
import './inspector-product-report.css';
export default function InspectorProductReport({snapshot,onClose}:{snapshot:ProductReportSnapshot;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),[message,setMessage]=useState('');
 useEffect(()=>{const dialog=ref.current,previous=document.activeElement,overflow=document.body.style.overflow;dialog?.showModal();document.body.style.overflow='hidden';return()=>{dialog?.close();document.body.style.overflow=overflow;if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
 const print=()=>{try{window.print();setMessage('인쇄창 열기를 요청했습니다. PDF 저장 여부는 기기에서 확인하세요.');}catch{setMessage('인쇄창을 열지 못했습니다. 브라우저의 인쇄 메뉴를 사용하거나 다시 시도해 주세요.');}};
 return createPortal(<dialog ref={ref} className="ip-sample-report-dialog" aria-label="샘플 보고서 미리보기" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <header className="ip-report-toolbar"><div><b>샘플 보고서 미리보기</b><span>열었을 때의 내용 · 실제 업무 기록 아님</span></div><button type="button" autoFocus onClick={onClose}>닫기</button></header>
  <div className="ip-report-actions"><button type="button" onClick={print}>인쇄 · PDF로 저장</button><p>인쇄창에서 PDF 저장을 선택하세요. 기기·브라우저에 따라 메뉴가 다를 수 있습니다.</p>{message&&<p role="status">{message}</p>}</div>
  <article className="ip-sample-report" aria-label="체험용 사진점검 보고서">
   <header><div><span className="ip-report-wordmark">NEW-PSI / FIELD INSPECTOR</span><strong>체험용 가상 자료 · SAMPLE</strong></div><h1>사진점검 샘플 보고서</h1><p>{snapshot.title} · 실제 사진 판독·현장 확인·안전 승인 기록이 아닙니다.</p></header>
   <section className="ip-report-overview"><figure><FieldDrawing topic={snapshot.scene}/><figcaption>체험용 도해 · 실제 현장 사진 아님</figcaption></figure><div><h2>선택 장면과 확인 한계</h2><p>{snapshot.proof}</p><p>{snapshot.hint}</p><p className="ip-report-caution">높이·강도·통전 여부와 법령 적용은 실제 현장에서 별도 확인해야 합니다.</p></div></section>
   <section className="ip-report-section"><h2>01 / {snapshot.rejected?'전문가 보완 의견':'검토할 조치 예시'}</h2><div className="ip-report-proposal">{snapshot.proposal}</div><p>{snapshot.review}</p>{snapshot.expert&&!snapshot.rejected&&<p className="ip-report-expert">전문가 의견 예시: {snapshot.expert}</p>}<p>저장 전 입력은 포함하지 않았습니다. 해석 미수용 시 원래 AI 조치 예시를 전달하지 않습니다.</p></section>
   <section className="ip-report-section"><h2>02 / 담당과 기한 예시</h2><dl><div><dt>가상 담당자</dt><dd>{snapshot.owner}</dd></div><div><dt>가상 완료기한</dt><dd>{snapshot.due}</dd></div></dl><p>{snapshot.assignmentLabel}. 적용 전 변경 입력은 제외했습니다.</p></section>
   <section className="ip-report-section"><h2>03 / 후속 확인과 전달</h2><ol><li>실제 점검에서 담당·기한과 적용 사진의 범위를 확인합니다.</li><li>개선사진을 제출한 뒤 실제 현장을 재점검합니다. 사진 제출은 완료 승인이 아닙니다.</li><li>조건별 법령·금액·사례는 실제 점검의 공식 원문과 적용요건을 대조합니다.</li></ol><p>이 체험에서 재점검 화면을 골랐더라도 실제 이행·완료 기록은 생성하지 않았습니다. 이미 만든 업무 보고서는 이후 변경과 분리해 보존합니다.</p></section>
   <footer><strong>검토용 샘플 · 정식 발행/전자서명/법적 판정 아님</strong><p>체험 생성시각: {new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(new Date(snapshot.createdAt))} (한국시간·기기 시계)</p><p>실제 업무는 PSI의 관리자 인증 후 시작하세요. 이 파일을 실제 점검·조치 승인 자료로 사용하지 마세요.</p></footer>
  </article><div className="ip-report-return"><a href="/?mode=photo-inspector">내 사진으로 실제 점검 시작 ↗</a><button type="button" onClick={onClose}>체험으로 돌아가기</button></div>
 </dialog>,document.body);
}
