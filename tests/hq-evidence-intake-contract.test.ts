import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {MAX_EVIDENCE_BYTES,prepareEvidenceIntake,verifyRetrievedEvidence} from '../lib/server/hqEvidenceIntake';

const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const site='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const caseId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const objectId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const jpg=Uint8Array.from([255,216,255,224,0,16,74,70,73,70]);
const pdf=new TextEncoder().encode('%PDF-1.7\nsynthetic example document');
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const input=(bytes:Uint8Array,declaredMime:string)=>({
 tenantId:tenant,siteId:site,caseId,bytes,declaredMime,clientSha256:digest(bytes)
});
describe('HQ evidence byte contract (NO storage upload)',()=>{
 it('hashes selected bytes server-side and constructs opaque tenant/site/case object key',()=>{
  for(const [bytes,mime,ext] of [[png,'image/png','png'],[jpg,'image/jpeg','jpg'],[pdf,'application/pdf','pdf']] as const){
   const evidence=prepareEvidenceIntake(input(bytes,mime),objectId);
   expect(evidence.storageBucket).toBe('hq-incident-evidence-private');
   expect(evidence.storageKey).toBe([tenant,site,caseId,objectId].join('/')+'.'+ext);
   expect(evidence.sha256).toBe(digest(bytes));
   expect(evidence.byteCount).toBe(bytes.byteLength);
   expect(evidence.sourceAuthenticityVerified).toBe(false);
   expect(verifyRetrievedEvidence(bytes,evidence)).toBe(true);
   expect(verifyRetrievedEvidence(Uint8Array.from([...bytes,0]),evidence)).toBe(false);
  }
 });
 it('rejects invalid data, MIME spoof, unsafe types and tenant/site/case forgery',()=>{
  expect(()=>prepareEvidenceIntake({...input(png,'image/png'),siteId:'../another-site'},objectId)).toThrow('INVALID_EVIDENCE_SCOPE');
  expect(()=>prepareEvidenceIntake(input(new Uint8Array([]),'image/png'),objectId)).toThrow('INVALID_EVIDENCE_SIZE');
  expect(()=>prepareEvidenceIntake(input(new Uint8Array(MAX_EVIDENCE_BYTES+1),'image/png'),objectId)).toThrow('INVALID_EVIDENCE_SIZE');
  expect(()=>prepareEvidenceIntake(input(png,'application/pdf'),objectId)).toThrow('INVALID_EVIDENCE_TYPE');
  expect(()=>prepareEvidenceIntake(input(new TextEncoder().encode('<svg onload=alert(1)>'),'image/png'),objectId)).toThrow('INVALID_EVIDENCE_TYPE');
  expect(()=>prepareEvidenceIntake({...input(png,'image/png'),clientSha256:'not-a-digest'},objectId)).toThrow('INVALID_CLIENT_DIGEST');
  expect(()=>prepareEvidenceIntake({...input(png,'image/png'),clientSha256:'00'.repeat(32)},objectId)).toThrow('DIGEST_MISMATCH');
 });
 it('does not treat a valid hash as proof of real-world source authenticity',()=>{
  const prepared=prepareEvidenceIntake(input(pdf,'application/pdf'),objectId);
  expect(prepared.sourceAuthenticityVerified).toBe(false);
  expect(verifyRetrievedEvidence(png,prepared)).toBe(false);
  expect(verifyRetrievedEvidence(pdf,{...prepared,sha256:'z'.repeat(64)})).toBe(false);
 });
});
