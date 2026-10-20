import { createHash } from 'node:crypto';
import { buildInspectorPrompt } from '../../inspector/prompt.js';
import { parseVisionImport } from '../../inspector/validation.js';
import type { Evidence, Inspection } from '../../inspector/types.js';
export function inspectorAiConfig(){
    const provider=process.env.PSI_INSPECTOR_AI_PROVIDER || 'gemini';
    const model=process.env.PSI_INSPECTOR_AI_MODEL || (provider==='gemini'?'gemini-3.5-flash-lite':'');
    const key=provider==='gemini'?(process.env.GEMINI_API_KEY||process.env.GOOGLE_GEMINI_API_KEY||process.env.GOOGLE_API_KEY||''):provider==='openai'?(process.env.OPENAI_API_KEY||''):'';
    return {provider,model,key,ready:!!key&&/^[a-zA-Z0-9._-]{1,100}$/.test(model),maxCalls:20,maxOutputTokens:4096};
}
export function analysisFingerprint(item:Inspection,photo:Evidence,model:string){return createHash('sha256').update(JSON.stringify({version:2,photo:photo.sha256,photoId:photo.id,notes:item.document.photoNotes?.[photo.id]||'',common:item.document.notes,site:item.document.siteName,location:item.document.location,work:item.document.workType,event:item.document.eventAt,model})).digest('hex');}
export async function analyzeInspectorPhoto(db:any,item:Inspection,photo:Evidence){
    const config=inspectorAiConfig();if(!item.document.apiEnabled)throw new Error('사진점검 API가 OFF 상태입니다.');if(!config.ready)throw new Error('서버의 사진점검 공급자·모델·API 키 설정이 필요합니다.');
    const fingerprint=analysisFingerprint(item,photo,config.provider+':'+config.model);
    const reserved=await db.rpc('psi_inspector_reserve',{p_id:item.id,p_operation:fingerprint,p_kind:'analysis',p_bytes:0});
    if(reserved.error||!reserved.data)throw new Error('이미 요청한 분석이거나 점검당 20회 한도에 도달했습니다. 자동 재요청하지 않습니다.');
    try{
        const record=await db.from('psi_inspector_evidence').select('storage_key').eq('inspection_id',item.id).eq('id',photo.id).single();if(record.error||!record.data)throw new Error('사진을 확인하지 못했습니다.');
        const downloaded=await db.storage.from('psi-inspector-evidence').download(record.data.storage_key);if(downloaded.error||!downloaded.data)throw new Error('사진을 읽지 못했습니다.');
        const bytes=Buffer.from(await downloaded.data.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==photo.sha256)throw new Error('사진 검증에 실패했습니다.');
        // Recheck OFF/deletion after preparation, immediately before sending externally.
        const latest=await db.from('psi_inspector_inspections').select('revision,document').eq('id',item.id).single();
        const guard=await db.from('psi_inspector_controls').select('state').eq('inspection_id',item.id).maybeSingle();
        if(latest.error||guard.error||latest.data?.revision!==item.revision||!latest.data?.document.apiEnabled||(guard.data&&guard.data.state!=='active'))throw new Error('설정·사진 설명이 변경되었거나 삭제 중입니다. 분석을 중단했습니다.');
        const prompt=buildInspectorPrompt(item.id,photo,item.document);let text='';
        const common={method:'POST',signal:AbortSignal.timeout(45000)};
        if(config.provider==='gemini'){
            const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`,{...common,headers:{'Content-Type':'application/json','x-goog-api-key':config.key},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:photo.mime_type,data:bytes.toString('base64')}}]}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:config.maxOutputTokens}})});
            if(!response.ok)throw new Error('공급자가 분석을 완료하지 못했습니다. 사용량 확인 후 진행해 주세요.');const result=await response.json();text=(result.candidates?.[0]?.content?.parts||[]).map((p:any)=>p.text||'').join('');
        }else{
            const response=await fetch('https://api.openai.com/v1/responses',{...common,headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.key}`},body:JSON.stringify({model:config.model,store:false,max_output_tokens:config.maxOutputTokens,input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:`data:${photo.mime_type};base64,${bytes.toString('base64')}`,detail:'auto'}]}],text:{format:{type:'json_object'}}})});
            if(!response.ok)throw new Error('공급자가 분석을 완료하지 못했습니다. 사용량 확인 후 진행해 주세요.');const result=await response.json();text=(result.output||[]).flatMap((o:any)=>o.content||[]).filter((c:any)=>c.type==='output_text').map((c:any)=>c.text).join('');
        }
        const analysis=parseVisionImport(text,item.id,photo);return {...analysis,processing_mode:'PAID_API_APPROVED' as const};
    }finally{await db.rpc('psi_inspector_finish',{p_operation:fingerprint});}
}
