import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks=vi.hoisted(()=>({context:vi.fn(),from:vi.fn()}));
vi.mock('../lib/server/tenantAuth.js',async importOriginal=>({
  ...await importOriginal<typeof import('../lib/server/tenantAuth')>(),
  requireTenantContext:mocks.context
}));
import handler from '../api/saas/access';
import { TenantAccessError } from '../lib/server/tenantAuth';

const tenant='b9600000-0000-4000-8000-000000000001';
const site='f9600000-0000-4000-8000-000000000001';
const other='f9600000-0000-4000-8000-000000000002';
const person='a9600000-0000-4000-8000-000000000001';
const caseId='c9600000-0000-4000-8000-000000000001';

const req=(q:Record<string,unknown>={},method='GET')=>({
  method,headers:{authorization:'Bearer verified-user','x-psi-tenant-id':tenant},
  query:{resource:'hq-incidents',siteId:site,...q}
});
const res=()=>({code:0,body:null as any,headers:[] as [string,string][],
  setHeader(name:string,value:string){this.headers.push([name,value]);return this;},
  status(code:number){this.code=code;return this;},
  json(body:any){this.body=body;return this;}
});
const membership=(changes:Record<string,unknown>={})=>({
  tenant_id:tenant,site_id:site,user_id:person,status:'active',...changes
});
const siteRow=(changes:Record<string,unknown>={})=>({tenant_id:tenant,id:site,active:true,...changes});
const incident=(changes:Record<string,unknown>={})=>({
  tenant_id:tenant,site_id:site,id:caseId,occurred_on:'2026-11-19',
  construction_zone:'지하',process_code:'formwork',incident_type:'끼임',
  created_at:'2026-11-19T08:00:00Z',
  summary:'SECRET_PERSONAL_NARRATIVE_MUST_NOT_LEAK',
  personal_number:'SECRET_PERSONAL_ID_MUST_NOT_LEAK',
  ...changes
});
type Trace={table:string;calls:[string,...unknown[]][]};
let queue:any[]=[],traces:Trace[]=[];
function replies(...items:any[]){queue=[...items]}
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv('PSI_HQ_INCIDENT_READ_ENABLED','true');
  queue=[];traces=[];
  mocks.context.mockResolvedValue({tenantId:tenant,userId:person,role:'owner',client:{from:mocks.from}});
  mocks.from.mockImplementation((table:string)=>{
    const trace:Trace={table,calls:[]};traces.push(trace);
    const q:any=Promise.resolve(queue.shift()??{data:null,error:null});
    for(const op of ['select','eq','maybeSingle','order','limit'])q[op]=(...args:any[])=>{trace.calls.push([op,...args]);return q;};
    return q;
  });
});
afterEach(()=>vi.unstubAllEnvs());

describe('HQ-SAFE read-only tenant/site access gate (default disabled)',()=>{
  it('rejects requests when the server feature flag is unset, without invoking auth',async()=>{
    vi.stubEnv('PSI_HQ_INCIDENT_READ_ENABLED','false');
    const response=res();await handler(req(),response);
    expect(response.code).toBe(503);expect(response.body.code).toBe('HQ_NOT_ACTIVATED');
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(response.headers).toContainEqual(['Cache-Control','no-store']);
  });

  it('rejects POST/PATCH and query/header spoofed access before consulting the DB',async()=>{
    for(const method of ['POST','PATCH','DELETE']){
      const response=res();await handler(req({},method),response);expect(response.code).toBe(405);
    }
    for(const field of [{role:'owner'},{tenantId:tenant},{siteId:[site,other]},
      {siteId:'any'},{zone:'외부'},{processId:'unknown'},{caseId:'not-uuid'},
      {siteId:' '+site},{caseId:caseId,unexpected:'raw-sql-injection'}]){
      const response=res();await handler(req(field),response);
      expect(response.code).toBe(400);
    }
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('requires authenticated context and does not fall back to legacy admin sessions',async()=>{
    mocks.context.mockRejectedValueOnce(new TenantAccessError(401,'SESSION_INVALID','개인 계정으로 로그인해 주세요.'));
    const response=res();await handler(req(),response);
    expect(response.code).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('denies an owner missing site membership, without touching the incident table',async()=>{
    replies({data:null,error:null});
    const response=res();await handler(req(),response);
    expect(response.code).toBe(403);expect(response.body.code).toBe('HQ_SITE_FORBIDDEN');
    expect(traces.map(x=>x.table)).toEqual(['psi_tenant_site_memberships']);
    expect(traces[0].calls).toContainEqual(['eq','tenant_id',tenant]);
    expect(traces[0].calls).toContainEqual(['eq','user_id',person]);
    expect(traces[0].calls).toContainEqual(['eq','site_id',site]);
    expect(traces[0].calls).toContainEqual(['eq','status','active']);
  });

  it('rejects forged membership or inactive/wrong site instead of trusting data',async()=>{
    for(const [member,siteResult,expected] of [
      [{...membership(),user_id:'a9600000-0000-4000-8000-000000000002'},null,503],
      [membership(),null,403],
      [membership(),siteRow({active:false}),503],
      [membership(),siteRow({id:other}),503]
    ] as const){
      replies({data:member,error:null},...(member!==null && (member as any).user_id===person?[{data:siteResult,error:null}]:[]));
      const response=res();await handler(req(),response);expect(response.code).toBe(expected);
    }
    expect(traces.map(x=>x.table)).not.toContain('psi_hq_incident_cases');
  });

  it('fails closed when site scope tables are missing or error',async()=>{
    replies({data:null,error:{code:'42P01',message:'SECRET_DATABASE_DETAILS'}});
    const response=res();await handler(req(),response);
    expect(response.code).toBe(503);expect(response.body.code).toBe('HQ_SCOPE_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('SECRET_DATABASE_DETAILS');
  });

  it('returns minimal site-scoped metadata and never returns free-text narrative or identifiers',async()=>{
    replies({data:membership(),error:null},{data:siteRow(),error:null},
      {data:[incident()],error:null});
    const response=res();await handler(req({zone:'지하',processId:'formwork'}),response);
    expect(response.code).toBe(200);
    expect(response.body.items).toEqual([{
      id:caseId,occurredOn:'2026-11-19',zone:'지하',processId:'formwork',
      incidentType:'끼임',createdAt:'2026-11-19T08:00:00Z'
    }]);
    expect(response.body.officialAccidentStatistics).toBe(false);
    expect(response.body.independentVerification).toBe(false);
    expect(response.body.totalCount).toBe(null);
    expect(JSON.stringify(response.body)).not.toContain('SECRET_PERSONAL');
    expect(traces.map(x=>x.table)).toEqual(['psi_tenant_site_memberships','psi_tenant_sites','psi_hq_incident_cases']);
    expect(traces[2].calls).toContainEqual(['eq','tenant_id',tenant]);
    expect(traces[2].calls).toContainEqual(['eq','site_id',site]);
    expect(traces[2].calls).toContainEqual(['eq','construction_zone','지하']);
    expect(traces[2].calls).toContainEqual(['eq','process_code','formwork']);
    expect(traces.flatMap(x=>x.calls).some(x=>['insert','update','delete'].includes(x[0]))).toBe(false);
  });

  it('rejects out-of-scope case rows or query filter mismatch even if server query returned them',async()=>{
    for(const modified of [
      {site_id:other},{tenant_id:'b9600000-0000-4000-8000-000000000002'},
      {construction_zone:'지상'},{process_code:'alform'},
      {occurred_on:'2026-02-30'},
      {incident_type:'SECRET_PERSONAL_ID_MUST_NOT_LEAK'}
    ]){
      replies({data:membership(),error:null},{data:siteRow(),error:null},
        {data:[incident(modified)],error:null});
      const response=res();await handler(req({zone:'지하',processId:'formwork'}),response);
      expect(response.code).toBe(503);
      expect(response.body.items).toBeUndefined();
    }
  });

  it('never interprets missing staging data as independently verified zero incidents',async()=>{
    replies({data:membership(),error:null},{data:siteRow(),error:null},
      {data:[],error:null});
    const response=res();await handler(req(),response);
    expect(response.code).toBe(200);expect(response.body.items).toEqual([]);
    expect(response.body.totalCount).toBe(null);
    expect(response.body.officialAccidentStatistics).toBe(false);
    expect(response.body.source).toBe('HQ_INCIDENT_STAGING');
  });

  it('refuses missing proposal table without returning legacy data',async()=>{
    replies({data:membership(),error:null},{data:siteRow(),error:null},
      {data:null,error:{code:'42P01',message:'secret schema name'}});
    const response=res();await handler(req(),response);
    expect(response.code).toBe(503);expect(response.body.code).toBe('HQ_SCOPE_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('secret schema name');
  });
});
