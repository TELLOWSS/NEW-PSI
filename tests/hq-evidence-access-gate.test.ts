import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {
 readScopedEvidence,EvidenceReadFailure,
 type EvidenceActor,type EvidenceReadPorts,type ScopedManifest
} from '../lib/server/hqEvidenceAccessGate';
const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const site='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const otherSite='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const incident='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const evidence='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const author='11111111-1111-4111-8111-111111111111';
const siteReviewer='22222222-2222-4222-8222-222222222222';
const hqReviewer='33333333-3333-4333-8333-333333333333';
const outsider='44444444-4444-4444-8444-444444444444';
const request={siteId:site,caseId:incident,evidenceId:evidence};
const actor:EvidenceActor={tenantId:tenant,userId:author,role:'reviewer'};
const bytes=new TextEncoder().encode('%PDF-1.7\nDEMO fictional evidence, no real accident content');
const sha256=createHash('sha256').update(bytes).digest('hex');
const key=[tenant,site,incident,evidence].join('/')+'.pdf';
const manifest:ScopedManifest={
 tenantId:tenant,siteId:site,caseId:incident,evidenceId:evidence,
 storageBucket:'hq-incident-evidence-private',storageKey:key,
 mediaType:'application/pdf',byteCount:bytes.byteLength,sha256,
 malwareScanStatus:'clean',sourceAuthenticityVerified:false
};
type Settings={
 role?:EvidenceActor['role'];userId?:string;membershipActive?:boolean;siteActive?:boolean;
 authorId?:string;assignment?:boolean;manifest?:Partial<ScopedManifest>|null;
 auditFailsOn?:string;readFails?:boolean;payload?:Uint8Array;
};
function setup(overrides:Settings={}){
 const acting:EvidenceActor={...actor,userId:overrides.userId||author,role:overrides.role||'reviewer'};
 const calls:string[]=[];
 const ports:EvidenceReadPorts={
  lookupSiteMembership:async(a,s)=>{
   calls.push('membership');return {tenantId:a.tenantId,siteId:s,userId:a.userId,
    status:overrides.membershipActive===false?'inactive':'active'};
  },
  lookupSite:async(a,s)=>{calls.push('site');return {tenantId:a.tenantId,siteId:s,active:overrides.siteActive!==false};},
  lookupIncident:async(a,s,c)=>{calls.push('incident');return {
   tenantId:a.tenantId,siteId:s,caseId:c,createdBy:overrides.authorId||author
  };},
  lookupAssignment:async(a,s,c)=>{calls.push('assignment');return overrides.assignment===false?null:{
   tenantId:a.tenantId,siteId:s,caseId:c,authorId:overrides.authorId||author,
   siteReviewerId:siteReviewer,hqReviewerId:hqReviewer
  };},
  lookupManifest:async()=>{calls.push('manifest');return overrides.manifest===null?null:
   {...manifest,...(overrides.manifest||{})};},
  appendAudit:async(event)=>{calls.push('audit:'+event.eventType);
   if(event.eventType===overrides.auditFailsOn)throw new Error('PRIVATE_PROVIDER_ERROR_SECRET');
  },
  getPrivateBytes:async(bucket,objectKey)=>{calls.push('storage');
   expect(bucket).toBe(manifest.storageBucket);expect(objectKey).toBe(key);
   if(overrides.readFails)throw new Error('PROVIDER_SECRET_FILE_PATH');
   return overrides.payload??bytes;
  }
 };
 return {acting,ports,calls};
}
async function denied(state:ReturnType<typeof setup>,expectedCode:string){
 await expect(readScopedEvidence(state.acting,request,state.ports)).rejects.toMatchObject({
  code:expectedCode
 });
}
describe('HQ restricted evidence read gate (no API route, no actual storage)',()=>{
 it('allows author only with active enterprise/site and completed scan; requires both audits',async()=>{
  const state=setup();
  const out=await readScopedEvidence(state.acting,request,state.ports);
  expect(out.bytes).toEqual(bytes);
  expect(out).toMatchObject({
   mediaType:'application/pdf',sha256,sourceAuthenticityVerified:false,
   signedUrlIssued:false,browserCacheAllowed:false
  });
  expect(state.calls).toEqual(['membership','site','incident','manifest',
   'audit:read_requested','storage','audit:download_completed']);
 });
 it('permits separately assigned site and HQ reviewers but not the submitter role by itself',async()=>{
  for(const [userId,role] of [
   [siteReviewer,'reviewer'],[hqReviewer,'admin']
  ] as const){
   const state=setup({userId,role});
   const result=await readScopedEvidence(state.acting,request,state.ports);
   expect(result.byteCount).toBe(bytes.length);
   expect(state.calls).toContain('assignment');
  }
  for(const settings of [
   {userId:outsider,role:'owner' as const},
   {userId:siteReviewer,role:'owner' as const},
   {userId:hqReviewer,role:'reviewer' as const},
   {userId:siteReviewer,role:'reviewer' as const,assignment:false},
   {userId:author,role:'viewer' as const},
   {membershipActive:false},
   {siteActive:false}
  ]){
   const state=setup(settings);await denied(state,'EVIDENCE_ACCESS_DENIED');
   expect(state.calls).not.toContain('storage');
  }
 });
 it('refuses foreign site/case/evidence metadata and corrupt bucket keys without reading bytes',async()=>{
  for(const manifestOverride of [
   {siteId:otherSite},{tenantId:otherSite},{caseId:otherSite},{evidenceId:otherSite},
   {storageKey:'../public/guessed.pdf'},{storageBucket:'public'},
   {byteCount:0},{sha256:'not-digest'},
   {malwareScanStatus:'pending' as const},{malwareScanStatus:'blocked' as const},
   {sourceAuthenticityVerified:true as unknown as false}
  ]){
   const state=setup({manifest:manifestOverride});
   await denied(state,'EVIDENCE_UNAVAILABLE');
   expect(state.calls).not.toContain('storage');
  }
  const missing=setup({manifest:null});await denied(missing,'EVIDENCE_NOT_FOUND');
  expect(missing.calls).not.toContain('storage');
 });
 it('blocks download when audit of requested access fails before fetching any bytes',async()=>{
  const state=setup({auditFailsOn:'read_requested'});
  await denied(state,'EVIDENCE_UNAVAILABLE');
  expect(state.calls).not.toContain('storage');
 });
 it('blocks download if raw bytes fail digest verification or post-fetch audit fails',async()=>{
  const modified=setup({payload:new TextEncoder().encode('%PDF-1.7\nTAMPERED SYNTHETIC')});
  await denied(modified,'EVIDENCE_INTEGRITY_FAILURE');
  expect(modified.calls).toContain('audit:digest_mismatch');
  expect(modified.calls).not.toContain('audit:download_completed');
  const post=setup({auditFailsOn:'download_completed'});await denied(post,'EVIDENCE_UNAVAILABLE');
  expect(post.calls).toContain('storage');
  const unreadable=setup({readFails:true});await denied(unreadable,'EVIDENCE_UNAVAILABLE');
 });
 it('rejects bad request identifiers before membership or storage access',async()=>{
  const state=setup();
  await expect(readScopedEvidence(state.acting,{...request,siteId:'../etc/passwd'},state.ports))
   .rejects.toMatchObject({code:'EVIDENCE_ACCESS_DENIED'});
  expect(state.calls).toEqual([]);
 });
 it('never returns secrets in an exception when a provider query fails',async()=>{
  const state=setup();
  const ports:EvidenceReadPorts={...state.ports,lookupSiteMembership:async()=>{throw new Error('KEY_SUPER_SECRET');}};
  try{await readScopedEvidence(state.acting,request,ports);throw new Error('unexpected success');}
  catch(e){expect(e).toBeInstanceOf(EvidenceReadFailure);
    expect(String(e)).not.toContain('KEY_SUPER_SECRET');}
 });
});
