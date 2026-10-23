import React from 'react';
import type {Inspection} from '../../lib/inspector/types';
import {pendingReviewQueue} from '../../lib/inspector/reviewQueue';

export default function InspectorReviewNavigator({item,photoId,busy,onContinue,onNextPhoto}:{item:Inspection;photoId:string;busy:boolean;onContinue:()=>void;onNextPhoto:()=>void}){
 const doc=item.document,queue=pendingReviewQueue(doc,photoId),next=queue[0],pending=pendingReviewQueue(doc).length;
 return <section className="si-review-navigator" aria-label="위험 단서 우선 연속 검토">
  <div className="si-review-nav-heading"><div><p className="si-eyebrow">현재 점검 · 사진 {doc.photoIds.indexOf(photoId)+1}/{doc.photoIds.length}</p><h2>다음 사진도 이어서 검토</h2></div><span>AI 검토 대기 {pending}장</span></div>
  {next?<><div className={`si-review-next si-review-next-${next.priority}`}><div><small>다음 검토 · 사진 {next.number} · {next.label}</small><b>{next.problem}</b></div><button className="si-btn si-primary" type="button" disabled={busy} onClick={onContinue}>검토 저장 · 다음 대기</button></div><details><summary>검토 순서 보기 · 남은 {queue.length}장</summary><ol>{queue.map(row=><li key={row.id}><span>사진 {row.number}</span><div><b>{row.problem}</b><small>{row.label} · AI 제안</small></div></li>)}</ol></details></>:<p className="si-caption">이 사진 외에 AI 검토 대기 사진은 없습니다. 현재 검토를 저장한 뒤 다음 촬영이나 보고서로 이어가세요.</p>}
  {next&&<button className="si-btn si-review-capture-next" type="button" disabled={busy} onClick={onNextPhoto}>확인하고 다음 사진</button>}
  <p className="si-caption">저장된 AI 제안의 우선순위로만 정렬합니다. 자동 재분석·일괄 승인·안전 판정이 아닙니다. 개선 증빙과 AI 미실행 사진은 대기로 세지 않습니다.</p>
 </section>;
}
