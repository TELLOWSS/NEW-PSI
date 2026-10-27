import React from 'react';
import {sourceEventStatus,sourceReviewState,type SourceReview} from '../../lib/inspector/sourceReview';
export default function InspectorSourceStatus({review,eventAt,legal=false}:{review?:SourceReview;eventAt?:string;legal?:boolean}){
    const state=sourceReviewState(review);
    return <details className="si-source-status" data-source-state={state.code}><summary><span>{state.label}</span><small>공개일: {review?.publishedAt||'미확인'} · 검토일: {review?.reviewedAt||'미기록'}</small></summary>
        <p className="si-caption">발행기관: {review?.publisher||'기록 미수록'} · 공개일: {review?.publishedAt||'미확인'} · 원문 확인일: {review?.checkedAt||'미기록'} · 검토일: {review?.reviewedAt||'미기록'} · 재검토 기한: {review?.reviewDueAt||'미지정'}</p>
        {review&&<><p className="si-caption">검토자: {review.reviewer||'미기록'} · 검토 이력 #{review.revision}</p>{review.evidence&&<p className="si-caption">확인 근거: {review.evidence}</p>}<p>{review.note}</p></>}
        {legal&&<><p>법정상한과 실제 적용 요건은 별개입니다. {sourceEventStatus(review,eventAt)}. 시행본 후보가 있어도 당시 조문·예외·처분 기준을 대조해야 합니다.</p>{review?.legalEditions.length?review.legalEditions.map(edition=><p key={edition.version}><a href={edition.url} target="_blank" rel="noopener noreferrer">{edition.version} 원문 ↗</a> · 공포 {edition.promulgatedAt||'미확인'} · 시행 {edition.effectiveFrom||'미확인'} ~ {edition.effectiveTo||'종료일 미확인'}<br/>{edition.note}</p>):<p className="si-caption">법령 시행일·개정 이력이 등록되지 않았습니다. 사건 당시 시행본 확인 필요.</p>}</>}
    </details>;
}
