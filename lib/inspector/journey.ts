import type {InspectionDocument, InspectionReport} from './types.js';
import {DEFAULT_REVIEW_NOTE} from './expertReview.js';
import {actionPhotoSummary} from './actionFollowup.js';
import {sanctionText} from './legal.js';
export const controlPriorityLabel={immediate:'즉시 검토',soon:'우선 검토',routine:'일상 관리'} as const;
export function formatInspectionTimestamp(value:string) {
    const date=new Date(value);
    return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date)+' (한국시간)':'시각 미확인';
}
/** Progress only considers photos in this inspection; optional questions never block completion. */
export function inspectionProgress(doc:InspectionDocument) {
    const reviewedIds=doc.photoIds.filter(id=>!!doc.analyses[id] && doc.reviews[id]?.decision==='accepted');
    const pendingIds=doc.photoIds.filter(id=>!reviewedIds.includes(id));
    const analyzed=doc.photoIds.filter(id=>!!doc.analyses[id]).length;
    const unknown=doc.photoIds.reduce((sum,id)=>sum+(doc.analyses[id]?.requires_confirmation.filter((_,n)=>{
        const answer=doc.confirmationAnswers?.[id]?.find(a=>a.questionIndex===n);
        return !answer||answer.answer==='unknown';
    }).length||0),0);
    return {photos:doc.photoIds.length,analyzed,reviewedIds,pendingIds,unknown};
}
export function buildInspectionBrief(report:InspectionReport) {
    const {inspection,evidence}=report.snapshot,doc=inspection.document;
    const lines=['현장점검 검토 요약',`점검명: ${doc.title}`,`현장·위치: ${[doc.siteName,doc.location].filter(Boolean).join(' / ')||'미입력'}`,`공종: ${doc.workType||'미입력'}`,`점검시점: ${formatInspectionTimestamp(doc.eventAt)}`,`보고서 사진: ${evidence.length}장`];
    if(doc.urgent)lines.push('긴급 검토 요청: 접근통제·작업중지 필요성을 현장 책임자가 우선 검토하세요.');
    if(doc.notes)lines.push(`점검자 진술: ${doc.notes}`);
    evidence.forEach((photo,n)=>{
        const a=doc.analyses[photo.id],review=doc.reviews[photo.id];
        lines.push('',`사진 ${n+1} · ${review?.decision==='rejected'?'전문가 의견 반영':review?.decision==='accepted'?'점검자 확인됨':'확인 대기'}`);
        if(doc.photoNotes?.[photo.id])lines.push(`점검자 설명: ${doc.photoNotes[photo.id]}`);
        if(review?.note&&review.note!==DEFAULT_REVIEW_NOTE)lines.push(`전문가 검토 의견: ${review.note}`);
        if(review?.decision==='rejected'){lines.push('AI 해석 수용 안 함 · 전문가 의견을 기준으로 검토');return;}
        if(!a){lines.push('분석 없음');return;}
        a.risk_findings?.forEach(f=>lines.push(`문제 제안: ${f.problem}`,`가능 위험: ${f.risk}`,`우선 조치(${controlPriorityLabel[f.priority]}): ${f.action}`));
        a.observed_facts.forEach(x=>lines.push(`AI 관찰 제안: ${x.text} / 시각 근거: ${x.visual_basis}`));
        a.ai_hypotheses.forEach(x=>lines.push(`AI 추론·추가 확인 필요: ${x.text} / 이유: ${x.reason}`));
        a.recommended_controls.forEach(x=>lines.push(`개선 권고(${controlPriorityLabel[x.priority]}): ${x.action}`));
        a.requires_confirmation.forEach((x,i)=>{const answer=doc.confirmationAnswers?.[photo.id]?.find(a=>a.questionIndex===i);const state=answer?.answer==='confirmed'?'현장 확인됨':answer?.answer==='not-confirmed'?'확인 결과와 다름':'아직 확인하지 못함';lines.push(`현장 확인: ${x.question} / ${state}${answer?.note?` / 근거: ${answer.note}`:''}`);});
        if(a.limitations.length)lines.push(`판독 한계: ${a.limitations.join(' / ')}`);
    });
    if(doc.actions.length)lines.push('','보고서 작성 당시 등록 조치',...doc.actions.flatMap((action,n)=>[`${n+1}. ${action.title}`,`담당: ${action.owner} / 기한: ${action.dueDate} / 상태: ${action.status==='verified'?'현장 재점검 확인':action.status==='review-requested'?'완료 검토 요청':'미조치'}`,...actionPhotoSummary(action,evidence.map(p=>p.id)),action.note]));
    const legal=report.snapshot.legalReference;
    if(legal){lines.push('',`관련 법령 요지 · 공식 원문 대조 ${legal.reviewedAt}`);if(legal.dateStatus==='outside-reviewed-period')lines.push('사건 당시 법령은 별도 대조 필요');legal.cards.forEach(card=>{lines.push(card.title);card.actions.forEach(action=>lines.push(`바로 할 조치: ${action}`));card.duties.forEach(d=>lines.push(`${d.label}: ${d.summary}`,d.url));card.sanctions.forEach(s=>lines.push(`${s.actor}: ${sanctionText(s)} / 조건: ${s.condition} / 근거: ${s.basis}`,s.url));if(card.sanctionNote)lines.push(card.sanctionNote);});lines.push('금액은 법정상한이며 실제 부과액이 아닙니다. 사진별 합산 금지.');legal.inspectionCases?.forEach(c=>lines.push('',`관련 공개 감독사례: ${c.title} (${c.publishedAt})`,c.finding,c.response,`현장 적용 힌트: ${c.lesson}`,c.url));legal.recentTrends?.forEach(t=>lines.push('',`작성 시점 수록 동향: ${t.title} (발표 ${t.publishedAt})`,`${t.kind} · ${t.period}`,t.summary,t.fieldAction,t.url));}
    lines.push('',`${legal?'법령의 현장 적용 검토':'작성 당시 법령 자료 미수록'} · 최종 승인 전. 개선 권고는 실제 조치 완료를 의미하지 않습니다.`,`보고서: ${report.id} / 점검 버전 ${report.inspection_revision}`);
    return lines.join('\n');
}
