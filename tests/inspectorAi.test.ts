import {afterEach,describe,expect,it,vi} from 'vitest';
import {analyzeInspectorPhoto,analysisFingerprint,inspectorAiConfig} from '../lib/server/admin/inspectorAi';
import {newInspectionDocument} from '../lib/inspector/types';
import {createHash} from 'node:crypto';
const bytes=Buffer.from('synthetic image'),photo={id:'a0190000-0000-4000-8000-000000000002',inspection_id:'a0190000-0000-4000-8000-000000000001',sha256:createHash('sha256').update(bytes).digest('hex'),mime_type:'image/jpeg',byte_size:bytes.length,created_at:new Date().toISOString()};
const row=()=>({id:photo.inspection_id,revision:3,created_at:photo.created_at,updated_at:photo.created_at,document:{...newInspectionDocument(),apiEnabled:true,photoNotes:{[photo.id]:'hint for selected photo',other:'wrong photo hint'}}});
function fixture(item=row(),allow=true){const values=[{data:{storage_key:'private/path'}},{data:item},{data:null}];const db:any={rpc:vi.fn().mockResolvedValue({data:allow}),storage:{from:()=>({download:vi.fn().mockResolvedValue({data:new Blob([bytes])})})},from:()=>{const q:any={then:(r:any,j:any)=>Promise.resolve(values.shift()).then(r,j)};for(const method of ['select','eq','single','maybeSingle'])q[method]=()=>q;return q;}};return db;}
function env(provider='openai'){vi.stubEnv('PSI_INSPECTOR_AI_PROVIDER',provider);vi.stubEnv('PSI_INSPECTOR_AI_MODEL','configured-vision-model');vi.stubEnv('OPENAI_API_KEY','fixture-key-do-not-expose');vi.stubEnv('GEMINI_API_KEY','fixture-key-do-not-expose');}
const content=()=>({risk_findings:[],observed_facts:[{text:'발판이 보입니다.',visual_basis:'사진 중앙',confidence:'medium'}],ai_hypotheses:[],requires_confirmation:[],recommended_controls:[{action:'개구부 방호 상태를 확인하세요.',priority:'soon'}],law_candidate_keywords:['개구부'],limitations:['높이 실측 불가']});
const gemini=(text=JSON.stringify(content()),finishReason='STOP')=>({candidates:[{finishReason,content:{parts:[{text}]}}]});
const openai=(text=JSON.stringify(content()))=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text}]}]});
const mock=(result:any)=>{const fetch=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>result});vi.stubGlobal('fetch',fetch);return fetch;};
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('explicit photo analysis boundaries',()=>{
 it('does not access DB or provider while OFF or unconfigured',async()=>{const db=fixture(),fetch=vi.fn();vi.stubGlobal('fetch',fetch);env();await expect(analyzeInspectorPhoto(db,{...row(),document:{...row().document,apiEnabled:false}},photo)).rejects.toThrow('OFF');expect(db.rpc).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();vi.stubEnv('PSI_INSPECTOR_AI_MODEL','');expect(inspectorAiConfig().ready).toBe(false);});
 it('deduplicates operations and rejects changed or switched OFF context before external transfer',async()=>{env();const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(analyzeInspectorPhoto(fixture(row(),false),row(),photo)).rejects.toMatchObject({code:'AI_REQUEST_BLOCKED',retryable:false});await expect(analyzeInspectorPhoto(fixture({...row(),revision:4}),row(),photo)).rejects.toThrow('변경');expect(fetch).not.toHaveBeenCalled();expect(analysisFingerprint(row(),photo,'m')).not.toBe(analysisFingerprint({...row(),document:{...row().document,photoNotes:{[photo.id]:'different hint'}}},photo,'m'));});
 it.each(['gemini','openai'])('sends %s a strict content schema and real image, binding identity on server',async provider=>{
    env(provider);const fetch=mock(provider==='gemini'?gemini():openai()),item=row(),db=fixture(item);
    const result=await analyzeInspectorPhoto(db,item,photo);
    expect(result).toMatchObject({schema_version:'1.1',inspection_id:item.id,photo_id:photo.id,source_photo_sha256:photo.sha256,processing_mode:'PAID_API_APPROVED',observed_facts:content().observed_facts});expect(fetch).toHaveBeenCalledOnce();
    const body=JSON.parse(fetch.mock.calls[0][1].body),schema=provider==='gemini'?body.generationConfig.responseJsonSchema:body.text.format.schema;
    expect(schema.additionalProperties).toBe(false);expect(schema.required).toHaveLength(7);expect(schema.properties).not.toHaveProperty('inspection_id');expect(schema.properties.observed_facts.items.properties.confidence).toEqual({type:'string',enum:['high','medium','low']});
    const prompt=provider==='gemini'?body.contents[0].parts[0].text:body.input[0].content[0].text;expect(prompt).toContain('hint for selected photo');expect(prompt).not.toContain('wrong photo hint');expect(prompt).not.toContain(photo.sha256);
    if(provider==='gemini'){expect(body.contents[0].parts[1].inlineData.data).toBe(bytes.toString('base64'));expect(body.generationConfig.maxOutputTokens).toBe(4096);}else{expect(body.store).toBe(false);expect(body.text.format).toMatchObject({type:'json_schema',strict:true});expect(body.input[0].content[1].image_url).toContain(bytes.toString('base64'));}
    expect(db.rpc).toHaveBeenLastCalledWith('psi_inspector_finish',expect.anything());
 });
 it('rejects the reported nonconforming JSON without fabricating missing fields or legal values',async()=>{
    env('gemini');const fetch=mock(gemini(JSON.stringify({risk_findings:[],observed_facts:['보이는 발판'],fine:5000000})));
    const db=fixture();await expect(analyzeInspectorPhoto(db,row(),photo)).rejects.toMatchObject({code:'AI_RESPONSE_INVALID',retryable:true});expect(fetch).toHaveBeenCalledOnce();expect(db.rpc).toHaveBeenLastCalledWith('psi_inspector_finish',expect.anything());
 });
 it.each([
    ['truncated',()=>gemini(JSON.stringify(content()),'MAX_TOKENS'),'AI_INCOMPLETE',true],
    ['blocked',()=>({promptFeedback:{blockReason:'SAFETY'}}),'AI_REFUSED',false],
    ['empty',()=>gemini(''),'AI_EMPTY_RESPONSE',true],
    ['wrong enum',()=>gemini(JSON.stringify({...content(),observed_facts:[{text:'발판',visual_basis:'중앙',confidence:0.9}]})),'AI_RESPONSE_INVALID',true],
    ['extra authority',()=>gemini(JSON.stringify({...content(),processing_mode:'PAID_API_APPROVED'})),'AI_RESPONSE_INVALID',true],
    ['broken JSON',()=>gemini('{"observed_facts":['),'AI_RESPONSE_INVALID',true],
 ])('handles %s Gemini responses without a second paid call',async(_name,value,code,retryable)=>{env('gemini');const fetch=mock((value as ()=>any)());await expect(analyzeInspectorPhoto(fixture(),row(),photo)).rejects.toMatchObject({code,retryable});expect(fetch).toHaveBeenCalledOnce();});
 it('ignores thinking parts rather than combining them with the answer JSON',async()=>{env('gemini');mock({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'internal reasoning is not a JSON answer'},{text:JSON.stringify(content())}]}}]});expect((await analyzeInspectorPhoto(fixture(),row(),photo)).photo_id).toBe(photo.id);});
 it.each([
    [{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:openai().output},'AI_INCOMPLETE'],
    [{status:'incomplete',incomplete_details:{reason:'content_filter'},output:[]},'AI_REFUSED'],
    [{status:'completed',output:[{content:[{type:'refusal',refusal:'provider refusal'}]}]},'AI_REFUSED'],
 ])('handles incomplete/refused Responses API output before parsing',async(value,code)=>{env();mock(value);await expect(analyzeInspectorPhoto(fixture(),row(),photo)).rejects.toMatchObject({code});});
 it('keeps duplicate request IDs identical and explicit new retry IDs distinct under the existing quota',async()=>{
    env();mock(openai());const seen=new Set<string>(),item=row();
    const call=async(requestId:string)=>{const db=fixture(item);db.rpc.mockImplementation(async(name:string,args:any)=>{if(name!=='psi_inspector_reserve')return {data:true};if(seen.has(args.p_operation))return {data:false};seen.add(args.p_operation);return {data:true};});return analyzeInspectorPhoto(db,item,photo,requestId);};
    await call('a0190000-0000-4000-8000-000000000010');await expect(call('a0190000-0000-4000-8000-000000000010')).rejects.toMatchObject({code:'AI_REQUEST_BLOCKED'});await call('a0190000-0000-4000-8000-000000000011');expect(seen.size).toBe(2);
 });
 it('does not reveal provider HTTP responses or automatically retry failures',async()=>{env();const fetch=mock({});fetch.mockResolvedValue({ok:false,status:503,json:async()=>({error:'secret provider response'})});const error=await analyzeInspectorPhoto(fixture(),row(),photo).catch(e=>e);expect(error).toMatchObject({code:'AI_PROVIDER_REJECTED',retryable:true});expect(error.message).not.toContain('secret');expect(fetch).toHaveBeenCalledOnce();});
});
