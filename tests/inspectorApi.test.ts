import {createHash} from 'node:crypto';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),client:vi.fn(),quota:vi.fn()}));
vi.mock('../lib/server/adminAuthGuard.js',()=>({isValidAdminAuthRequest:mocks.auth}));
vi.mock('../lib/server/supabaseServer.js',()=>({createSupabaseServerClient:mocks.client}));
vi.mock('../lib/server/apiSecurity.js',()=>({consumeApiQuota:mocks.quota,resolveRequestFingerprint:()=> 'hashed-request'}));
import inspector from '../lib/server/admin/inspector';
import {newInspectionDocument} from '../lib/inspector/types';
const id='a0190000-0000-4000-8000-000000000001',photoId='a0190000-0000-4000-8000-000000000002';
const row=(document=newInspectionDocument())=>({id,revision:1,document,created_at:'2026-10-19T00:00:00Z',updated_at:'2026-10-19T00:00:00Z'});
const response=()=>({code:0,body:null as any,setHeader:vi.fn(),status(c:number){this.code=c;return this;},json(b:any){this.body=b;return this;}});
let queue:any[],calls:any[],db:any,storage:any;
const req=(body:any,method='POST')=>({method,body,headers:{}});
beforeEach(()=>{vi.resetAllMocks();delete process.env.PSI_DEPLOYMENT_MODEL;queue=[];calls=[];mocks.auth.mockReturnValue(true);mocks.quota.mockResolvedValue({allowed:true});
    storage={upload:vi.fn().mockResolvedValue({error:null}),remove:vi.fn(),download:vi.fn(),createSignedUrl:vi.fn().mockResolvedValue({data:{signedUrl:'https://example.invalid/signed'},error:null})};
    db={rpc:vi.fn().mockResolvedValue({data:true,error:null}),from:vi.fn(table=>{const trace={table,operations:[] as any[]};calls.push(trace);const q:any={then(resolve:any,reject:any){return Promise.resolve(queue.shift()||{data:null,error:null}).then(resolve,reject);}};for(const op of ['select','insert','update','eq','order','limit','lt','or','single','maybeSingle'])q[op]=(...args:any[])=>{trace.operations.push([op,...args]);return q;};return q;}),storage:{from:vi.fn(()=>storage)}};
    mocks.client.mockReturnValue(db);
});
describe('server authenticated dedicated inspector boundary',()=>{
    it('rejects anonymous users before connecting storage',async()=>{mocks.auth.mockReturnValue(false);const res=response();await inspector(req({op:'list'}),res);expect(res.code).toBe(401);expect(mocks.client).not.toHaveBeenCalled();});
    it('rejects shared SaaS mode even if a stale authentication check returns true',async()=>{process.env.PSI_DEPLOYMENT_MODEL='shared-saas';const res=response();await inspector(req({op:'list'}),res);expect(res.code).toBe(403);expect(mocks.client).not.toHaveBeenCalled();});
    it.each(['analyze','paid-analyze','siwc'])('blocks automatic AI operation %s without provider or database calls',async op=>{const res=response();await inspector(req({op}),res);expect(res.code).toBe(403);expect(mocks.client).not.toHaveBeenCalled();});
    it('rejects malformed and oversized requests without accessing storage',async()=>{for(const value of ['{bad','x'.repeat(4_250_001)]){const res=response();await inspector(req(value),res);expect(res.code).toBeGreaterThanOrEqual(400);expect(mocks.client).not.toHaveBeenCalled();}});
    it('returns private no-store and enforces quota before business reads',async()=>{mocks.quota.mockResolvedValue({allowed:false,retryAfterSeconds:15});const res=response();await inspector(req({op:'list'}),res);expect(res.code).toBe(429);expect(db.from).not.toHaveBeenCalled();expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','private, no-store');});
    it('binds optimistic writes to record ID and revision and rejects authority injection',async()=>{queue.push({data:row(),error:null},{data:[],error:null},{data:{...row(),revision:2},error:null});const res=response();await inspector(req({op:'save',id,expectedRevision:1,document:newInspectionDocument()}),res);expect(res.code).toBe(200);expect(calls[2].operations).toContainEqual(['eq','revision',1]);expect(calls[2].operations).toContainEqual(['eq','id',id]);});
    it('rejects stale writes and prevents approval smuggling via document save',async()=>{
        const doc={...newInspectionDocument(),actions:[{id:photoId,title:'Guardrail repair',owner:'Manager',dueDate:'2026-10-20',status:'verified' as const,completionPhotoId:'',note:'Forged approval',verifiedAt:new Date().toISOString()}]};
        queue.push({data:row(),error:null},{data:[],error:null});const res=response();await inspector(req({op:'save',id,expectedRevision:1,document:doc}),res);expect(res.code).toBe(400);expect(calls.some(c=>c.operations.some((x:any)=>x[0]==='update'))).toBe(false);
    });
    it('requires upload consent, validates real signatures, and hashes original bytes on server',async()=>{
        for(const [base64,uploadConfirmed,code] of [['not base64',true,413],[Buffer.from('not image').toString('base64'),true,400],['aaaa',false,400]] as const){queue.push({data:row(),error:null});const res=response();await inspector(req({op:'upload',id,photoId,base64,uploadConfirmed}),res);expect(res.code).toBe(code);}expect(db.storage.from).not.toHaveBeenCalled();
    });
    it('does not expose another inspection photo by guessed photo ID',async()=>{queue.push({data:row(),error:null},{data:null,error:null},{data:null,error:null});const res=response();await inspector(req({op:'photo',id,photoId}),res);expect(res.code).toBe(404);expect(calls[2].operations).toContainEqual(['eq','inspection_id',id]);expect(db.storage.from).not.toHaveBeenCalled();});
    it('requires submitted improvement evidence before administrator verification',async()=>{queue.push({data:row(),error:null});const res=response();await inspector(req({op:'verify-action',id,actionId:photoId,expectedRevision:1,verificationNote:'I verified on site'}),res);expect(res.code).toBe(409);expect(calls.some(c=>c.operations.some((x:any)=>x[0]==='update'))).toBe(false);});
    it('freezes report data with unverified law state instead of approving unresolved actions',async()=>{queue.push({data:row(),error:null},{data:[],error:null},{data:{id:photoId},error:null});const res=response();await inspector(req({op:'report',id,expectedRevision:1}),res);expect(res.code).toBe(201);const insert=calls[2].operations.find((x:any)=>x[0]==='insert')[1];expect(insert.snapshot).toMatchObject({legalStatus:'UNVERIFIED',reportStatus:'DRAFT',inspection:{revision:1}});expect(insert.snapshot_sha256).toMatch(/^[a-f0-9]{64}$/);});
    it('freezes official legal references server-side without trusting client fine fields',async()=>{
        const document={...newInspectionDocument(),notes:'개구부 덮개 없음',eventAt:'2026-10-20T00:00:00Z'};
        queue.push({data:row(document),error:null},{data:[],error:null},{data:{id:photoId},error:null});
        const res=response();await inspector(req({op:'report',id,expectedRevision:1}),res);expect(res.code).toBe(201);
        const inserted=calls[2].operations.find((x:any)=>x[0]==='insert')[1];
        expect(inserted.snapshot.legalReference).toMatchObject({version:'kr-osh-2026-10-20-v3-cases-trends-2026-10-22',reviewedAt:'2026-10-20',cards:[{id:'opening',sanctions:[{fineMaxKRW:50_000_000,kind:'criminal'}]}]});
        expect(inserted.snapshot.legalReference.inspectionCases).toHaveLength(4);
        const stable=JSON.stringify(inserted.snapshot);document.notes='감전';expect(JSON.stringify(inserted.snapshot.legalReference)).toContain('opening');expect(stable).toContain('제43조');
        queue.push({data:row(),error:null});const rejected=response();await inspector(req({op:'report',id,expectedRevision:1,legalReference:{amount:1}}),rejected);expect(rejected.code).toBe(400);
    });
    it('does not return provider errors, storage paths or secrets to clients',async()=>{queue.push({error:{code:'42P01',message:'secret-key and SQL details'},data:null});const res=response();await inspector(req({op:'list'}),res);expect(res.code).toBe(503);expect(JSON.stringify(res.body)).not.toContain('secret-key');});
});

const photoBytes=Buffer.from('89504e470d0a1a0a00000000','hex');
const photoRow=()=>({id:photoId,inspection_id:id,sha256:createHash('sha256').update(photoBytes).digest('hex'),mime_type:'image/png',byte_size:photoBytes.length,created_at:row().created_at});
const uploadRequest=()=>req({op:'upload',id,photoId,base64:photoBytes.toString('base64'),uploadConfirmed:true});
describe('inspector retry and stable pagination regressions',()=>{
    it.each(['409','Duplicate','ResourceAlreadyExists'])('recovers disconnected uploads with %s and verifies their hash',async statusCode=>{
        storage.upload.mockResolvedValue({error:{statusCode}});storage.download.mockResolvedValue({data:new Blob([photoBytes]),error:null});
        queue.push({data:row(),error:null},{data:[],error:null},{data:[],error:null},{data:photoRow(),error:null});
        const res=response();await inspector(uploadRequest(),res);expect(res.code).toBe(201);expect(storage.download).toHaveBeenCalledOnce();expect(storage.remove).not.toHaveBeenCalled();
    });
    it('rejects a recovery whose original bytes do not match',async()=>{
        storage.upload.mockResolvedValue({error:{statusCode:'409'}});storage.download.mockResolvedValue({data:new Blob(['changed']),error:null});
        queue.push({data:row(),error:null},{data:[],error:null},{data:[],error:null});const res=response();await inspector(uploadRequest(),res);
        expect(res.code).toBe(409);expect(calls.some(c=>c.operations.some((x:any)=>x[0]==='insert'))).toBe(false);
    });
    it('returns the winning concurrent evidence insert without deleting its original',async()=>{
        queue.push({data:row(),error:null},{data:[],error:null},{data:null,error:{code:'23505'}},{data:[photoRow()],error:null});
        const res=response();await inspector(uploadRequest(),res);expect(res.code).toBe(200);expect(res.body.replayed).toBe(true);expect(storage.remove).not.toHaveBeenCalled();
    });
    it('retains private bytes for retry after database failure',async()=>{
        queue.push({data:row(),error:null},{data:[],error:null},{data:null,error:{code:'08006'}});
        const res=response();await inspector(uploadRequest(),res);expect(res.code).toBe(503);expect(storage.remove).not.toHaveBeenCalled();
    });
    it('includes the ID tie-breaker and derives a cursor from the last server row',async()=>{
        const rows=Array.from({length:51},(_,n)=>({id:`a0190000-0000-4000-8000-${String(100-n).padStart(12,'0')}`,created_at:'2026-10-19T12:00:00.123456+00:00'}));
        queue.push({data:rows,error:null});const res=response();await inspector(req({op:'list',before:rows[0].created_at,beforeId:photoId}),res);
        expect(res.code).toBe(200);expect(res.body.items).toHaveLength(50);expect(res.body.nextCursor).toEqual({before:rows[49].created_at,beforeId:rows[49].id});
        expect(calls[0].operations).toContainEqual(['or',`created_at.lt.${rows[0].created_at},and(created_at.eq.${rows[0].created_at},id.lt.${photoId})`]);
    });
    it.each([{beforeId:photoId},{before:'2026-10-19T00:00:00Z',beforeId:'bad),id.gt.0'},{before:'2026-99-99T00:00:00Z',beforeId:photoId}])('rejects unsafe or invalid pagination cursor %#',async cursor=>{
        const res=response();await inspector(req({op:'list',...cursor}),res);expect(res.code).toBe(400);
    });
});

const manualAnalysis=()=>({schema_version:'1.1' as const,inspection_id:id,photo_id:photoId,source_photo_sha256:photoRow().sha256,processing_mode:'CHATGPT_MANUAL' as const,observed_facts:[],ai_hypotheses:[],requires_confirmation:[{question:'Check hidden area?',why:'Outside frame'}],recommended_controls:[],law_candidate_keywords:[],limitations:['Outside frame unknown']});
describe('simple-mode server workflow',()=>{
    it('records explicit expert confirmation without requiring every optional question answer',async()=>{
        const document={...newInspectionDocument(),photoIds:[photoId],analyses:{[photoId]:manualAnalysis()}};queue.push({data:row(document),error:null},{data:[photoRow()],error:null},{data:{...row(document),revision:2},error:null});const res=response();await inspector(req({op:'confirm-photo',id,photoId,expectedRevision:1}),res);expect(res.code).toBe(200);const saved=calls[2].operations.find((o:any)=>o[0]==='update')[1].document;expect(saved.reviews[photoId]).toMatchObject({decision:'accepted',actor:'dedicated-admin'});expect(saved.reviews[photoId].confirmedAt).toMatch(/Z$/);expect(saved.confirmationAnswers).toBeUndefined();
    });
    it('stores a trimmed expert correction with server provenance and clears prior completion',async()=>{
        const document={...newInspectionDocument(),photoIds:[photoId],analyses:{[photoId]:manualAnalysis()},reviews:{[photoId]:{decision:'accepted' as const,note:'기존 검토 의견'}},materialCompletion:{revision:1,completedAt:new Date().toISOString(),photoIds:[photoId]}};
        queue.push({data:row(document),error:null},{data:[photoRow()],error:null},{data:{...row(document),revision:2},error:null});
        const res=response();await inspector(req({op:'confirm-photo',id,photoId,expectedRevision:1,decision:'rejected',reviewNote:'  뒤쪽 난간 설치 확인. 발판 고정 보완 요청  '}),res);
        expect(res.code).toBe(200);const saved=calls[2].operations.find((o:any)=>o[0]==='update')[1].document;
        expect(saved.reviews[photoId]).toMatchObject({decision:'rejected',note:'뒤쪽 난간 설치 확인. 발판 고정 보완 요청',actor:'dedicated-admin'});expect(saved.materialCompletion).toBeUndefined();expect(db.rpc).not.toHaveBeenCalled();
    });
    it.each([{decision:'rejected'},{decision:'rejected',reviewNote:'짧음'},{decision:'accepted',reviewNote:null},{decision:'accepted',reviewNote:'x'.repeat(2001)},{decision:'approved',reviewNote:'검토 기록 있음'}])('rejects invalid or unexplained expert decisions %#',async body=>{
        const document={...newInspectionDocument(),photoIds:[photoId],analyses:{[photoId]:manualAnalysis()}};
        queue.push({data:row(document),error:null},{data:[photoRow()],error:null});const res=response();await inspector(req({op:'confirm-photo',id,photoId,expectedRevision:1,...body}),res);
        expect(res.code).toBe(400);expect(calls.some(c=>c.operations.some((x:any)=>x[0]==='update'))).toBe(false);
    });
    it('completes only accepted photos and rejects fabricated completion on ordinary save',async()=>{
        const document={...newInspectionDocument(),photoIds:[photoId],analyses:{[photoId]:manualAnalysis()},reviews:{[photoId]:{decision:'accepted' as const,note:'Reviewed on site'}}};queue.push({data:row(document),error:null},{data:[photoRow()],error:null},{data:{...row(document),revision:2},error:null});const res=response();await inspector(req({op:'complete-materials',id,expectedRevision:1}),res);expect(res.code).toBe(200);const saved=calls[2].operations.find((o:any)=>o[0]==='update')[1].document;expect(saved.materialCompletion).toMatchObject({revision:2,photoIds:[photoId]});
        queue.push({data:row(document),error:null},{data:[photoRow()],error:null});const forged=response();await inspector(req({op:'save',id,expectedRevision:1,document:saved}),forged);expect(forged.code).toBe(400);
    });
    it('does not complete materials when no analysis was confirmed',async()=>{queue.push({data:row(),error:null},{data:[],error:null});const res=response();await inspector(req({op:'complete-materials',id,expectedRevision:1}),res);expect(res.code).toBe(400);expect(res.body.code).toBe('REVIEW_REQUIRED');});
    it('checks deletion fence before issuing a new signed photo URL',async()=>{queue.push({data:row(),error:null},{data:{state:'files-deleted'},error:null});const res=response();await inspector(req({op:'photo',id,photoId}),res);expect(res.code).toBe(410);expect(storage.createSignedUrl).not.toHaveBeenCalled();});
    it('requires exact inspection-ID acknowledgement for destructive scope',async()=>{const res=response();await inspector(req({op:'delete-inspection',id,mode:'all',expectedRevision:1,confirmation:'yes'}),res);expect(res.code).toBe(400);expect(db.rpc).not.toHaveBeenCalled();});
    it('returns only configured provider metadata and never its secret',async()=>{vi.stubEnv('PSI_INSPECTOR_AI_PROVIDER','openai');vi.stubEnv('PSI_INSPECTOR_AI_MODEL','test-model');vi.stubEnv('OPENAI_API_KEY','never-expose-fixture');try{const res=response();await inspector(req({op:'ai-status'}),res);expect(res.code).toBe(200);expect(res.body).toMatchObject({ready:true,provider:'openai',model:'test-model'});expect(JSON.stringify(res.body)).not.toContain('never-expose-fixture');}finally{vi.unstubAllEnvs();}});
});

describe('structured inspector analysis error response',()=>{
 it('returns a retryable API error without saving malformed output or disclosing the provider response',async()=>{
    const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
    vi.stubEnv('PSI_INSPECTOR_AI_PROVIDER','gemini');vi.stubEnv('PSI_INSPECTOR_AI_MODEL','fixture-model');vi.stubEnv('GEMINI_API_KEY','fixture-do-not-expose');
    const fetch=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({observed_facts:['private invalid provider text']})}]}}]})});vi.stubGlobal('fetch',fetch);
    const document={...newInspectionDocument(),apiEnabled:true,photoIds:[photoId]},item=row(document);
    storage.download.mockResolvedValue({data:new Blob([photoBytes])});
    queue.push({data:item,error:null},{data:[photoRow()],error:null},{data:{storage_key:'private/test-photo'},error:null},{data:item,error:null},{data:null,error:null});
    try{
        const res=response();await inspector(req({op:'analyze-photo',id,photoId,expectedRevision:1,externalConfirmed:true,requestId:'a0190000-0000-4000-8000-000000000010'}),res);
        expect(res.code).toBe(409);expect(res.body).toMatchObject({ok:false,code:'AI_RESPONSE_INVALID',retryable:true});expect(JSON.stringify(res.body)).not.toContain('private invalid');expect(JSON.stringify(res.body)).not.toContain('fixture-do-not-expose');
        expect(fetch).toHaveBeenCalledOnce();expect(calls.some(c=>c.operations.some((x:any)=>x[0]==='update'))).toBe(false);expect(warn).toHaveBeenCalledWith('inspector_ai_failure',{code:'AI_RESPONSE_INVALID',provider:'gemini'});
    }finally{warn.mockRestore();vi.unstubAllGlobals();vi.unstubAllEnvs();}
 });
 it('validates request IDs before any paid operation',async()=>{
    queue.push({data:row(),error:null});const res=response();await inspector(req({op:'analyze-photo',id,photoId,expectedRevision:1,externalConfirmed:true,requestId:'invalid'}),res);expect(res.code).toBe(400);expect(db.rpc).not.toHaveBeenCalled();
 });
});

it('rechecks the deletion fence after signing a URL',async()=>{queue.push({data:row()},{data:null},{data:{storage_key:'own/photo/hash.jpg'}},{data:{state:'deleting'}});const res=response();await inspector(req({op:'photo',id,photoId}),res);expect(res.code).toBe(410);expect(res.body).not.toHaveProperty('url');});

describe('action evidence and server reinspection',()=>{
    const afterId='a0190000-0000-4000-8000-000000000003',actionId='a0190000-0000-4000-8000-000000000004';
    const followup=()=>({...newInspectionDocument(),photoIds:[photoId,afterId],analyses:{[photoId]:manualAnalysis()},reviews:{[photoId]:{decision:'accepted' as const,note:'조치 전 사진 상태 확인'}},actions:[{id:actionId,title:'난간 보완',owner:'형틀반장',dueDate:'2026-10-23',sourcePhotoIds:[photoId],completionPhotoId:afterId,status:'review-requested' as const,note:'난간 고정 및 통로 보완 확인'}],materialCompletion:{photoIds:[photoId],revision:1,completedAt:'2026-10-22T00:00:00.000Z'}});
    const proof=()=>[photoRow(),{...photoRow(),id:afterId,sha256:'b'.repeat(64)}];
    it('requires explicit server reinspection, clears completed materials and records server time',async()=>{const document=followup();queue.push({data:row(document),error:null},{data:proof(),error:null},{data:{...row(document),revision:2},error:null});const res=response();await inspector(req({op:'verify-action',id,actionId,expectedRevision:1,verificationNote:'실제 현장에서 고정 강도와 통행 상태 재확인'}),res);expect(res.code).toBe(200);const saved=calls[2].operations.find((o:any)=>o[0]==='update')[1].document;expect(saved.materialCompletion).toBeUndefined();expect(saved.actions[0]).toMatchObject({status:'verified',sourcePhotoIds:[photoId],completionPhotoId:afterId});expect(saved.actions[0].verifiedAt).toMatch(/Z$/);expect(calls[2].operations).toContainEqual(['eq','revision',1]);});
    it('does not silently add an uploaded but unlinked pending photo to a report',async()=>{const document={...newInspectionDocument(),photoIds:[photoId]};queue.push({data:row(document),error:null},{data:proof(),error:null},{data:{id:actionId},error:null});const res=response();await inspector(req({op:'report',id,expectedRevision:1}),res);expect(res.code).toBe(201);const inserted=calls[2].operations.find((o:any)=>o[0]==='insert')[1];expect(inserted.snapshot.evidence.map((p:any)=>p.id)).toEqual([photoId]);});
    it('does not verify identical original bytes renamed as improvement evidence',async()=>{const document=followup();queue.push({data:row(document),error:null},{data:[photoRow(),{...photoRow(),id:afterId}],error:null});const res=response();await inspector(req({op:'verify-action',id,actionId,expectedRevision:1,verificationNote:'현장 확인했다는 잘못된 요청'}),res);expect(res.code).toBe(400);expect(calls.some(c=>c.operations.some((o:any)=>o[0]==='update'))).toBe(false);});
    it('preserves before and after evidence in a new report even if material selection contains only accepted AI originals',async()=>{const document=followup(),before=JSON.stringify(document);queue.push({data:row(document),error:null},{data:proof(),error:null},{data:{id:actionId},error:null});const res=response();await inspector(req({op:'report',id,expectedRevision:1}),res);expect(res.code).toBe(201);const inserted=calls[2].operations.find((o:any)=>o[0]==='insert')[1];expect(inserted.snapshot.evidence.map((p:any)=>p.id)).toEqual([photoId,afterId]);expect(inserted.snapshot.inspection.document.actions[0].status).toBe('review-requested');expect(JSON.stringify(document)).toBe(before);});
});
