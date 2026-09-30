import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({context:vi.fn(),authenticate:vi.fn(),rpc:vi.fn()}));
vi.mock('../lib/server/tenantAuth.js',async original=>({...await original<typeof import('../lib/server/tenantAuth')>(),requireTenantContext:mocks.context,authenticateTenantUser:mocks.authenticate}));
import handler from '../api/saas/access';
import {TenantAccessError} from '../lib/server/tenantAuth';
const tenant='b9300000-0000-4000-8000-000000000001',id='c9300000-0000-4000-8000-000000000001',requestId='d9300000-0000-4000-8000-000000000001';
const res=()=>({code:0,body:null as any,setHeader:vi.fn(),status(code:number){this.code=code;return this;},json(body:any){this.body=body;return this;}});
const req=(resource:string,method='GET',body?:unknown,query={})=>({method,body,headers:{authorization:'Bearer token'},query:{resource,...query}});
const release=()=>({tenant_id:tenant,id,draft_id:id,draft_revision:1,title:'Education',site_name:'Site',worker_ids:[id],expires_at:'2026-10-01T00:00:00Z',revoked:false,revision:1,created_at:'2026-09-30T00:00:00Z',created_by:'private'});
beforeEach(()=>{vi.resetAllMocks();const principal={tenantId:tenant,userId:id,role:'owner',client:{rpc:mocks.rpc}};mocks.context.mockResolvedValue(principal);mocks.authenticate.mockResolvedValue(principal);});
it('uses personal authentication without requiring an administrator membership',async()=>{
 mocks.rpc.mockResolvedValue({data:{title:'Education',siteName:'Site',sourceTextKo:'원문',workerName:'Worker',expiresAt:'2026-10-01',draftRevision:1,private:'secret'},error:null});
 const request=req('worker-education','GET',undefined,{releaseId:id,workerId:id}),response=res();await handler(request,response);
 expect(response.code).toBe(200);expect(mocks.authenticate).toHaveBeenCalledWith(request);expect(mocks.context).not.toHaveBeenCalled();
 expect(mocks.rpc).toHaveBeenCalledWith('psi_read_worker_education',{p_release:id,p_worker:id});expect(JSON.stringify(response.body)).not.toContain('secret');
 expect(response.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');
});
it('requires manager authority and server-derived tenant for publication',async()=>{
 mocks.rpc.mockResolvedValue({data:[release()],error:null});const request=req('education-releases','POST',{draftId:id,expectedRevision:1,requestId,hours:24}),response=res();await handler(request,response);
 expect(response.code).toBe(201);expect(mocks.context).toHaveBeenCalledWith(request,['owner','admin']);
 expect(mocks.rpc).toHaveBeenCalledWith('psi_publish_tenant_education',{p_tenant:tenant,p_draft:id,p_expected:1,p_request:requestId,p_hours:24});expect(JSON.stringify(response.body)).not.toContain('private');
});
it('links a normalized email to a worker with expected revision, without client user IDs',async()=>{
 mocks.rpc.mockResolvedValue({data:{tenant_id:tenant,worker_id:id,email:'worker@example.invalid',active:true,revision:1,updated_at:'2026-09-30',user_id:'private'},error:null});
 const response=res();await handler(req('worker-accounts','POST',{workerId:id,email:' Worker@Example.invalid ',expectedRevision:0}),response);
 expect(response.code).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith('psi_link_worker_account',{p_tenant:tenant,p_worker:id,p_email:'worker@example.invalid',p_expected:0});expect(JSON.stringify(response.body)).not.toContain('private');
});
it.each(['tenantId','tenant_id','userId','user_id','created_by','role'])('rejects client authority field %s',async field=>{
 const response=res();await handler(req('education-releases','POST',{draftId:id,expectedRevision:1,requestId,hours:24,[field]:id}),response);expect(response.code).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([0,169,1.5,null])('rejects invalid lifetime %s',async hours=>{
 const response=res();await handler(req('education-releases','POST',{draftId:id,expectedRevision:1,requestId,hours}),response);expect(response.code).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([['42501',403],['40001',409],['23505',409],['23514',409],['unexpected',503]])('sanitizes database failure %s',async(code,status)=>{
 mocks.rpc.mockResolvedValue({data:null,error:{code,message:'sensitive database detail'}});const response=res();await handler(req('worker-education','GET',undefined,{releaseId:id,workerId:id}),response);expect(response.code).toBe(status);expect(JSON.stringify(response.body)).not.toContain('sensitive');
});
it.each(['worker-accounts','education-releases','worker-education'])('rejects unsupported method for %s',async resource=>{
 const response=res();await handler(req(resource,'DELETE'),response);expect(response.code).toBe(405);expect(mocks.context).not.toHaveBeenCalled();expect(mocks.authenticate).not.toHaveBeenCalled();
});
it('stops before storage when personal authentication fails',async()=>{
 mocks.authenticate.mockRejectedValue(new TenantAccessError(401,'SESSION_INVALID','Login required'));const response=res();await handler(req('worker-education','GET',undefined,{releaseId:id,workerId:id}),response);expect(response.code).toBe(401);expect(mocks.rpc).not.toHaveBeenCalled();
});
it('rejects oversized inputs without executing account lookup',async()=>{
 const response=res();await handler(req('worker-accounts','POST',{workerId:id,email:'x'.repeat(5000),expectedRevision:0}),response);expect(response.code).toBe(413);expect(mocks.rpc).not.toHaveBeenCalled();
});
