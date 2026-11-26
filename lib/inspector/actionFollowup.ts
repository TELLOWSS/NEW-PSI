import type {InspectionDocument,InspectorAction} from './types.js';

/** A new report retains action evidence even when material completion selected fewer AI photos. */
export function reportPhotoSelection(doc:InspectionDocument):Set<string>{
    return new Set([...(doc.materialCompletion?.photoIds||doc.photoIds),...doc.actions.flatMap(a=>[...(a.sourcePhotoIds||[]),...(a.completionPhotoId?[a.completionPhotoId]:[])])]);
}
export function actionPhotoSummary(action:InspectorAction,photoIds:string[]){
    const number=(id:string)=>{const index=photoIds.indexOf(id);return index<0?'보고서 사진 연결 확인 필요':`사진 ${index+1}`;};
    return [...(action.sourcePhotoIds?.length?[`조치 전: ${action.sourcePhotoIds.map(number).join(', ')}`]:[]),...(action.completionPhotoId?[`개선 후: ${number(action.completionPhotoId)}`]:[])];
}
export function sameAction(a:InspectorAction,b:InspectorAction){
    return (['id','title','owner','dueDate','status','completionPhotoId','note','verifiedAt'] as const).every(key=>a[key]===b[key])&&JSON.stringify(a.sourcePhotoIds||[])===JSON.stringify(b.sourcePhotoIds||[])&&(a.scheduleContext||'')===(b.scheduleContext||'');
}
export const REJECTION_NOTE_PREFIX='[재점검 반려';
/** Returns chronological reinspection rejection entries preserved in action.note. */
export function extractRejectionHistory(note:string):string[]{
    return String(note||'').split(/\r?\n/).map(line=>line.trim()).filter(line=>line.startsWith(REJECTION_NOTE_PREFIX));
}
/** Prepends a bounded reinspection rejection entry while keeping previous context within 2,000 chars. */
export function buildRejectionNote(previousNote:string,reason:string,rejectedPhotoLabel='',timestamp=''):string{
    const cleanReason=reason.trim().replace(/\r?\n+/g,' ');
    if(cleanReason.length<5)throw new Error('보완 재요청(반려) 사유를 5자 이상 적어 주세요.');
    const meta=[timestamp.trim(),rejectedPhotoLabel.trim()].filter(Boolean).join(' · ');
    const entry=`${REJECTION_NOTE_PREFIX}${meta?` · ${meta}`:''}] ${cleanReason}`.slice(0,2000);
    const prev=String(previousNote||'').trim();
    if(!prev)return entry;
    const maxPrev=2000-entry.length-1;
    if(maxPrev<=0)return entry;
    const clippedPrev=prev.length>maxPrev?prev.slice(0,maxPrev):prev;
    return `${entry}\n${clippedPrev}`;
}
/** Returns a review-requested action back to open for remedial work while keeping evidence and audit history. */
export function buildRejectedAction(action:InspectorAction,reason:string,rejectedPhotoLabel='',timestamp=''):InspectorAction{
    if(action.status==='verified')throw new Error('확정된 개선기록은 반려할 수 없습니다.');
    if(action.status!=='review-requested')throw new Error('완료 검토 요청 상태의 조치만 보완 재요청(반려)할 수 있습니다.');
    const {verifiedAt:_ignored,...rest}=action;
    return {...rest,status:'open',completionPhotoId:'',note:buildRejectionNote(action.note,reason,rejectedPhotoLabel,timestamp)};
}
