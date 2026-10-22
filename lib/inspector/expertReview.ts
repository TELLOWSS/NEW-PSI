import type {InspectionReport,VisionImport} from './types.js';
export const DEFAULT_REVIEW_NOTE='점검자가 사진·설명과 분석을 대조하여 확인함';
export type ExpertReview={decision:'accepted'|'rejected';note:string};
export function reviewLabel(review:ExpertReview|undefined,hasAnalysis:boolean){
    return !hasAnalysis?'설명 자료':!review?'검토 대기':review.decision==='rejected'?'전문가 의견 반영':'확인 완료';
}
/** A short operational message. Rejected AI proposals must not become instructions. */
export function buildActionRequest(description:string,analysis:VisionImport|null|undefined,review?:ExpertReview,draft=false){
    const lines=['[현장 조치 검토 요청]'];
    if(review?.note.trim()&&review.note!==DEFAULT_REVIEW_NOTE)lines.push(`전문가 의견${draft?' (저장 전)':''}: ${review.note.trim()}`);
    if(description.trim())lines.push(`${review?.decision==='rejected'?'참고·당초 설명':'현장 상황'}: ${description.trim()}`);
    if(review?.decision==='rejected')lines.push('AI 해석을 수용하지 않았습니다. 전문가 의견을 기준으로 검토해 주세요.');
    else if(analysis){
        if(analysis.risk_findings?.length)analysis.risk_findings.slice(0,3).forEach(f=>lines.push(`검토할 위험: ${f.problem} / ${f.risk}`,`조치 제안: ${f.action}`));
        else analysis.recommended_controls.slice(0,2).forEach(c=>lines.push(`조치 제안: ${c.action}`));
    }
    lines.push('조치 가능 여부와 완료 후 현장 확인 결과를 회신해 주세요.');
    return lines.join('\n');
}

export function buildReportActionRequests(report:InspectionReport){
    const doc=report.snapshot.inspection.document;
    return ['[현장점검 전달 요약]',`점검명: ${doc.title}`,...report.snapshot.evidence.flatMap((photo,n)=>['',`사진 ${n+1}`,buildActionRequest(doc.photoNotes?.[photo.id]||'',doc.analyses[photo.id],doc.reviews[photo.id]).split('\n').slice(1).join('\n')])].join('\n');
}
