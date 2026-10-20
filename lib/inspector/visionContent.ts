import {visionSchema} from './visionSchema.js';
import {InspectorInputError,parseVisionImport} from './validation.js';
import type {Evidence,VisionImport} from './types.js';

// Providers generate observations only. Record identity, asset hashes and provenance belong to the server.
const limits={observed_facts:6,ai_hypotheses:3,requires_confirmation:3,recommended_controls:6,law_candidate_keywords:8,limitations:3} as const;
type ContentKey=keyof typeof limits;
export type InspectorVisionContent=Pick<VisionImport,ContentKey>;
function providerShape(input:any):any {
    const out:any={};
    if(input.type)out.type=input.type;
    if(input.enum){out.type='string';out.enum=[...input.enum];}
    if(input.properties){out.properties=Object.fromEntries(Object.entries(input.properties).map(([key,value])=>[key,providerShape(value)]));out.required=[...input.required];out.additionalProperties=false;}
    if(input.items)out.items=providerShape(input.items);
    return out;
}
export const inspectorVisionContentSchema={
    type:'object',additionalProperties:false,required:Object.keys(limits),
    properties:Object.fromEntries(Object.entries(limits).map(([key,maxItems])=>[key,{...providerShape(visionSchema.properties[key as ContentKey]),maxItems}]))
};
export function parseInspectorApiContent(raw:string,inspectionId:string,photo:Pick<Evidence,'id'|'sha256'>):VisionImport {
    if(typeof raw!=='string'||new TextEncoder().encode(raw).length>100_000)throw new InspectorInputError('AI 응답 크기를 확인할 수 없습니다.');
    let value:any;
    try{value=JSON.parse(raw);}catch{throw new InspectorInputError('AI 응답이 완성된 JSON이 아닙니다.');}
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!Object.hasOwn(limits,key))
        ||Object.entries(limits).some(([key,max])=>!Array.isArray(value[key])||value[key].length>max))throw new InspectorInputError('AI 응답 항목이 표준과 다릅니다.');
    const checked=parseVisionImport({...value,schema_version:'1.1',inspection_id:inspectionId,photo_id:photo.id,source_photo_sha256:photo.sha256,processing_mode:'CHATGPT_MANUAL'},inspectionId,photo);
    return {...checked,processing_mode:'PAID_API_APPROVED'};
}
