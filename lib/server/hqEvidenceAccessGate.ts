import {verifyRetrievedEvidence, type EvidenceMime, MAX_EVIDENCE_BYTES} from './hqEvidenceIntake.js';

/**
 * HQ-SAFE Phase 14: authenticated server-only evidence read policy.
 * This module does not create a public route, signed URL, Storage bucket,
 * Supabase client, privileged credential, or production database migration.
 * Port implementations MUST use independently verified sessions and server-only
 * storage access; callers MUST NOT supply the user/tenant identity from a body.
 */
export type EvidenceActor = Readonly<{
  tenantId:string;userId:string;role:'owner'|'admin'|'reviewer'|'viewer';
}>;
export type EvidenceReadRequest = Readonly<{siteId:string;caseId:string;evidenceId:string}>;
export type ScopedMembership = Readonly<{
  tenantId:string;siteId:string;userId:string;status:'active'|'inactive';
}>;
export type ScopedSite = Readonly<{tenantId:string;siteId:string;active:boolean}>;
export type ScopedIncident = Readonly<{tenantId:string;siteId:string;caseId:string;createdBy:string}>;
export type ScopedAssignment = Readonly<{
  tenantId:string;siteId:string;caseId:string;
  authorId:string;siteReviewerId:string;hqReviewerId:string;
}>;
export type ScopedManifest = Readonly<{
  tenantId:string;siteId:string;caseId:string;evidenceId:string;
  storageBucket:string;storageKey:string;
  mediaType:EvidenceMime;byteCount:number;sha256:string;
  /** Pending or blocked objects are NEVER released, regardless of hash. */
  malwareScanStatus:'pending'|'clean'|'blocked';
  sourceAuthenticityVerified:false;
}>;
export type EvidenceAuditType = 'read_requested'|'read_denied'|'download_completed'|'digest_mismatch';
export type EvidenceAuditEvent = Readonly<{
  tenantId:string;siteId:string;caseId:string;evidenceId:string;
  actorId:string;eventType:EvidenceAuditType;
  eventCode:'AUTHZ_ALLOWED'|'AUTHZ_DENIED'|'BYTE_VERIFIED'|'HASH_MISMATCH';
}>;
export type EvidenceReadPorts = Readonly<{
  lookupSiteMembership:(actor:EvidenceActor,siteId:string)=>Promise<ScopedMembership|null>;
  lookupSite:(actor:EvidenceActor,siteId:string)=>Promise<ScopedSite|null>;
  lookupIncident:(actor:EvidenceActor,siteId:string,caseId:string)=>Promise<ScopedIncident|null>;
  lookupAssignment:(actor:EvidenceActor,siteId:string,caseId:string)=>Promise<ScopedAssignment|null>;
  lookupManifest:(actor:EvidenceActor,request:EvidenceReadRequest)=>Promise<ScopedManifest|null>;
  appendAudit:(event:EvidenceAuditEvent)=>Promise<void>;
  getPrivateBytes:(bucket:string,key:string)=>Promise<Uint8Array>;
}>;
export type VerifiedEvidenceRead = Readonly<{
  bytes:Uint8Array;
  mediaType:EvidenceMime;
  byteCount:number;
  sha256:string;
  /** The bytes match their recorded digest, not the real-world accident. */
  sourceAuthenticityVerified:false;
  browserCacheAllowed:false;
  signedUrlIssued:false;
}>;
export class EvidenceReadFailure extends Error {
  constructor(public readonly status:403|404|503,public readonly code:
    'EVIDENCE_ACCESS_DENIED'|'EVIDENCE_NOT_FOUND'|'EVIDENCE_UNAVAILABLE'|'EVIDENCE_INTEGRITY_FAILURE'){
    super(code);
  }
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash=/^[0-9a-f]{64}$/;
const extensions:Record<EvidenceMime,string>={
  'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'
};
const denied=():never=>{throw new EvidenceReadFailure(403,'EVIDENCE_ACCESS_DENIED');};
const unavailable=():never=>{throw new EvidenceReadFailure(503,'EVIDENCE_UNAVAILABLE');};
const lower=(v:string)=>v.toLowerCase();
function validateActorAndRequest(actor:EvidenceActor,request:EvidenceReadRequest) {
  if(!uuid.test(actor.tenantId)||!uuid.test(actor.userId)||
    !uuid.test(request.siteId)||!uuid.test(request.caseId)||!uuid.test(request.evidenceId))denied();
  if(!['owner','admin','reviewer'].includes(actor.role))denied();
}
function isInScope(row:{tenantId:string;siteId:string},
 actor:EvidenceActor,request:EvidenceReadRequest):boolean{
 return row.tenantId===actor.tenantId&&row.siteId===request.siteId;
}
function expectedKey(actor:EvidenceActor,request:EvidenceReadRequest,mime:EvidenceMime):string{
 return [actor.tenantId,request.siteId,request.caseId,request.evidenceId]
  .map(lower).join('/')+'.'+extensions[mime];
}
/**
 * A single success is contingent on BOTH audit writes and post-fetch byte
 * integrity verification. No URL, storage key, unverified bytes or claimant
 * narratives are ever returned to the browser.
 *
 * Denied writes are best-effort because the current proposal's access_events
 * table requires a valid manifest FK: failed audit must never grant access.
 */
export async function readScopedEvidence(
 actor:EvidenceActor,request:EvidenceReadRequest,ports:EvidenceReadPorts
):Promise<VerifiedEvidenceRead>{
 validateActorAndRequest(actor,request);
 let manifest:ScopedManifest|null=null;
 let authorizationPassed=false;
 const event=(eventType:EvidenceAuditType,eventCode:EvidenceAuditEvent['eventCode']):EvidenceAuditEvent=>({
   tenantId:actor.tenantId,siteId:request.siteId,caseId:request.caseId,
   evidenceId:request.evidenceId,actorId:actor.userId,eventType,eventCode
 });
 try{
  const member=await ports.lookupSiteMembership(actor,request.siteId);
  const site=await ports.lookupSite(actor,request.siteId);
  if(!member||!site||!isInScope(member,actor,request)||!isInScope(site,actor,request)
     ||member.userId!==actor.userId||member.status!=='active'||site.active!==true)denied();
  const incident=await ports.lookupIncident(actor,request.siteId,request.caseId);
  if(!incident||!isInScope(incident,actor,request)||incident.caseId!==request.caseId)denied();

  const author=incident.createdBy===actor.userId;
  const assignment=author?null:await ports.lookupAssignment(actor,request.siteId,request.caseId);
  const siteReviewer=!!assignment&&isInScope(assignment,actor,request)&&
    assignment.caseId===request.caseId&&assignment.authorId===incident.createdBy&&
    assignment.siteReviewerId===actor.userId&&actor.role==='reviewer';
  const hqReviewer=!!assignment&&isInScope(assignment,actor,request)&&
    assignment.caseId===request.caseId&&assignment.authorId===incident.createdBy&&
    assignment.hqReviewerId===actor.userId&&['owner','admin'].includes(actor.role);
  if(!author&&!siteReviewer&&!hqReviewer)denied();

  manifest=await ports.lookupManifest(actor,request);
  if(!manifest)throw new EvidenceReadFailure(404,'EVIDENCE_NOT_FOUND');
  if(!isInScope(manifest,actor,request)||manifest.caseId!==request.caseId||
    manifest.evidenceId!==request.evidenceId||manifest.storageBucket!=='hq-incident-evidence-private'||
    manifest.malwareScanStatus!=='clean'||!Object.hasOwn(extensions,manifest.mediaType)||
    manifest.storageKey!==expectedKey(actor,request,manifest.mediaType)||
    !Number.isSafeInteger(manifest.byteCount)||manifest.byteCount<1||
    manifest.byteCount>MAX_EVIDENCE_BYTES||!hash.test(manifest.sha256)||
    manifest.sourceAuthenticityVerified!==false)unavailable();

  authorizationPassed=true;
  // This durable event MUST succeed before any storage fetch. A failure closes access.
  await ports.appendAudit(event('read_requested','AUTHZ_ALLOWED'));
  const bytes=await ports.getPrivateBytes(manifest.storageBucket,manifest.storageKey);
  if(!verifyRetrievedEvidence(bytes,manifest)){
    await ports.appendAudit(event('digest_mismatch','HASH_MISMATCH'));
    throw new EvidenceReadFailure(503,'EVIDENCE_INTEGRITY_FAILURE');
  }
  await ports.appendAudit(event('download_completed','BYTE_VERIFIED'));
  // Own a detached copy; never expose an adapter's mutable backing buffer.
  return Object.freeze({
   bytes:Uint8Array.from(bytes),mediaType:manifest.mediaType,byteCount:manifest.byteCount,
   sha256:manifest.sha256,sourceAuthenticityVerified:false as const,
   browserCacheAllowed:false as const,signedUrlIssued:false as const
  });
 }catch(error){
  if(!authorizationPassed&&manifest){
   try{await ports.appendAudit(event('read_denied','AUTHZ_DENIED'));}
   catch{/* denial telemetry failure must NEVER turn into permission */ }
  }
  if(error instanceof EvidenceReadFailure)throw error;
  // No database, storage or audit provider error details are made public.
  unavailable();
 }
}
