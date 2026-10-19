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
let queue:any[],calls:any[],db:any;
const req=(body:any,method='POST')=>({method,body,headers:{}});
beforeEach(()=>{vi.resetAllMocks();delete process.env.PSI_DEPLOYMENT_MODEL;queue=[];calls=[];mocks.auth.mockReturnValue(true);mocks.quota.mockResolvedValue({allowed:true});
    db={from:vi.fn(table=>{const trace={table,operations:[] as any[]};calls.push(trace);const q:any={then(resolve:any,reject:any){return Promise.resolve(queue.shift()||{data:null,error:null}).then(resolve,reject);}};for(const op of ['select','insert','update','eq','order','limit','lt','single','maybeSingle'])q[op]=(...args:any[])=>{trace.operations.push([op,...args]);return q;};return q;}),storage:{from:vi.fn(()=>({upload:vi.fn().mockResolvedValue({error:null}),remove:vi.fn(),createSignedUrl:vi.fn().mockResolvedValue({data:{signedUrl:'https://example.invalid/signed'},error:null})}))}};
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
    it('does not expose another inspection photo by guessed photo ID',async()=>{queue.push({data:row(),error:null},{data:null,error:null});const res=response();await inspector(req({op:'photo',id,photoId}),res);expect(res.code).toBe(404);expect(calls[1].operations).toContainEqual(['eq','inspection_id',id]);expect(db.storage.from).not.toHaveBeenCalled();});
    it('requires submitted improvement evidence before administrator verification',async()=>{queue.push({data:row(),error:null});const res=response();await inspector(req({op:'verify-action',id,actionId:photoId,expectedRevision:1,verificationNote:'I verified on site'}),res);expect(res.code).toBe(409);expect(calls.some(c=>c.operations.some((x:any)=>x[0]==='update'))).toBe(false);});
    it('freezes report data with unverified law state instead of approving unresolved actions',async()=>{queue.push({data:row(),error:null},{data:[],error:null},{data:{id:photoId},error:null});const res=response();await inspector(req({op:'report',id,expectedRevision:1}),res);expect(res.code).toBe(201);const insert=calls[2].operations.find((x:any)=>x[0]==='insert')[1];expect(insert.snapshot).toMatchObject({legalStatus:'UNVERIFIED',reportStatus:'DRAFT',inspection:{revision:1}});expect(insert.snapshot_sha256).toMatch(/^[a-f0-9]{64}$/);});
    it('does not return provider errors, storage paths or secrets to clients',async()=>{queue.push({error:{code:'42P01',message:'secret-key and SQL details'},data:null});const res=response();await inspector(req({op:'list'}),res);expect(res.code).toBe(503);expect(JSON.stringify(res.body)).not.toContain('secret-key');});
});
