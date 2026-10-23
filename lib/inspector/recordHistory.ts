import type {InspectionSummary} from './types.js';

export type RecordOrder='created'|'updated'|'attention';
export const recordOrderLabels:Record<RecordOrder,string>={created:'최근 등록순',updated:'최근 수정순',attention:'긴급·미결 우선'};
export function sortInspectionRecords(items:InspectionSummary[],order:RecordOrder){
    const time=(value:string)=>Number.isFinite(Date.parse(value))?Date.parse(value):0;
    return [...items].sort((a,b)=>{
        if(order==='attention'){
            const priority=Number(b.urgent)-Number(a.urgent)||Number(b.open_actions>0)-Number(a.open_actions>0)||Number(b.needs_review)-Number(a.needs_review);
            if(priority)return priority;
        }
        return time(order==='updated'?b.updated_at:b.created_at)-time(order==='updated'?a.updated_at:a.created_at)||b.id.localeCompare(a.id);
    });
}

// Same-tab recovery pointers only. Never persist titles, photos, analysis or credentials.
export type DeletionPointer={id:string;revision:number};
export const RECORD_DELETIONS_KEY='psi.inspector.record-deletions.v1';
export function parseDeletionPointers(raw:string|null):DeletionPointer[]{
    try{
        const parsed:unknown=JSON.parse(raw||'[]');
        if(!Array.isArray(parsed))return [];
        const seen=new Set<string>();
        return parsed.flatMap(value=>{
            if(!value||typeof value!=='object'||typeof value.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.id)||!Number.isSafeInteger(value.revision)||value.revision<0||seen.has(value.id))return [];
            seen.add(value.id);return [{id:value.id,revision:value.revision}];
        });
    }catch{return [];}
}
