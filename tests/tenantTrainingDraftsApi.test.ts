import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ context: vi.fn(), from: vi.fn() }));
vi.mock('../lib/server/tenantAuth.js', async importOriginal => ({
    ...await importOriginal<typeof import('../lib/server/tenantAuth')>(), requireTenantContext: mocks.context,
}));
import handler from '../api/saas/access';
import { TenantAccessError } from '../lib/server/tenantAuth';

const tenantId='b9300000-0000-4000-8000-000000000001';
const userId='a9300000-0000-4000-8000-000000000001';
const id='c9300000-0000-4000-8000-000000000001';
const requestId='d9300000-0000-4000-8000-000000000001';
const row=(overrides={})=>({tenant_id:tenantId,id,title:'Guardrail repair',site_name:'Test site',source_text_ko:'Protective guardrail missing',revision:1,created_at:'2026-09-30T01:00:00.123456+00:00',updated_at:'2026-09-30T01:00:00.123456+00:00',...overrides});
const createBody=()=>({requestId,title:'Guardrail repair',siteName:'Test site',sourceTextKo:'Protective guardrail missing'});
let role='admin';
let queue: any[];
let calls: {table:string; operations:[string,...any[]][]}[];
const response=()=>({code:0,body:null as any,setHeader:vi.fn(),status(code:number){this.code=code;return this;},json(body:any){this.body=body;return this;}});
const request=(method='GET',body?:unknown,query:Record<string,unknown>={})=>({method,headers:{authorization:'Bearer verified-user-token','x-psi-tenant-id':tenantId},query:{resource:'training-drafts',...query},body});

beforeEach(()=>{
    vi.resetAllMocks(); role='admin'; queue=[]; calls=[];
    mocks.context.mockImplementation(async()=>({tenantId,userId,role,client:{from:mocks.from}}));
    mocks.from.mockImplementation(table=>{
        const trace={table,operations:[] as [string,...any[]][]}; calls.push(trace);
        const query:any={then(resolve:any,reject:any){return Promise.resolve(queue.shift()??{data:[],error:null}).then(resolve,reject);}};
        for(const operation of ['select','eq','order','limit','or','insert','update','single','maybeSingle']) query[operation]=(...args:any[])=>{trace.operations.push([operation,...args]);return query;};
        return query;
    });
});

describe('tenant education draft request boundary',()=>{
    it('routes through the existing SaaS function and scopes every list to the verified company',async()=>{
        queue.push({data:[row({unrelated_secret:'not part of DTO'})],error:null});
        const req=request(),res=response(); await handler(req,res);
        expect(res.code).toBe(200); expect(res.body.items[0]).toMatchObject({id,title:'Guardrail repair',revision:1});
        expect(mocks.context).toHaveBeenCalledWith(req,undefined);
        expect(calls[0].operations).toContainEqual(['eq','tenant_id',tenantId]);
        expect(calls[0].operations).toContainEqual(['limit',26]);
        expect(JSON.stringify(res.body)).not.toContain('unrelated_secret');
        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');
    });
    it.each([401,403])('stops before business storage when identity or membership fails (%s)',async status=>{
        mocks.context.mockRejectedValueOnce(new TenantAccessError(status,'DENIED','Denied'));
        const res=response(); await handler(request('POST',createBody()),res);
        expect(res.code).toBe(status); expect(mocks.from).not.toHaveBeenCalled();
    });
    it('requires write roles and binds new records to server-confirmed company and actor defaults',async()=>{
        queue.push({data:row(),error:null});
        const req=request('POST',JSON.stringify(createBody())),res=response(); await handler(req,res);
        expect(res.code).toBe(201);
        expect(mocks.context).toHaveBeenCalledWith(req,['owner','admin','reviewer']);
        expect(calls[0].operations).toContainEqual(['insert',{tenant_id:tenantId,request_id:requestId,title:'Guardrail repair',site_name:'Test site',source_text_ko:'Protective guardrail missing'}]);
    });
    it.each(['tenantId','tenant_id','created_by','updated_by','role','status','revision'])('rejects client-supplied authority field %s',async field=>{
        const res=response(); await handler(request('POST',{...createBody(),[field]:'spoofed'}),res);
        expect(res.code).toBe(400); expect(mocks.from).not.toHaveBeenCalled();
    });
    it.each([null,[], '{broken', {title:'x'},  {...createBody(),title:' '}, {...createBody(),requestId:'bad'}])('rejects malformed or invalid input without writing',async body=>{
        const res=response(); await handler(request('POST',body),res);
        expect(res.code).toBe(400); expect(mocks.from).not.toHaveBeenCalled();
    });
    it('bounds request size before storing arbitrary text',async()=>{
        const res=response(); await handler(request('POST',{...createBody(),sourceTextKo:'x'.repeat(66000)}),res);
        expect(res.code).toBe(413); expect(mocks.from).not.toHaveBeenCalled();
    });
    it('recovers a creation retry only for the same user, company, request and content',async()=>{
        queue.push({data:null,error:{code:'23505'}},{data:row(),error:null});
        const res=response(); await handler(request('POST',createBody()),res);
        expect(res.code).toBe(200); expect(res.body.replayed).toBe(true);
        expect(calls[1].operations).toContainEqual(['eq','tenant_id',tenantId]);
        expect(calls[1].operations).toContainEqual(['eq','created_by',userId]);
        expect(calls[1].operations).toContainEqual(['eq','request_id',requestId]);
    });
    it.each([null,row({title:'Different submitted content'})])('does not overwrite a conflicting creation request',async existing=>{
        queue.push({data:null,error:{code:'23505'}},{data:existing,error:null});
        const res=response(); await handler(request('POST',createBody()),res);
        expect(res.code).toBe(409); expect(res.body.code).toBe('TRAINING_DRAFT_REQUEST_CONFLICT');
        expect(calls.flatMap(call=>call.operations).some(operation=>operation[0]==='update')).toBe(false);
    });
    it('includes company, record ID and expected revision in every update',async()=>{
        queue.push({data:row({title:'Edited draft',revision:2}),error:null});
        const res=response(); await handler(request('PATCH',{id,expectedRevision:1,title:'Edited draft'}),res);
        expect(res.code).toBe(200);
        for(const pair of [['tenant_id',tenantId],['id',id],['revision',1]]) expect(calls[0].operations).toContainEqual(['eq',...pair]);
        expect(calls[0].operations).toContainEqual(['update',{title:'Edited draft'}]);
    });
    it('rejects a stale or inaccessible update with no record content disclosure',async()=>{
        queue.push({data:null,error:null});
        const res=response(); await handler(request('PATCH',{id,expectedRevision:1,title:'New title'}),res);
        expect(res.code).toBe(409); expect(res.body.item).toBeUndefined();
    });
    it('scopes revision history to the same company and record and omits actor identifiers',async()=>{
        queue.push({data:row(),error:null},{data:[{tenant_id:tenantId,draft_id:id,draft_revision:1,title:'Guardrail repair',site_name:'Test site',source_text_ko:'Protective guardrail missing',occurred_at:'2026-09-30',actor_id:'private'}],error:null});
        const res=response(); await handler(request('GET',undefined,{id}),res);
        expect(res.code).toBe(200); expect(res.body.events[0].revision).toBe(1);
        expect(calls[1].operations).toContainEqual(['eq','tenant_id',tenantId]);
        expect(calls[1].operations).toContainEqual(['eq','draft_id',id]);
        expect(JSON.stringify(res.body)).not.toContain('private');
    });
    it('does not query history for a missing or foreign record',async()=>{
        queue.push({data:null,error:null}); const res=response();
        await handler(request('GET',undefined,{id}),res);
        expect(res.code).toBe(404); expect(mocks.from).toHaveBeenCalledTimes(1);
    });
    it('fails closed if a returned row is unexpectedly from another company',async()=>{
        queue.push({data:[row({tenant_id:'b9300000-0000-4000-8000-000000000002'})],error:null});
        const res=response(); await handler(request(),res);
        expect(res.code).toBe(503); expect(res.body.items).toBeUndefined();
    });
    it('preserves timestamp microseconds for pagination and rejects filter injection',async()=>{
        queue.push({data:Array.from({length:26},()=>row()),error:null}); const res=response();
        await handler(request(),res);
        const cursor=res.body.nextCursor;
        expect(JSON.parse(Buffer.from(cursor,'base64url').toString()).createdAt).toBe(row().created_at);
        queue.push({data:[],error:null}); await handler(request('GET',undefined,{cursor}),res);
        expect(calls[1].operations).toContainEqual(['or',`created_at.lt.${row().created_at},and(created_at.eq.${row().created_at},id.lt.${id})`]);
        const malicious=Buffer.from(JSON.stringify({createdAt:'x),tenant_id.eq.other',id})).toString('base64url');
        await handler(request('GET',undefined,{cursor:malicious}),res);
        expect(res.code).toBe(400); expect(mocks.from).toHaveBeenCalledTimes(2);
    });
    it('keeps unsupported methods/resources out of storage',async()=>{
        const res=response(); await handler(request('DELETE'),res); expect(res.code).toBe(405);
        await handler(request('POST',{}, {resource:['actions','unknown']}),res); expect(res.code).toBe(404);
        expect(mocks.from).not.toHaveBeenCalled();
    });
});
