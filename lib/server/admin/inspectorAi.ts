import {createHash} from 'node:crypto';
import {inspectorBillingStatus} from './inspectorBilling.js';
import {buildInspectorApiPrompt} from '../../inspector/prompt.js';
import {inspectorVisionContentSchema,parseInspectorApiContent} from '../../inspector/visionContent.js';
import type {InspectorAiCost} from '../../inspector/aiCost.js';
import type {Evidence,Inspection} from '../../inspector/types.js';

export class InspectorAiError extends Error {
    constructor(public code:string,message:string,public retryable=false,public cost?:InspectorAiCost){super(message);}
}
export function inspectorAiConfig(){
    const provider=process.env.PSI_INSPECTOR_AI_PROVIDER || 'gemini';
    const model=process.env.PSI_INSPECTOR_AI_MODEL || (provider==='gemini'?'gemini-3.5-flash-lite':'');
    const key=provider==='gemini'?(process.env.GEMINI_API_KEY_FREE||process.env.GEMINI_API_KEY||process.env.GOOGLE_GEMINI_API_KEY||process.env.GOOGLE_API_KEY||''):provider==='openai'?(process.env.OPENAI_API_KEY||''):'';
    return {provider,model,key,ready:!!key&&/^[a-zA-Z0-9._-]{1,100}$/.test(model),maxCalls:20,maxOutputTokens:4096};
}
export function analysisFingerprint(item:Inspection,photo:Evidence,model:string){return createHash('sha256').update(JSON.stringify({version:5,contract:'vision-content-v2-findings',photo:photo.sha256,photoId:photo.id,notes:item.document.photoNotes?.[photo.id]||'',common:item.document.notes,site:item.document.siteName,location:item.document.location,work:item.document.workType,event:item.document.eventAt,model})).digest('hex');}
const incomplete=()=>new InspectorAiError('AI_INCOMPLETE','AI 응답이 출력 한도에서 중단되었습니다. 사진·설명은 저장되어 있습니다. 필요하면 직접 다시 분석해 주세요. 다시 실행하면 API 사용료가 발생할 수 있습니다.',true);
const refused=()=>new InspectorAiError('AI_REFUSED','AI 공급자가 이 사진의 분석을 제공하지 않았습니다. 사진 속 불필요한 식별정보를 처리하거나 설명으로 기준을 조회해 주세요.');
function geminiText(result:any):string {
    const candidate=result?.candidates?.[0],finish=candidate?.finishReason;
    if(finish==='MAX_TOKENS'||finish==='CONTINUATION')throw incomplete();
    if(result?.promptFeedback?.blockReason||['SAFETY','RECITATION','BLOCKLIST','PROHIBITED_CONTENT','SPII','IMAGE_SAFETY'].includes(finish))throw refused();
    if(finish&&finish!=='STOP')throw new InspectorAiError('AI_INTERRUPTED','AI 응답이 완료되지 않았습니다. 사진·설명은 저장되어 있습니다. 필요하면 직접 다시 분석해 주세요.',true);
    return (Array.isArray(candidate?.content?.parts)?candidate.content.parts:[]).filter((part:any)=>part?.thought!==true&&typeof part?.text==='string').map((part:any)=>part.text).join('');
}
function openaiText(result:any):string {
    if(result?.status==='incomplete'){
        if(result.incomplete_details?.reason==='content_filter')throw refused();
        throw incomplete();
    }
    const content=(Array.isArray(result?.output)?result.output:[]).flatMap((entry:any)=>Array.isArray(entry?.content)?entry.content:[]);
    if(content.some((part:any)=>part?.type==='refusal'))throw refused();
    if(result?.error||(result?.status&&result.status!=='completed'))throw new InspectorAiError('AI_INTERRUPTED','AI 응답이 완료되지 않았습니다. 사진·설명은 저장되어 있습니다.',true);
    return content.filter((part:any)=>part?.type==='output_text'&&typeof part.text==='string').map((part:any)=>part.text).join('');
}
export async function analyzeInspectorPhoto(db:any,item:Inspection,photo:Evidence,requestId?:string,profileToken?:string){
    const config=inspectorAiConfig();
    if(!item.document.apiEnabled)throw new InspectorAiError('AI_OFF','사진점검 API가 OFF 상태입니다.');
    if(!config.ready)throw new InspectorAiError('AI_NOT_CONFIGURED','서버의 사진점검 공급자·모델·API 키 설정이 필요합니다.');
    const billing=await inspectorBillingStatus(config,profileToken);
    if(!billing.allowed)throw new InspectorAiError('AI_COST_BLOCKED',billing.message,false,billing);
    const context=analysisFingerprint(item,photo,config.provider+':'+config.model);
    // Same request ID is idempotent. A new ID is issued only after an explicit, acknowledged retry.
    const operation=requestId?createHash('sha256').update(context+':'+requestId).digest('hex'):context;
    const reserved=await db.rpc('psi_inspector_reserve',{p_id:item.id,p_operation:operation,p_kind:'analysis',p_bytes:0});
    if(reserved.error||!reserved.data)throw new InspectorAiError('AI_REQUEST_BLOCKED','이미 요청한 분석이거나 점검당 20회 한도에 도달했습니다. 저장 기록에서 결과를 확인해 주세요. 자동 재요청하지 않습니다.');
    try{
        const record=await db.from('psi_inspector_evidence').select('storage_key').eq('inspection_id',item.id).eq('id',photo.id).single();if(record.error||!record.data)throw new InspectorAiError('AI_PHOTO_UNAVAILABLE','사진을 확인하지 못했습니다.');
        const downloaded=await db.storage.from('psi-inspector-evidence').download(record.data.storage_key);if(downloaded.error||!downloaded.data)throw new InspectorAiError('AI_PHOTO_UNAVAILABLE','사진을 읽지 못했습니다.');
        const bytes=Buffer.from(await downloaded.data.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==photo.sha256)throw new InspectorAiError('AI_PHOTO_MISMATCH','사진 검증에 실패했습니다.');
        const latest=await db.from('psi_inspector_inspections').select('revision,document').eq('id',item.id).single();
        const guard=await db.from('psi_inspector_controls').select('state').eq('inspection_id',item.id).maybeSingle();
        if(latest.error||guard.error||latest.data?.revision!==item.revision||!latest.data?.document.apiEnabled||(guard.data&&guard.data.state!=='active'))throw new InspectorAiError('AI_CONTEXT_CHANGED','설정·사진 설명이 변경되었거나 삭제 중입니다. 분석을 중단했습니다.');
        const prompt=buildInspectorApiPrompt(item.document,photo.id);
        const common={method:'POST',signal:AbortSignal.timeout(45000)};
        let response:Response;
        try{
            response=config.provider==='gemini'
                ?await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`,{...common,headers:{'Content-Type':'application/json','x-goog-api-key':config.key},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:photo.mime_type,data:bytes.toString('base64')}}]}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:inspectorVisionContentSchema,maxOutputTokens:config.maxOutputTokens}})})
                :await fetch('https://api.openai.com/v1/responses',{...common,headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.key}`},body:JSON.stringify({model:config.model,store:false,max_output_tokens:config.maxOutputTokens,input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:`data:${photo.mime_type};base64,${bytes.toString('base64')}`,detail:'auto'}]}],text:{format:{type:'json_schema',name:'inspector_vision_content',strict:true,schema:inspectorVisionContentSchema}}})});
        }catch{
            throw new InspectorAiError('AI_CONNECTION_FAILED','AI 연결을 완료하지 못했습니다. 사진·설명은 저장되어 있습니다. 필요하면 직접 다시 분석해 주세요. 다시 실행하면 API 사용료가 발생할 수 있습니다.',true);
        }
        if(response.status===429)throw new InspectorAiError('AI_QUOTA_REACHED','공급자 한도에 도달해 분석을 중단했습니다. 유료 전환·다른 모델 호출·자동 재시도는 하지 않습니다. 잔여 한도와 초기화 시각은 공급자에서 확인하세요.',true);
        if(!response.ok)throw new InspectorAiError('AI_PROVIDER_REJECTED','AI 공급자가 요청을 완료하지 못했습니다. API 설정·사용량을 확인하거나 설명으로 기준을 조회해 주세요.',[408,429,500,502,503,504].includes(response.status));
        let result:any;
        try{result=await response.json();}catch{throw new InspectorAiError('AI_RESPONSE_INVALID','AI 응답을 읽지 못했습니다. 사진·설명은 저장되어 있습니다. 직접 다시 분석할 수 있습니다.',true);}
        const text=config.provider==='gemini'?geminiText(result):openaiText(result);
        if(!text.trim())throw new InspectorAiError('AI_EMPTY_RESPONSE','AI가 분석 내용을 반환하지 않았습니다. 사진·설명은 저장되어 있습니다. 직접 다시 분석할 수 있습니다.',true);
        try{return parseInspectorApiContent(text,item.id,photo);}catch{
            throw new InspectorAiError('AI_RESPONSE_INVALID','AI 응답 항목이 표준과 맞지 않아 적용하지 않았습니다. 사진·설명은 저장되어 있습니다. 직접 다시 분석하거나 아래 설명 기반 기준을 볼 수 있습니다. 다시 실행하면 API 사용료가 발생할 수 있습니다.',true);
        }
    }finally{await db.rpc('psi_inspector_finish',{p_operation:operation});}
}

/** Metadata-only connection check: no image, prompt or generateContent request. */
export async function checkInspectorAiConnection(profileToken?:string){
    const config=inspectorAiConfig(),cost=await inspectorBillingStatus(config,profileToken);
    if(!cost.allowed)throw new InspectorAiError('AI_COST_BLOCKED',cost.message,false,cost);
    if(config.provider!=='gemini')throw new InspectorAiError('AI_CHECK_UNSUPPORTED','현재 무료 연결 확인은 Gemini만 지원합니다.');
    let response:Response;try{response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}`,{method:'GET',headers:{'x-goog-api-key':config.key},signal:AbortSignal.timeout(10000),cache:'no-store',redirect:'error'});}catch{throw new InspectorAiError('AI_CHECK_FAILED','공급자 모델 정보 연결을 확인하지 못했습니다. 사진 분석은 실행하지 않았습니다.');}
    if(!response.ok)throw new InspectorAiError('AI_CHECK_REJECTED',`모델 정보 조회가 거부됐습니다 (HTTP ${response.status}). 사진 분석은 실행하지 않았습니다.`);
    const model=await response.json();return {connected:model.name===`models/${config.model}`&&Array.isArray(model.supportedGenerationMethods)&&model.supportedGenerationMethods.includes('generateContent'),provider:config.provider,model:config.model,inferenceRequests:0,cost};
}
