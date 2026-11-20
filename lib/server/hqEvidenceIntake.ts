import {createHash, randomUUID, timingSafeEqual} from 'node:crypto';

/** Trusted-server preprocessing contract ONLY. No upload, no storage access or DB write. */
export type EvidenceMime = 'image/jpeg' | 'image/png' | 'application/pdf';
export type EvidenceIntake = Readonly<{
  tenantId: string; siteId: string; caseId: string;
  bytes: Uint8Array; declaredMime: string; clientSha256: string;
}>;
export type PreparedEvidence = Readonly<{
  storageBucket: 'hq-incident-evidence-private';
  storageKey: string; contentType: EvidenceMime; byteCount: number;
  sha256: string; fingerprintMatchesClient: true;
  /** Digest agreement is NOT source provenance or chain-of-custody verification. */
  sourceAuthenticityVerified: false;
}>;
export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha = /^[0-9a-f]{64}$/i;
const hex=(bytes:Uint8Array)=>Buffer.from(bytes).toString('hex');
function detect(bytes:Uint8Array):EvidenceMime|null {
 if(bytes.length>=8&&hex(bytes.subarray(0,8))==='89504e470d0a1a0a')return 'image/png';
 if(bytes.length>=4&&hex(bytes.subarray(0,3))==='ffd8ff')return 'image/jpeg';
 if(bytes.length>=5&&hex(bytes.subarray(0,5))==='255044462d')return 'application/pdf';
 return null;
}
const suffix:Record<EvidenceMime,string>={'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'};
/**
 * In production, this MUST be called *after* authenticating a user and verifying
 * tenant/site/case read-write scope. The caller must separately malware-scan
 * and durably record hash+metadata before making an object available to readers.
 */
export function prepareEvidenceIntake(input:EvidenceIntake,serverObjectId:string=randomUUID()):PreparedEvidence {
 for(const field of [input.tenantId,input.siteId,input.caseId,serverObjectId]){
  if(!uuid.test(field))throw new Error('INVALID_EVIDENCE_SCOPE');
 }
 if(!(input.bytes instanceof Uint8Array)||input.bytes.byteLength===0||
     input.bytes.byteLength>MAX_EVIDENCE_BYTES)throw new Error('INVALID_EVIDENCE_SIZE');
 if(!sha.test(input.clientSha256))throw new Error('INVALID_CLIENT_DIGEST');
 const contentType=detect(input.bytes);
 if(!contentType||input.declaredMime!==contentType)throw new Error('INVALID_EVIDENCE_TYPE');
 // Reject inconsistent client fingerprints without leaking bytes or expectation.
 const digest=createHash('sha256').update(input.bytes).digest();
 const declared=Buffer.from(input.clientSha256,'hex');
 if(!timingSafeEqual(digest,declared))throw new Error('DIGEST_MISMATCH');
 const scope=[input.tenantId,input.siteId,input.caseId,serverObjectId]
  .map(v=>v.toLowerCase());
 return Object.freeze({
  storageBucket:'hq-incident-evidence-private' as const,
  storageKey:scope.join('/')+'.'+suffix[contentType],
  contentType,byteCount:input.bytes.byteLength,sha256:digest.toString('hex'),
  fingerprintMatchesClient:true as const,sourceAuthenticityVerified:false as const
 });
}
/** On retrieval, hash the exact received bytes, not the caller's supplied label. */
export function verifyRetrievedEvidence(bytes:Uint8Array,expected:Pick<PreparedEvidence,'sha256'|'byteCount'|'contentType'>):boolean{
 if(!(bytes instanceof Uint8Array)||!sha.test(expected.sha256)
  ||bytes.byteLength!==expected.byteCount||bytes.byteLength>MAX_EVIDENCE_BYTES
  ||detect(bytes)!==expected.contentType)return false;
 const actual=createHash('sha256').update(bytes).digest();
 return timingSafeEqual(actual,Buffer.from(expected.sha256,'hex'));
}
