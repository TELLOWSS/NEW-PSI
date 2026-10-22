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
    return (['id','title','owner','dueDate','status','completionPhotoId','note','verifiedAt'] as const).every(key=>a[key]===b[key])&&JSON.stringify(a.sourcePhotoIds||[])===JSON.stringify(b.sourcePhotoIds||[]);
}
