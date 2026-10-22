import {DEFAULT_REVIEW_NOTE} from './expertReview';
import type {InspectionDocument,InspectorAction} from './types';
import {actionPhotoSummary} from './actionFollowup';

type Priority='immediate'|'soon'|'routine'|'expert';
export type ActionSource={photoId:string;photoNumber:number;description:string;reviewNote:string};
export type ActionSuggestion={key:string;title:string;priority:Priority;kind:'ai'|'expert';sources:ActionSource[]};
const rank:Record<Priority,number>={immediate:0,expert:1,soon:2,routine:3};
export const actionPriorityLabel:Record<Priority,string>={immediate:'즉시 검토 제안',soon:'빠른 조치 제안',routine:'일반 조치 제안',expert:'전문가 의견'};
const normalize=(text:string)=>text.normalize('NFC').trim().replace(/\s+/g,' ');

/** Text equality groups proposals, never proves a shared location or a confirmed hazard. */
export function actionSuggestions(doc:InspectionDocument):ActionSuggestion[]{
    const groups=new Map<string,ActionSuggestion>();
    doc.photoIds.forEach((photoId,index)=>{
        const analysis=doc.analyses[photoId],review=doc.reviews[photoId];
        if(!analysis||!review)return;
        const source:ActionSource={photoId,photoNumber:index+1,description:doc.photoNotes?.[photoId]||'',reviewNote:review.note===DEFAULT_REVIEW_NOTE?'':review.note};
        const add=(title:string,priority:Priority,kind:'ai'|'expert')=>{
            if(!title.trim())return;
            const key=kind+':'+normalize(title),old=groups.get(key);
            if(old){if(!old.sources.some(s=>s.photoId===photoId))old.sources.push(source);if(rank[priority]<rank[old.priority])old.priority=priority;}
            else groups.set(key,{key,title:title.trim(),priority,kind,sources:[source]});
        };
        if(source.reviewNote)add(source.reviewNote,'expert','expert');
        if(review.decision==='rejected')return;
        const controls=analysis.risk_findings?.length?analysis.risk_findings:analysis.recommended_controls;
        controls.forEach(control=>add(control.action,control.priority,'ai'));
    });
    return [...groups.values()].sort((a,b)=>rank[a.priority]-rank[b.priority]);
}

/** Prefer the saved expert wording for this exact photo, never a different photo's proposal. */
export function photoActionEntry(doc:InspectionDocument,photoId:string){
    if(!doc.photoIds.includes(photoId))return 'manual';
    const candidates=actionSuggestions(doc).filter(s=>s.sources.some(source=>source.photoId===photoId));
    return (candidates.find(s=>s.kind==='expert')||candidates[0])?.key||'manual';
}
/** Suggestions are confined to the current saved inspection; nothing is retained across inspections. */
export function recentActionOwners(actions:InspectorAction[]){
    return [...new Set([...actions].reverse().map(a=>a.owner.normalize('NFC').trim()).filter(Boolean))].slice(0,5);
}
export function calendarDueDate(day:string,offset:number){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isInteger(offset)||offset<0||offset>365)return '';
    const date=new Date(day+'T00:00:00Z');
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day)return '';
    date.setUTCDate(date.getUTCDate()+offset);
    const result=date.toISOString().slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(result)?result:'';
}

/** Full photo IDs fit even at the 20-photo limit; excerpts are only navigation hints. */
export function actionSourceNote(sources:ActionSource[]){
    return ['등록 시 전문가가 선택한 적용 사진 (현장 범위 확인)',...sources.map(s=>`사진 ${s.photoNumber} · ${s.photoId}${s.description?` · ${normalize(s.description).slice(0,24)}`:''}`)].join('\n');
}
export function duplicateAction(actions:InspectorAction[],candidate:InspectorAction){
    return actions.some(a=>normalize(a.title)===normalize(candidate.title)&&a.owner===candidate.owner&&a.dueDate===candidate.dueDate&&a.note===candidate.note);
}
export const actionStatusLabel=(action:InspectorAction)=>action.status==='verified'?'현장 재점검 확인':action.status==='review-requested'?'완료 검토 요청':'미조치';
export function buildRegisteredActionRequest(actions:InspectorAction[],title:string,photoIds:string[]=[]){
    return ['[등록한 현장 조치]',`점검명: ${title}`,...actions.flatMap((a,n)=>['',`${n+1}. ${a.title}`,`담당: ${a.owner} / 기한: ${a.dueDate} / 상태: ${actionStatusLabel(a)}`,...actionPhotoSummary(a,photoIds),...(a.note?[a.note]:[])]),'','미조치는 완료 후 개선사진과 현장 재점검 결과를 회신해 주세요.'].join('\n');
}
