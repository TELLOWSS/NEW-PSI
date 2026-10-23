import type {InspectionDocument,InspectorAction} from './types.js';

export const photoFilterLabels={all:'전체 사진',pending:'AI 검토 대기',manual:'설명 자료',expert:'전문가 의견',improvement:'개선 증빙'} as const;
export type PhotoFilter=keyof typeof photoFilterLabels;
export const actionFilterLabels={all:'전체 조치',unresolved:'미결 전체',open:'미조치','review-requested':'완료 검토 요청',overdue:'기한 지남',verified:'재점검 확인'} as const;
export type ActionFilter=keyof typeof actionFilterLabels;
export function koreanDay(date=new Date()):string {
    return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
function validDay(value:string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
export function overdueAction(action:InspectorAction,today:string):boolean {
    return action.status!=='verified'&&validDay(today)&&validDay(action.dueDate)&&action.dueDate<today;
}
/** Classify metadata only. An improvement without AI is not a pending AI review. */
export function photoQueue(doc:InspectionDocument) {
    const improvements=new Set(doc.actions.map(a=>a.completionPhotoId).filter(Boolean));
    return doc.photoIds.map((id,index)=>{
        const analysis=doc.analyses[id],review=doc.reviews[id];
        const kind:Exclude<PhotoFilter,'all'>|'reviewed'=analysis&&!review?'pending':review?.decision==='rejected'?'expert':review?.decision==='accepted'?'reviewed':improvements.has(id)?'improvement':'manual';
        return {id,number:index+1,description:doc.photoNotes?.[id]||`사진 ${index+1}`,kind,label:kind==='pending'?'AI 검토 대기':kind==='expert'?'전문가 의견 반영':kind==='reviewed'?'확인 완료':kind==='improvement'?'연결된 개선 증빙':'설명 자료'};
    });
}
export function actionQueue(actions:InspectorAction[],filter:ActionFilter,query:string,today:string,order:'registered'|'due'='registered') {
    const term=query.normalize('NFC').trim().toLocaleLowerCase('ko-KR');
    const selected=actions.filter(a=>(filter==='all'||(filter==='unresolved'?a.status!=='verified':filter==='overdue'?overdueAction(a,today):a.status===filter))&&(!term||[a.title,a.owner].some(s=>s.normalize('NFC').toLocaleLowerCase('ko-KR').includes(term))));
    if(order==='due')selected.sort((a,b)=>Number(b.status!=='verified')-Number(a.status!=='verified')||Number(validDay(b.dueDate))-Number(validDay(a.dueDate))||(validDay(a.dueDate)&&validDay(b.dueDate)?a.dueDate.localeCompare(b.dueDate):0));
    return selected;
}
