import {pendingReviewQueue} from './reviewQueue.js';
import type {InspectionDocument,InspectionSummary} from './types.js';

export type RecordResumeIntent='review'|'actions'|'overview';
export type RecordResumeEntry={id:string;intent:RecordResumeIntent};
export function validResumeEntry(value:RecordResumeEntry|undefined):value is RecordResumeEntry {
    return !!value&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.id)&&['review','actions','overview'].includes(value.intent);
}
export function recordResumeEntry(item:InspectionSummary):RecordResumeEntry {
    return {id:item.id,intent:item.needs_review?'review':item.open_actions>0?'actions':'overview'};
}
export const recordResumeLabel=(item:InspectionSummary)=>item.needs_review?'검토 이어보기':item.open_actions>0?'조치 이어보기':'간편 화면 열기';
/** Re-evaluate the saved document; list summaries may be stale. No implicit approvals. */
export function recordResumeStatus(doc:InspectionDocument){
    const pending=pendingReviewQueue(doc);
    const remaining=doc.actions.filter(action=>action.status!=='verified');
    return {pendingPhotoId:pending[0]?.id||'',pendingPhotos:pending.length,remainingActions:remaining.length};
}
