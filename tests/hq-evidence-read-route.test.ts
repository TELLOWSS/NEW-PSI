import {createHash} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createHqEvidenceReadRoute} from '../lib/server/hqEvidenceReadRoute';
import accessHandler from '../api/saas/access';
import type {EvidenceReadPorts} from '../lib/server/hqEvidenceAccessGate';

const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const site='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const incident='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const evidence='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const author='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const bytes=new TextEncoder().encode('%PDF-1.7\nSYNTHETIC DATA ONLY - NOT REAL ACCIDENT EVIDENCE');
const sha=createHash('sha256').update(bytes).digest('hex');
const request=(method='GET',other:Record<string,unknown>={})=>({
 method,headers:{'authorization':'Bearer synthetically-verified','x-psi-tenant-id':tenant},
 query:{resource:'hq-evidence-read',siteId:site,caseId:incident,evidenceId:evidence,...other}
});
const response=()=>({
 statusCode:0,headers:[] as [string,string][],payload:null as any,
 setHeader(name:string,val:string){this.headers.push([name,val]);return this;},
 status(code:number){this.statusCode=code;return this;},
 json(payload:any){this.payload=payload;return this;},
 send(payload:any){this.payload=payload;return this;}
});
const authenticated=vi.fn(async()=>({
 tenantId:tenant,userId:author,role:'reviewer' as const,client:{} as any
}));
function makePorts(options:{tampered?:boolean;scopeDenied?:boolean;noAudit?:boolean}={}){
 const events:string[]=[];
 const ports:EvidenceReadPorts={
  lookupTenantMembership:async()=>({tenantId:tenant,userId:author,role:'reviewer',status:'active'}),
  lookupSiteMembership:async()=>({tenantId:tenant,siteId:site,userId:author,
   status:options.scopeDenied?'inactive':'active'}),
  lookupSite:async()=>({tenantId:tenant,siteId:site,active:true}),
  lookupIncident:async()=>({tenantId:tenant,siteId:site,caseId:incident,createdBy:author}),
  lookupAssignment:async()=>null,
  lookupManifest:async()=>({
   tenantId:tenant,siteId:site,caseId:incident,evidenceId:evidence,
   storageBucket:'hq-incident-evidence-private',
   storageKey:[tenant,site,incident,evidence].join('/')+'.pdf',
   mediaType:'application/pdf',byteCount:bytes.byteLength,sha256:sha,
   malwareScanStatus:'clean',sourceAuthenticityVerified:false
  }),
  appendAudit:async e=>{events.push(e.eventType);
   if(options.noAudit)throw new Error('PROVIDER_SECRET_LOG_FAILURE');
  },
  appendSecurityAttempt:async e=>{events.push('denied:'+e.denialCode);},
  getPrivateBytes:async()=>{events.push('storage');
   return options.tampered?new TextEncoder().encode('%PDF-1.7\nTAMPERED'):bytes;}
 };
 return {ports,events};
}
afterEach(()=>{vi.unstubAllEnvs();authenticated.mockClear();});
describe('HQ Phase 15 evidence HTTP boundary stays safe by default',()=>{
 it('refuses unconfigured production route even if flag is accidentally enabled',async()=>{
  for(const enabled of ['false','true']){
   vi.stubEnv('PSI_HQ_EVIDENCE_READ_ENABLED',enabled);
   const res=response();await accessHandler(request(),res);
   expect(res.statusCode).toBe(503);
   expect(res.payload.code).toBe('HQ_EVIDENCE_NOT_READY');
   expect(res.headers).toContainEqual(['X-Content-Type-Options','nosniff']);
   expect(res.headers.some(([k])=>k==='Content-Disposition')).toBe(false);
  }
 });
 it('rejects non-GET and forged query scope without authentication or storage activity',async()=>{
  const build=vi.fn(async()=>makePorts().ports);
  const handler=createHqEvidenceReadRoute({
    authenticate:authenticated,buildPorts:build,flagEnabled:()=>true
  });
  for(const method of ['POST','PUT','PATCH','DELETE']){
   const res=response();await handler(request(method),res);
   expect(res.statusCode).toBe(405);
  }
  for(const extra of [{tenantId:tenant},{siteId:'../etc'},{evidenceId:[evidence]},
   {caseId:'invalid'},{role:'owner'},{resource:'hq-something-else'}]){
   const res=response();await handler(request('GET',extra),res);
   expect(res.statusCode).toBe(400);
  }
  expect(authenticated).not.toHaveBeenCalled();
  expect(build).not.toHaveBeenCalled();
 });
 it('authenticates and sends verified bytes only after before/after audit success',async()=>{
  const mem=makePorts();
  const handler=createHqEvidenceReadRoute({
   authenticate:authenticated,buildPorts:async()=>mem.ports,flagEnabled:()=>true
  });
  const res=response();await handler(request(),res);
  expect(authenticated).toHaveBeenCalledTimes(1);
  expect(res.statusCode).toBe(200);
  expect(Buffer.isBuffer(res.payload)).toBe(true);
  expect(res.payload).toEqual(Buffer.from(bytes));
  expect(mem.events).toEqual(['read_requested','storage','read_verified']);
  expect(res.headers).toContainEqual(['Content-Type','application/pdf']);
  expect(res.headers).toContainEqual(['Cache-Control','private, no-store, max-age=0']);
  expect(res.headers).toContainEqual(['Content-Disposition','attachment; filename="hq-evidence.pdf"']);
  expect(JSON.stringify(res.headers)).not.toContain('hq-incident-evidence-private');
 });
 it('refuses unsafe scope and digest mismatch without leaking bytes or private error',async()=>{
  const scenarios=[
   {options:{scopeDenied:true},status:403},
   {options:{tampered:true},status:503},
   {options:{noAudit:true},status:503}
  ] as const;
  for(const scenario of scenarios){
   const mem=makePorts(scenario.options);
   const handler=createHqEvidenceReadRoute({
    authenticate:authenticated,buildPorts:async()=>mem.ports,flagEnabled:()=>true
   });
   const res=response();await handler(request(),res);
   expect(res.statusCode).toBe(scenario.status);
   expect(Buffer.isBuffer(res.payload)).toBe(false);
   expect(JSON.stringify(res.payload)).not.toContain('PROVIDER_SECRET');
   expect(JSON.stringify(res.payload)).not.toContain('hq-incident-evidence-private');
  }
 });
 it('treats login failure and missing trusted private ports as closed',async()=>{
  const disabledBuild=createHqEvidenceReadRoute({
    authenticate:authenticated,flagEnabled:()=>true
  });
  const res=response();await disabledBuild(request(),res);
  expect(res.statusCode).toBe(503);
  expect(authenticated).not.toHaveBeenCalled();
  const privateHandler=createHqEvidenceReadRoute({
    authenticate:async()=>{throw new Error('INTERNAL_JWT_SECRET');},
    buildPorts:async()=>makePorts().ports,
    flagEnabled:()=>true
  });
  const response2=response();await privateHandler(request(),response2);
  expect(response2.statusCode).toBe(503);
  expect(JSON.stringify(response2.payload)).not.toContain('INTERNAL_JWT_SECRET');
 });
});
