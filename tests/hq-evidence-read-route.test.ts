import {createHash} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createHqEvidenceReadRoute} from '../lib/server/hqEvidenceReadRoute';
import accessHandler from '../api/saas/access';
import type {EvidenceReadPorts} from '../lib/server/hqEvidenceAccessGate';
import type {EvidenceCapacityPorts} from '../lib/server/hqEvidenceReadAdmission';
import type {EvidenceTransportOutboxPorts} from '../lib/server/hqEvidenceTransportOutbox';

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
const response=(autoFinish=true)=>({
 statusCode:0,headers:[] as [string,string][],payload:null as any,
 listeners:{} as Record<string,()=>void>,
 once(event:string,callback:()=>void){this.listeners[event]=callback;return this;},
 emit(event:string){this.listeners[event]?.();return this;},
 setHeader(name:string,val:string){this.headers.push([name,val]);return this;},
 status(code:number){this.statusCode=code;return this;},
 json(payload:any){this.payload=payload;return this;},
 send(payload:any){this.payload=payload;if(autoFinish)this.emit('finish');return this;}
});
const admission=():EvidenceCapacityPorts=>({
 acquire:async()=>({granted:true,leaseId:'ffffffff-ffff-4fff-8fff-ffffffffffff'}),
 release:async()=>{}
});
const syntheticOutbox=():EvidenceTransportOutboxPorts=>({
  prepare:async()=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),
  settle:async()=>{},alert:async()=>{}
});
const createTestRoute=(deps:Parameters<typeof createHqEvidenceReadRoute>[0])=>
  createTestRoute({...deps,transportOutbox:syntheticOutbox()});
const authenticated=vi.fn(async()=>({
 tenantId:tenant,userId:author,role:'reviewer' as const,client:{} as any
}));
function makePorts(options:{tampered?:boolean;scopeDenied?:boolean;noAudit?:boolean;failOnAudit?:string}={}){
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
   if(options.noAudit||options.failOnAudit===e.eventType)throw new Error('PROVIDER_SECRET_LOG_FAILURE');
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
   expect(res.statusCode,'unexpected code '+JSON.stringify(res.payload)).toBe(503);
   expect(res.payload.code).toBe('HQ_EVIDENCE_NOT_READY');
   expect(res.headers).toContainEqual(['X-Content-Type-Options','nosniff']);
   expect(res.headers.some(([k])=>k==='Content-Disposition')).toBe(false);
  }
 });
 it('rejects non-GET and forged query scope without authentication or storage activity',async()=>{
  const build=vi.fn(async()=>makePorts().ports);
  const handler=createTestRoute({
    authenticate:authenticated,buildPorts:build,admission:admission(),flagEnabled:()=>true
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
  const handler=createTestRoute({
   authenticate:authenticated,buildPorts:async()=>mem.ports,admission:admission(),flagEnabled:()=>true
  });
  const res=response();await handler(request(),res);
  expect(authenticated,'unexpected response '+JSON.stringify(res.payload)).toHaveBeenCalledTimes(1);
  expect(res.statusCode).toBe(200);
  expect(Buffer.isBuffer(res.payload)).toBe(true);
  expect(res.payload).toEqual(Buffer.from(bytes));
  expect(mem.events).toEqual(['read_requested','storage','read_verified',
   'response_send_started','response_flushed']);
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
   const handler=createTestRoute({
    authenticate:authenticated,buildPorts:async()=>mem.ports,admission:admission(),flagEnabled:()=>true
   });
   const res=response();await handler(request(),res);
   expect(res.statusCode).toBe(scenario.status);
   expect(Buffer.isBuffer(res.payload)).toBe(false);
   expect(JSON.stringify(res.payload)).not.toContain('PROVIDER_SECRET');
   expect(JSON.stringify(res.payload)).not.toContain('hq-incident-evidence-private');
  }
 });
 it('treats login failure and missing trusted private ports as closed',async()=>{
  const disabledBuild=createTestRoute({
    authenticate:authenticated,flagEnabled:()=>true
  });
  const res=response();await disabledBuild(request(),res);
  expect(res.statusCode).toBe(503);
  expect(authenticated).not.toHaveBeenCalled();
  const privateHandler=createTestRoute({
    authenticate:async()=>{throw new Error('INTERNAL_JWT_SECRET');},
    buildPorts:async()=>makePorts().ports,
    admission:admission(),flagEnabled:()=>true
  });
  const response2=response();await privateHandler(request(),response2);
  expect(response2.statusCode).toBe(503);
  expect(JSON.stringify(response2.payload)).not.toContain('INTERNAL_JWT_SECRET');
 });
 it('denies private reads when a distributed admission adapter is missing',async()=>{
  const privateStorage=makePorts();
  const handler=createTestRoute({
   authenticate:authenticated,buildPorts:async()=>privateStorage.ports,
   flagEnabled:()=>true
  });
  const out=response();await handler(request(),out);
  expect(out.statusCode).toBe(503);
  expect(out.payload.code).toBe('HQ_EVIDENCE_NOT_READY');
  expect(privateStorage.events).toEqual([]);
  expect(authenticated).not.toHaveBeenCalled();
 });

 it('blocks byte transmission if durable pre-send audit write fails',async()=>{
  const mem=makePorts({failOnAudit:'response_send_started'});
  const release=vi.fn(async()=>{});
  const handler=createTestRoute({
   authenticate:authenticated,
   admission:{acquire:async()=>({granted:true,leaseId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),release},
   buildPorts:async()=>mem.ports,flagEnabled:()=>true
  });
  const out=response();await handler(request(),out);
  expect(out.statusCode).toBe(503);
  expect(Buffer.isBuffer(out.payload)).toBe(false);
  expect(mem.events).toEqual(['read_requested','storage','read_verified','response_send_started']);
  expect(release).toHaveBeenCalledTimes(1);
 });

 it('limits concurrent reads across synthetic responses and releases only on finish or close',async()=>{
  const live=new Set<string>();
  const released:string[]=[];
  const ids=[
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333'
  ];
  let i=0;
  const gate:EvidenceCapacityPorts={
   acquire:async()=>{
    if(live.size>=2)return {granted:false as const,retryAfterSeconds:30};
    const leaseId=ids[i++];
    live.add(leaseId);
    return {granted:true as const,leaseId};
   },
   release:async(_scope,leaseId)=>{live.delete(leaseId);released.push(leaseId);}
  };
  const calls=makePorts();
  const handler=createTestRoute({
   authenticate:authenticated,buildPorts:async()=>calls.ports,
   admission:gate,flagEnabled:()=>true
  });
  const a=response(false),b=response(false),c=response(false);
  await handler(request(),a);
  await handler(request(),b);
  expect(a.statusCode).toBe(200);
  expect(b.statusCode).toBe(200);
  expect(live.size).toBe(2);
  await handler(request(),c);
  expect(c.statusCode).toBe(429);
  expect(c.payload.code).toBe('HQ_EVIDENCE_RATE_LIMITED');
  expect(c.headers).toContainEqual(['Retry-After','30']);
  expect(c.payload).not.toBeInstanceOf(Buffer);
  expect(calls.events.filter(x=>x==='storage')).toHaveLength(2);

  a.emit('finish');a.emit('close');
  await Promise.resolve();
  expect(released).toEqual([ids[0]]);
  const d=response(false);
  await handler(request(),d);
  expect(d.statusCode).toBe(200);
  b.emit('close');d.emit('finish');
  await Promise.resolve();
  expect(calls.events.filter(x=>x==='response_flushed')).toHaveLength(2);
  expect(calls.events.filter(x=>x==='response_aborted')).toHaveLength(1);
  expect(calls.events).not.toContain('download_completed');
  expect(live.size).toBe(0);
  expect(released).toEqual(ids);
 });

 it('blocks access when capacity storage fails or lease token is forged',async()=>{
  for(const admission of [
   {acquire:async()=>{throw Error('PRIVATE_LIMITER_SECRET');},release:async()=>{}},
   {acquire:async()=>({granted:true as const,leaseId:'NOT-A-UUID'}),release:async()=>{}}
  ] as EvidenceCapacityPorts[]){
   const mem=makePorts();
   const handler=createTestRoute({
    authenticate:authenticated,buildPorts:async()=>mem.ports,
    admission,flagEnabled:()=>true
   });
   const out=response();await handler(request(),out);
   expect(out.statusCode).toBe(503);
   expect(out.payload.code).toBe('HQ_EVIDENCE_CAPACITY_UNAVAILABLE');
   expect(JSON.stringify(out.payload)).not.toContain('PRIVATE_LIMITER_SECRET');
   expect(mem.events).toEqual([]);
  }
 });

 it('fails closed when the durable outbox adapter is not installed',async()=>{
  const mem=makePorts();
  const handler=createHqEvidenceReadRoute({
   authenticate:authenticated,buildPorts:async()=>mem.ports,
   admission:admission(),flagEnabled:()=>true
  });
  const out=response();await handler(request(),out);
  expect(out.statusCode).toBe(503);
  expect(out.payload.code).toBe('HQ_EVIDENCE_NOT_READY');
  expect(mem.events).toEqual([]);
  expect(authenticated).not.toHaveBeenCalled();
 });
 it('prevents bytes when outbox receipt persistence fails before HTTP send',async()=>{
  const mem=makePorts(),alert=vi.fn(async()=>{});
  const handler=createHqEvidenceReadRoute({
   authenticate:authenticated,buildPorts:async()=>mem.ports,
   admission:admission(),flagEnabled:()=>true,
   transportOutbox:{
    prepare:async()=>{throw new Error('SECRET_DB_ERROR');},
    settle:async()=>{},alert
   }
  });
  const out=response();await handler(request(),out);
  expect(out.statusCode).toBe(503);
  expect(Buffer.isBuffer(out.payload)).toBe(false);
  expect(mem.events).toEqual(['read_requested','storage','read_verified']);
  expect(alert).toHaveBeenCalledWith({eventId:null,stage:'prepare',code:'PERSISTENCE_FAILED'});
  expect(JSON.stringify(out.payload)).not.toContain('SECRET_DB_ERROR');
 });
 it('alerts on a failed terminal settlement without claiming a completed download',async()=>{
  const mem=makePorts(),alert=vi.fn(async()=>{});
  const settle=vi.fn(async()=>{throw new Error('SECRET_SETTLEMENT_ERROR');});
  const handler=createHqEvidenceReadRoute({
   authenticate:authenticated,buildPorts:async()=>mem.ports,
   admission:admission(),flagEnabled:()=>true,
   transportOutbox:{
    prepare:async()=>({id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}),
    settle,alert
   }
  });
  const out=response(false);await handler(request(),out);
  expect(out.statusCode).toBe(200);
  out.emit('finish');out.emit('close');
  await vi.waitFor(()=>expect(alert).toHaveBeenCalledWith({
   eventId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   stage:'settle',code:'PERSISTENCE_FAILED'
  }));
  expect(settle).toHaveBeenCalledTimes(1);
  expect(mem.events).not.toContain('download_completed');
 });

});
