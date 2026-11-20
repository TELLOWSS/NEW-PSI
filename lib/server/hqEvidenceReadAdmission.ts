/**
 * HQ-SAFE Phase 16: fail-closed, externally atomic admission contract for
 * sensitive evidence reads. No in-memory limiter is acceptable in production:
 * Vercel instances are distributed and may recycle at any time.
 * This module DOES NOT configure Redis/DB, an enabled route, or any live limits.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type EvidenceCapacityScope=Readonly<{tenantId:string;userId:string}>;
export type EvidenceCapacityPolicy=Readonly<{
  windowSeconds:60;
  maxRequestsPerWindow:6;
  maxConcurrentPerUser:2;
  maxConcurrentPerTenant:8;
  leaseSeconds:120;
}>;
export const HQ_EVIDENCE_CAPACITY_POLICY:EvidenceCapacityPolicy=Object.freeze({
  windowSeconds:60,maxRequestsPerWindow:6,maxConcurrentPerUser:2,
  maxConcurrentPerTenant:8,leaseSeconds:120
});
export type CapacityDecision=
  | Readonly<{granted:true;leaseId:string}>
  | Readonly<{granted:false;retryAfterSeconds:number}>;
export interface EvidenceCapacityPorts{
  /** Atomic check+increment across ALL server instances; token expires after leaseSeconds. */
  acquire:(scope:EvidenceCapacityScope,policy:EvidenceCapacityPolicy)=>Promise<CapacityDecision>;
  /** Idempotent distributed release; TTL must still expire if this never runs. */
  release:(scope:EvidenceCapacityScope,leaseId:string)=>Promise<void>;
}
export type EvidenceCapacityLease=Readonly<{
  scope:EvidenceCapacityScope;leaseId:string;
}>;
export class EvidenceCapacityFailure extends Error{
 constructor(public readonly status:429|503,public readonly code:
  'HQ_EVIDENCE_RATE_LIMITED'|'HQ_EVIDENCE_CAPACITY_UNAVAILABLE',public readonly retryAfterSeconds:number|null=null){
  super(code);
 }
}
const unavailable=():never=>{throw new EvidenceCapacityFailure(503,'HQ_EVIDENCE_CAPACITY_UNAVAILABLE');};
/**
 * Reject malformed/untrusted adapter decisions before any private Storage access.
 * The scope MUST come from an authenticated tenant context, not query parameters.
 */
export async function reserveEvidenceRead(
 scope:EvidenceCapacityScope,ports:EvidenceCapacityPorts
):Promise<EvidenceCapacityLease>{
 if(!uuid.test(scope.tenantId)||!uuid.test(scope.userId))return unavailable();
 let decision:CapacityDecision;
 try{decision=await ports.acquire(scope,HQ_EVIDENCE_CAPACITY_POLICY);}
 catch{return unavailable();}
 if(!decision||typeof decision!=='object'||typeof decision.granted!=='boolean')return unavailable();
 if(decision.granted){
  if(!uuid.test(decision.leaseId))return unavailable();
  return {scope,leaseId:decision.leaseId};
 }
 if(!Number.isSafeInteger(decision.retryAfterSeconds)||
    decision.retryAfterSeconds<1||decision.retryAfterSeconds>HQ_EVIDENCE_CAPACITY_POLICY.windowSeconds)
  return unavailable();
 throw new EvidenceCapacityFailure(429,'HQ_EVIDENCE_RATE_LIMITED',decision.retryAfterSeconds);
}
/** Never throws into an HTTP response after sending bytes. Expiring leases are mandatory. */
export async function releaseEvidenceRead(lease:EvidenceCapacityLease,ports:EvidenceCapacityPorts):Promise<boolean>{
 try{await ports.release(lease.scope,lease.leaseId);return true;}
 catch{return false;}
}
