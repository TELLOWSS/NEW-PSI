import type {Inspection,InspectionDocument,InspectorAction} from './types.js';
import {sameAction} from './actionFollowup.js';

export type AssignmentChange={before:InspectorAction;owner:string;dueDate:string;reason:string};
export function changeActionAssignment(doc:InspectionDocument,change:AssignmentChange):InspectionDocument {
    const old=doc.actions.find(a=>a.id===change.before.id),owner=change.owner.trim(),reason=change.reason.trim();
    if(!old||old.status==='verified'||!sameAction(old,change.before))throw new Error('조치 상태가 바뀌었습니다. 최신 저장 기록을 다시 열어 확인해 주세요.');
    if(!owner||owner.length>100||reason.length<5||reason.length>200)throw new Error('담당자와 변경 이유(5~200자)를 확인해 주세요.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(change.dueDate)||!Number.isFinite(Date.parse(change.dueDate))||new Date(change.dueDate).toISOString().slice(0,10)!==change.dueDate)throw new Error('완료기한을 올바른 날짜로 선택해 주세요.');
    if(owner===old.owner&&change.dueDate===old.dueDate)throw new Error('변경할 담당자 또는 기한을 선택해 주세요.');
    const note=[old.note,`[담당·기한 변경] ${old.owner} / ${old.dueDate} → ${owner} / ${change.dueDate}`,`이유: ${reason}`].filter(Boolean).join('\n');
    if(note.length>2000)throw new Error('조치 기록의 2,000자 한도를 넘습니다. 기존 기록을 줄이거나 지우지 않았습니다.');
    const {materialCompletion:_,...base}=doc;
    return {...base,actions:doc.actions.map(a=>a.id===old.id?{...a,owner,dueDate:change.dueDate,note}:a)};
}
const canonical=(v:unknown):string=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).filter(k=>(v as Record<string,unknown>)[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonical((v as Record<string,unknown>)[k])}`).join(',')}}`:JSON.stringify(v);
/** Read-only recovery; never retry a write or accept a coincidental target match. */
export function recoveredAssignment(before:Inspection,expected:InspectionDocument,after:Inspection,control?:{state:string}|null){
    return (!control||control.state==='active')&&before.id===after.id&&after.revision>before.revision&&canonical(expected)===canonical(after.document);
}
