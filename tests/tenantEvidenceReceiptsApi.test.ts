import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const principal = vi.hoisted(() => ({
    current: {
        userId:'a9400000-0000-4000-8000-000000000001',
        tenantId:'b9400000-0000-4000-8000-000000000001',
        role:'owner',
        client:null as any,
    },
    blocked:false,
}));
vi.mock('../lib/server/tenantAuth.js', () => {
    class TenantAccessError extends Error {
        constructor(public status:number,public code:string,message:string){super(message);}
    }
    return {
        TenantAccessError,
        requireTenantContext:vi.fn(async (_req:unknown,roles:string[]) => {
            if(principal.blocked)throw new TenantAccessError(403,'TENANT_FORBIDDEN','기업 소속이 없습니다.');
            if(!roles.includes(principal.current.role))throw new TenantAccessError(403,'ROLE_FORBIDDEN','권한 없음');
            return principal.current;
        }),
        sendTenantError:(res:any,error:any)=>res.status(error.status||503).json({ok:false,code:error.code||'SERVICE_UNAVAILABLE'}),
    };
});
import tenantEvidenceReceipts from '../lib/server/tenantEvidenceReceipts';

const identity={
    tenant_id:'b9400000-0000-4000-8000-000000000001',
    id:'e9400000-0000-4000-8000-000000000001',
    worker_id:'c9400000-0000-4000-8000-000000000001',
    source_kind:'worker_form',media_type:'image/jpeg',
    received_at:'2026-11-01T01:02:03.123Z',
    received_by:'a9400000-0000-4000-8000-000000000001',
    byte_size:5,
};
const row={...identity,original_bytes:'\\xffd8ff0001'};
const req=(method='POST',body:any={})=>({method,body,query:{}});
const res=()=>({
    code:0,body:null as any,headers:{} as Record<string,string>,
    setHeader(key:string,value:string){this.headers[key]=value;return this;},
    status(value:number){this.code=value;return this;},
    json(value:any){this.body=value;return this;},
});
const validBody=()=>({
    workerId:identity.worker_id,
    requestId:'d9400000-0000-4000-8000-000000000001',
    sourceKind:'worker_form',mediaType:'image/jpeg',
    base64:Buffer.from([0xff,0xd8,0xff,0,1]).toString('base64'),
});

beforeEach(()=>{
    process.env.PSI_TENANT_EVIDENCE_ENABLED='true';
    principal.blocked=false;
    principal.current.role='owner';
    principal.current.client={
        from:vi.fn(()=>({
            insert:vi.fn(()=>({select:vi.fn(()=>({single:vi.fn(async()=>({data:identity,error:null}))}))})),
            select:vi.fn(()=>({eq:vi.fn(()=>({eq:vi.fn(()=>({maybeSingle:vi.fn(async()=>({data:row,error:null}))}))}))})),
        })),
    };
});
afterEach(()=>{delete process.env.PSI_TENANT_EVIDENCE_ENABLED;});

describe('gated tenant original receipt API',()=>{
    it('stays closed until migration and environment are explicitly enabled',async()=>{
        delete process.env.PSI_TENANT_EVIDENCE_ENABLED;
        const out=res();
        await tenantEvidenceReceipts(req('POST',validBody()),out);
        expect(out.code).toBe(503);
        expect(out.body.code).toBe('TENANT_EVIDENCE_NOT_READY');
    });
    it('rejects missing company role, viewer access and arbitrary server timestamp overrides',async()=>{
        principal.blocked=true;
        let out=res();
        await tenantEvidenceReceipts(req('POST',validBody()),out);
        expect(out.code).toBe(403);
        principal.blocked=false;principal.current.role='viewer';
        out=res();await tenantEvidenceReceipts(req('POST',validBody()),out);
        expect(out.code).toBe(403);
        principal.current.role='owner';
        out=res();await tenantEvidenceReceipts(req('POST',{...validBody(),receivedAt:'2025-01-01T00:00:00Z'}),out);
        expect(out.code).toBe(400);
    });
    it('accepts only plausible binary media and returns a digest without leaking file bytes',async()=>{
        const out=res();
        await tenantEvidenceReceipts(req('POST',validBody()),out);
        expect(out.code).toBe(201);
        expect(out.body.receipt.byteSize).toBe(5);
        expect(out.body.receipt.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(JSON.stringify(out.body)).not.toContain('base64');
        expect(JSON.stringify(out.body)).not.toContain('original_bytes');
        const invalid={...validBody(),mediaType:'image/png'};
        const rejected=res();
        await tenantEvidenceReceipts(req('POST',invalid),rejected);
        expect(rejected.code).toBe(400);
    });
    it('verifies sha256 from currently stored bytes for an authenticated GET',async()=>{
        const out=res();
        await tenantEvidenceReceipts({method:'GET',query:{id:identity.id}},out);
        expect(out.code).toBe(200);
        expect(out.body.receipt.hashScope).toBe('currently-stored-original-bytes');
        expect(out.body.receipt.sha256).toMatch(/^[a-f0-9]{64}$/);
    });
    it('blocks delete, patch, invalid IDs and oversized original payloads',async()=>{
        let out=res();
        await tenantEvidenceReceipts(req('DELETE',{}),out);
        expect(out.code).toBe(405);
        out=res();
        await tenantEvidenceReceipts({method:'GET',query:{id:'../../source'}},out);
        expect(out.code).toBe(400);
        out=res();
        await tenantEvidenceReceipts(req('POST',{...validBody(),base64:Buffer.alloc(2*1024*1024+1).toString('base64')}),out);
        expect([400,413]).toContain(out.code);
    });
});
