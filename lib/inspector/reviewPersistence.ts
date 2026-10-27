import type {Evidence,Inspection} from './types.js';
import {DEFAULT_REVIEW_NOTE,type ExpertReview} from './expertReview.js';

export function reviewIsSaved(item:Inspection|null,photoId:string,review:ExpertReview){
 const saved=item?.document.reviews[photoId];
 return !!item?.document.photoIds.includes(photoId)&&!!item.document.analyses[photoId]&&!!saved&&saved.decision===review.decision&&saved.note===(review.note.trim()||DEFAULT_REVIEW_NOTE);
}
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`:JSON.stringify(value);
/** Read back only the same saved photo/analysis/context after a lost confirmation response. */
export function recoveredReview(before:Inspection,after:Inspection,photo:Evidence,evidence:Evidence[],review:ExpertReview,control?:{state:string}|null){
 const id=photo.id,a=before.document,b=after.document;
 return (!control||control.state==='active')&&after.id===before.id&&after.revision>before.revision&&a.photoIds.includes(id)&&b.photoIds.includes(id)&&!!a.analyses[id]&&a.analyses[id].source_photo_sha256===photo.sha256&&evidence.some(p=>p.id===id&&p.inspection_id===before.id&&p.sha256===photo.sha256)&&(a.photoNotes?.[id]||'')===(b.photoNotes?.[id]||'')&&(['title','eventAt','siteName','location','workType','notes','urgent','apiEnabled'] as const).every(key=>a[key]===b[key])&&canonical(a.analyses[id])===canonical(b.analyses[id])&&reviewIsSaved(after,id,review);
}
export type ReviewPosition={inspectionId:string;photoId:string};
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
/** The tab keeps IDs only: never notes, image bytes, analysis or signed URLs. */
export function parseReviewPosition(raw:string|null):ReviewPosition|null{
 if(!raw||raw.length>180)return null;
 try{const value=JSON.parse(raw);return value&&Object.keys(value).length===2&&uuid(value.inspectionId)&&uuid(value.photoId)?{inspectionId:value.inspectionId,photoId:value.photoId}:null;}catch{return null;}
}
export function photoWorkUnsaved(item:Inspection|null,photo:Evidence|null,localId:string|undefined,note:string,title:string,review:ExpertReview){
 if(!photo)return !!localId||!!note.trim()||(title.trim()||'사진 현장점검')!==(item?.document.title||'사진 현장점검');
 if(!item||!item.document.photoIds.includes(photo.id)||localId&&localId!==photo.id)return true;
 return (item.document.photoNotes?.[photo.id]||'')!==note||item.document.title!==(title.trim()||'사진 현장점검')||!!item.document.analyses[photo.id]&&!reviewIsSaved(item,photo.id,review);
}
