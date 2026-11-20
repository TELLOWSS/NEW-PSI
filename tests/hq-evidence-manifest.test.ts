import {describe,expect,it} from 'vitest';
import {
 addEvidenceRecord,calculateLocalFingerprint,checkEvidenceLinks,
 MAX_DEMO_EVIDENCE_BYTES,type EvidenceManifestRecord,type EvidenceLink
} from '../components/hq/evidenceManifestModel';

const incidentId=37;
const at='2026-11-20T04:00:00.000Z';
const sample=(ref='DEMO-REP-001',changes:Partial<EvidenceManifestRecord>={}):EvidenceManifestRecord=>({
 incidentId,ref,kind:'report',note:'사고 보고서 형태를 연습하는 비식별 시연자료',
 sha256:null,byteCount:null,recordedAt:at,status:'metadata_only',...changes
});
const linked=(ref:string,expectedKind:'report'|'photo'|'statement'|'plan'|'inspection'|null='report',context:EvidenceLink['context']='fact'):EvidenceLink=>({
 id:'claim-'+ref,sourceRef:ref,expectedKind,context
});

describe('HQ isolated evidence manifest and chronology source audit',()=>{
 it('rejects other incident records, duplicate references and unsafe reference IDs',()=>{
  const records=addEvidenceRecord([],sample());
  expect(records).toHaveLength(1);
  expect(()=>addEvidenceRecord(records,sample())).toThrow('중복');
  expect(()=>addEvidenceRecord(records,sample('DEMO-PHOTO-02',{incidentId:38}))).toThrow('다른 사고');
  expect(()=>addEvidenceRecord([] ,sample('DOC-001'))).toThrow('DEMO-');
  expect(()=>addEvidenceRecord([],sample('DEMO-REP-002',{recordedAt:'invalid'}))).toThrow('등록시각');
  expect(()=>addEvidenceRecord([],sample('DEMO-REP-002',{note:'짧음'}))).toThrow('8자');
  expect(()=>addEvidenceRecord([],sample('DEMO-REP-002',{sha256:'a'.repeat(64)}))).toThrow('해시');
  expect(records[0].status).toBe('metadata_only');
  expect(records[0].sha256).toBeNull();
 });
 it('tracks missing, wrong-category and metadata-only source references without granting approval',()=>{
  const records=[
   sample(),sample('DEMO-PHOTO-001',{kind:'photo'}),
   sample('DEMO-STMT-01',{kind:'statement'})
  ];
  const refs=[
   linked('DEMO-REP-001'),
   linked('DEMO-PHOTO-001','photo','sequence'),
   linked('DEMO-STMT-01','report','sequence'),
   linked('DEMO-MISSING-01','statement','fact')
  ];
  const audit=checkEvidenceLinks(incidentId,records,refs);
  expect(audit.linked).toBe(2);
  expect(audit.missing).toBe(1);
  expect(audit.mismatched).toBe(1);
  expect(audit.metadataOnly).toBe(2);
  expect(audit.readyToRequestDemoReview).toBe(false);
  expect(audit.issues.map(x=>x.code)).toContain('MISSING_REFERENCE');
  expect(audit.issues.map(x=>x.code)).toContain('SOURCE_KIND_MISMATCH');
  expect(()=>checkEvidenceLinks(incidentId,[sample('DEMO-FOREIGN-01',{incidentId:99})],refs)).toThrow('다른 사고');
 });
 it('allows a DEMO review request to be shown ONLY after all source-kind/reference matches',()=>{
  const records=[sample(),sample('DEMO-PHOTO-001',{kind:'photo'})];
  const audit=checkEvidenceLinks(incidentId,records,[linked('DEMO-REP-001'),linked('DEMO-PHOTO-001','photo','sequence')]);
  expect(audit.readyToRequestDemoReview).toBe(true);
  expect(audit.linked).toBe(2);
  expect(audit.metadataOnly).toBe(2);
  expect(checkEvidenceLinks(incidentId,records,[]).readyToRequestDemoReview).toBe(false);
  expect(checkEvidenceLinks(incidentId,records,[linked('REP-001')]).issues[0].code).toBe('REFERENCE_FORMAT');
 });
 it('computes deterministic SHA-256 only for an explicitly supplied small demo Blob',async()=>{
  const blob=new Blob(['synthetic HQ-SAFE file content']);
  const a=await calculateLocalFingerprint(blob);
  const b=await calculateLocalFingerprint(blob);
  expect(a).toEqual(b);
  expect(a.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(a.byteCount).toBe(blob.size);
  const stored=addEvidenceRecord([],sample('DEMO-FILE-001',{
   sha256:a.sha256,byteCount:a.byteCount,status:'local_fingerprint'
  }));
  expect(stored[0].sha256).toBe(a.sha256);
  expect(()=>addEvidenceRecord(stored,sample('DEMO-DUP-001',{
   sha256:a.sha256,byteCount:a.byteCount,status:'local_fingerprint'
  }))).toThrow('같은 파일 지문');
  await expect(calculateLocalFingerprint(new Blob([]))).rejects.toThrow('1바이트');
  await expect(calculateLocalFingerprint(new Blob([new Uint8Array(MAX_DEMO_EVIDENCE_BYTES+1)]))).rejects.toThrow('8MB');
 });
});
