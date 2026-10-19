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
    db={from:vi.fn(table=>{const trace={table,operations:[] as any[]};calls.push(trace);const q:any={then(resolve:any,reject:any){return Promise.resolve(queue.shift()||{data:null,error:null}).then(resolve,reject);}};for(const op of ['select','insert','update','eq','order','limit','lt','or','single','maybeSingle'])q[op]=(...args:any[])=>{trace.operations.push([op,...args]);return q;};return q;}),storage:{from:vi.fn(()=>storage)}};
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
