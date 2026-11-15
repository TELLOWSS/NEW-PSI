import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({ context:vi.fn(), from:vi.fn() }));
vi.mock('../lib/server/tenantAuth.js', async importOriginal=>({
  ...await importOriginal<typeof import('../lib/server/tenantAuth')>(),
  requireTenantContext:mocks.context
}));
import handler from '../api/saas/access';
import { TenantAccessError } from '../lib/server/tenantAuth';

const tenant='b9600000-0000-4000-8000-000000000001';
const site='f9600000-0000-4000-8000-000000000001';
const other='f9600000-0000-4000-8000-000000000002';
const person='a9600000-0000-4000-8000-000000000001';
const cutoff='2026-10-15T08:00:00Z';
const filters={siteId:site,month:'2026-10',trade:'형틀',cutoffAt:cutoff};
const req=(query:Record<string,unknown>={},method='GET')=>({method,
  headers:{authorization:'Bearer actual-user-jwt','x-psi-tenant-id':tenant},
  query:{resource:'nexus-site-aggregates',...query}});
const res=()=>({code:0,body:null as any,header:[] as [string,string][],
  setHeader(name:string,value:string){this.header.push([name,value]);return this;},
  status(code:number){this.code=code;return this;},
  json(body:any){this.body=body;return this;}});
const member=(siteId=site)=>({tenant_id:tenant,site_id:siteId,user_id:person,status:'active'});
const siteRow=(id=site)=>({tenant_id:tenant,id,name:'Test site',active:true});
const aggregate=(override:Record<string,unknown>={})=>({
  tenant_id:tenant,site_id:site,period_month:'2026-10-01',job_field:'형틀',
  source_cutoff_at:cutoff,loaded_record_rows:6,
  self_risk_high:2,self_risk_medium:1,self_risk_low:2,self_risk_unknown:1,
  followup_unresolved:3,followup_overdue:2,followup_interim:1,
  followup_scheduled:1,followup_reopened_history:1,followup_completion_logged:1,
  official_report_denominator:null,report_reconciled_at:null,...override
});
type Trace={table:string;calls:[string,...unknown[]][]};
let queue:any[],traces:Trace[];
function prepare(...replies:any[]){queue=[...replies];}
beforeEach(()=>{
  vi.resetAllMocks();
  vi.stubEnv('PSI_NEXUS_SITE_READ_ENABLED','true');
  traces=[];
  queue=[];
  mocks.context.mockImplementation(async()=>({tenantId:tenant,userId:person,role:'viewer',client:{from:mocks.from}}));
  mocks.from.mockImplementation((table:string)=>{
    const trace:Trace={table,calls:[]};traces.push(trace);
    // A real PostgREST query is one Promise per table request; do not shift a
    // mocked response each time a thenable is assimilated by the event loop.
    const q:any=Promise.resolve(queue.shift()??{data:[],error:null});
    for(const op of ['select','eq','in','limit','maybeSingle'])q[op]=(...args:any[])=>{
      trace.calls.push([op,...args]);return q;
    };
    return q;
  });
});
afterEach(()=>vi.unstubAllEnvs());

describe('PSI NEXUS server identity and site read boundary',()=>{
  it('fails closed by default without attempting even a token verification',async()=>{
    vi.stubEnv('PSI_NEXUS_SITE_READ_ENABLED','false');
    const response=res();await handler(req(filters),response);
    expect(response.code).toBe(503);
    expect(response.body.code).toBe('NEXUS_NOT_ACTIVATED');
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(response.header).toContainEqual(['Cache-Control','no-store']);
  });
  it('supports only GET and refuses all browser writes',async()=>{
    const response=res();
    await handler(req(filters,'POST'),response);
    expect(response.code).toBe(405);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rejects client role/tenant spoofing fields before querying source tables',async()=>{
    for(const inject of [{role:'owner'},{tenantId:tenant},{period_month:'2026-10-01'},
      {siteId:['one','two']},{month:'2026-13'}, {trade:' '},
      {cutoffAt:'2026-99-99T00:00:00Z'}]) {
      const response=res();
      await handler(req({...filters,...inject}),response);
      expect(response.code).toBe(400);
    }
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('checks authenticated tenant context and surfaces no data if token verification fails',async()=>{
    mocks.context.mockRejectedValueOnce(new TenantAccessError(401,'SESSION_INVALID','Unauthorized'));
    const response=res();await handler(req(filters),response);
    expect(response.code).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('returns only server-verified active sites and checks that every membership matches the user',async()=>{
    prepare({data:[member()],error:null},{data:[siteRow()],error:null});
    const response=res();await handler(req({mode:'sites'}),response);
    expect(response.code).toBe(200);
    expect(response.body.sites).toEqual([{id:site,name:'Test site'}]);
    expect(response.body.officialReportVerified).toBe(false);
    expect(traces.map(x=>x.table)).toEqual(['psi_tenant_site_memberships','psi_tenant_sites']);
    expect(traces[0].calls).toContainEqual(['eq','user_id',person]);
    expect(traces[0].calls).toContainEqual(['eq','tenant_id',tenant]);
    expect(traces[1].calls).toContainEqual(['in','id',[site]]);
  });
  it('denies foreign/unauthorized site before querying aggregate data',async()=>{
    prepare({data:[member()],error:null},{data:[siteRow()],error:null});
    const response=res();await handler(req({...filters,siteId:other}),response);
    expect(response.code).toBe(403);
    expect(traces.map(x=>x.table)).not.toContain('psi_nexus_site_aggregate_staging');
  });
  it('rejects a forged membership row instead of trusting an unexpected database response',async()=>{
    prepare({data:[{...member(),user_id:'a9600000-0000-4000-8000-000000000002'}],error:null});
    const response=res();await handler(req(filters),response);
    expect(response.code).toBe(503);
    expect(traces.map(x=>x.table)).not.toContain('psi_nexus_site_aggregate_staging');
    expect(JSON.stringify(response.body)).not.toContain('a9600000');
  });
  it('reads one exact tenant+site+month+trade+cutoff row, and returns only anonymous metrics',async()=>{
    prepare({data:[member()],error:null},{data:[siteRow()],error:null},
      {data:aggregate({unrelated_worker_name:'SHOULD_NEVER_LEAK'}),error:null});
    const response=res();await handler(req(filters),response);
    expect(response.code).toBe(200);
    expect(response.body.status).toBe('STAGING_RECORD');
    expect(response.body.aggregate.selfAssessment).toEqual({
      records:6,high:2,medium:1,low:2,unknown:1
    });
    expect(response.body.aggregate.followup).toEqual({
      unresolved:3,overdue:2,interim:1,scheduled:1,reopenedHistory:1,completionLogged:1
    });
    expect(response.body.aggregate.independentOfficialReportVerified).toBe(false);
    expect(response.body.aggregate.verifiedReinspectionApproval).toBe(false);
    expect(response.body.aggregate.workRestartAuthorized).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain('SHOULD_NEVER_LEAK');
    expect(traces[2].calls).toContainEqual(['eq','site_id',site]);
    expect(traces[2].calls).toContainEqual(['eq','tenant_id',tenant]);
    expect(traces[2].calls).toContainEqual(['eq','period_month','2026-10-01']);
    expect(traces[2].calls).toContainEqual(['eq','job_field','형틀']);
    expect(traces[2].calls).toContainEqual(['eq','source_cutoff_at',cutoff]);
    expect(traces.flatMap(x=>x.calls).some(x=>x[0]==='insert'||x[0]==='update'||x[0]==='delete')).toBe(false);
  });
  it('does not invent zero risk if the exact data row is unavailable',async()=>{
    prepare({data:[member()],error:null},{data:[siteRow()],error:null},{data:null,error:null});
    const response=res();await handler(req(filters),response);
    expect(response.code).toBe(200);
    expect(response.body.status).toBe('NO_AUTHORIZED_AGGREGATE');
    expect(response.body.aggregate).toBe(null);
  });
  it('fails closed on source mismatch, impossible counts or false internal reconciliation',async()=>{
    for(const override of [
      {site_id:other}, {tenant_id:'b9600000-0000-4000-8000-000000000002'},
      {loaded_record_rows:999}, {self_risk_high:-1},
      {report_reconciled_at:'2026-10-15T08:00:00Z',official_report_denominator:7}
    ]) {
      prepare({data:[member()],error:null},{data:[siteRow()],error:null},
        {data:aggregate(override),error:null});
      const response=res();await handler(req(filters),response);
      expect(response.code).toBe(503);
      expect(response.body.aggregate).toBeUndefined();
    }
  });
  it('does not equate a stored denominator match with independent official-report verification',async()=>{
    prepare({data:[member()],error:null},{data:[siteRow()],error:null},
      {data:aggregate({official_report_denominator:6,report_reconciled_at:'2026-10-15T08:10:00Z'}),error:null});
    const response=res();await handler(req(filters),response);
    expect(response.code).toBe(200);
    expect(response.body.aggregate.recordedInternalMatch).toBe(true);
    expect(response.body.officialReportVerified).toBe(false);
    expect(response.body.aggregate.independentOfficialReportVerified).toBe(false);
  });
  it('fails closed when RLS lookup or staging schema is missing without fallback to old records',async()=>{
    prepare({data:null,error:{code:'42P01',message:'sensitive SQL details'}});
    const response=res();await handler(req(filters),response);
    expect(response.code).toBe(503);
    expect(response.body.code).toBe('NEXUS_SCOPE_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('sensitive');
    expect(traces.map(x=>x.table)).not.toContain('psi_nexus_site_aggregate_staging');
  });
});
