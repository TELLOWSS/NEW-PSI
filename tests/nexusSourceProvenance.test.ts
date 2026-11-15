import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildNexusSourceManifest, compareNexusReportOriginal, NexusProvenanceError,
  type NexusSourceScope, type NexusSourceRecord, type NexusOriginalReport,
} from '../lib/server/nexusSourceProvenance';

const tenant='b9600000-0000-4000-8000-000000000001';
const otherTenant='b9600000-0000-4000-8000-000000000002';
const site='f9600000-0000-4000-8000-000000000001';
const otherSite='f9600000-0000-4000-8000-000000000002';
const id1='c9600000-0000-4000-8000-000000000001';
const id2='c9600000-0000-4000-8000-000000000002';
const id3='c9600000-0000-4000-8000-000000000003';
const scope:NexusSourceScope={
  tenantId:tenant,siteId:site,month:'2026-10',trade:'형틀',cutoffAt:'2026-11-15T07:00:00Z'
};
const row=(recordId:string,extra:Partial<NexusSourceRecord>={}):NexusSourceRecord=>({
  recordId,tenantId:tenant,siteId:site,trade:'형틀',assessmentDate:'2026-10-26',
  committedAt:'2026-11-01T12:00:00Z',selfRisk:'상',...extra
});
const source=()=>[row(id1),row(id2,{selfRisk:'중'}),row(id3,{selfRisk:null})];
const bytes=new Uint8Array([37,80,68,70,45,49,46,55,10,49,10,37,37,69,79,70]);
const sha=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
const report=(extra:Partial<NexusOriginalReport>={}):NexusOriginalReport=>({
  scope:{...scope},denominatorKind:'assessment_record_rows',denominator:3,
  mime:'application/pdf',originalSha256:sha(bytes),sourceSystem:'Independent signed field report service',
  reportReference:'FIELD-SIGNED-REPORT-202610-A',issuedAt:'2026-11-15T08:00:00Z',
  ...extra,
});
const code=(callback:()=>unknown,error:string)=>
  expect(callback).toThrowError(expect.objectContaining({code:error}));

describe('PSI NEXUS source provenance · no report auto approval',()=>{
  it('counts source RECORDS (not people), excludes PII, and emits reproducible signed-ready hashes',()=>{
    const manifest=buildNexusSourceManifest(scope,source());
    expect(manifest.sourceRecordCount).toBe(3);
    expect(manifest.riskLevels).toEqual({high:1,medium:1,low:0,unknown:1});
    expect(manifest.denominatorKind).toBe('assessment_record_rows');
    expect(manifest.sourceIdSetSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.canonicalSnapshotSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(buildNexusSourceManifest(scope,source().reverse())).toEqual(manifest);
    expect(JSON.stringify(manifest)).not.toContain(id1);
    expect(manifest.provenanceStatus).toBe('SCOPE_VALIDATED_NOT_SERVER_ATTESTED');
  });
  it('fails closed for no source, missing ID, and duplicate ID including changed-case UUID',()=>{
    code(()=>buildNexusSourceManifest(scope,[]),'EMPTY_SOURCE');
    code(()=>buildNexusSourceManifest(scope,[row('')]),'MISSING_SOURCE_ID');
    code(()=>buildNexusSourceManifest(scope,[row(id1),row(id1)]),'DUPLICATE_SOURCE_ID');
    code(()=>buildNexusSourceManifest(scope,[row(id1),row(id1.toUpperCase())]),'DUPLICATE_SOURCE_ID');
  });
  it('rejects mixed site and tenant records instead of silently filtering them',()=>{
    code(()=>buildNexusSourceManifest(scope,[row(id1),row(id2,{siteId:otherSite})]),'CROSS_SITE_SOURCE');
    code(()=>buildNexusSourceManifest(scope,[row(id1,{tenantId:otherTenant})]),'CROSS_SITE_SOURCE');
  });
  it('rejects stale month, invalid calendar date, wrong trade and late commits',()=>{
    code(()=>buildNexusSourceManifest(scope,[row(id1,{assessmentDate:'2026-09-30'})]),'SOURCE_MONTH_MISMATCH');
    code(()=>buildNexusSourceManifest(scope,[row(id1,{assessmentDate:'2026-10-32'})]),'INVALID_SOURCE_RECORD');
    code(()=>buildNexusSourceManifest(scope,[row(id1,{trade:'철근'})]),'SOURCE_TRADE_MISMATCH');
    code(()=>buildNexusSourceManifest(scope,[row(id1,{committedAt:'2026-11-16T01:00:00Z'})]),'SOURCE_AFTER_CUTOFF');
  });
  it('refuses a changed snapshot cutoff and source content altered after cutoff',()=>{
    const a=buildNexusSourceManifest(scope,source());
    const later=buildNexusSourceManifest({...scope,cutoffAt:'2026-11-15T07:01:00Z'},source());
    expect(a.canonicalSnapshotSha256).not.toBe(later.canonicalSnapshotSha256);
    expect(a.sourceIdSetSha256).toBe(later.sourceIdSetSha256);
    const modified=buildNexusSourceManifest(scope,[...source().slice(0,2),row(id3,{selfRisk:'하'})]);
    expect(modified.canonicalSnapshotSha256).not.toBe(a.canonicalSnapshotSha256);
  });
  it('never compares participant population to assessment record counts',()=>{
    const manifest=buildNexusSourceManifest(scope,source());
    code(()=>compareNexusReportOriginal(manifest,report({denominatorKind:'distinct_workers'}),bytes),
      'DENOMINATOR_DEFINITION_MISMATCH');
  });
  it('rejects official origin mismatch in site/month/trade/cutoff rather than matching same numeric totals',()=>{
    const manifest=buildNexusSourceManifest(scope,source());
    for(const mismatch of [
      {...scope,siteId:otherSite},{...scope,tenantId:otherTenant},
      {...scope,month:'2026-09'},{...scope,trade:'철근'},
      {...scope,cutoffAt:'2026-11-15T07:10:00Z'}
    ]) code(()=>compareNexusReportOriginal(manifest,report({scope:mismatch}),bytes),'REPORT_SCOPE_MISMATCH');
  });
  it('checks actual original document bytes against the declared SHA-256 and disallows empty content',()=>{
    const manifest=buildNexusSourceManifest(scope,source());
    code(()=>compareNexusReportOriginal(manifest,report(),new Uint8Array([1,2,3])),
      'REPORT_ORIGINAL_HASH_MISMATCH');
    code(()=>compareNexusReportOriginal(manifest,report(),new Uint8Array()),
      'INVALID_REPORT_ORIGINAL');
  });
  it('rejects denominator mismatch even if a SHA matches',()=>{
    const manifest=buildNexusSourceManifest(scope,source());
    code(()=>compareNexusReportOriginal(manifest,report({denominator:4}),bytes),'DENOMINATOR_MISMATCH');
  });
  it('rejects a mismatched independently supplied record-ID set fingerprint',()=>{
    const manifest=buildNexusSourceManifest(scope,source());
    code(()=>compareNexusReportOriginal(manifest,report({sourceIdSetSha256:'a'.repeat(64)}),bytes),
      'SOURCE_ID_SET_MISMATCH');
  });
  it('rejects an original published before the source snapshot cutoff',()=>{
    const manifest=buildNexusSourceManifest(scope,source());
    code(()=>compareNexusReportOriginal(manifest,report({issuedAt:'2026-11-15T06:00:00Z'}),bytes),
      'REPORT_ISSUED_BEFORE_CUTOFF');
  });
  it('returns only MATCHED_PENDING_INDEPENDENT_APPROVAL without manager verification or restart',()=>{
    const manifest=buildNexusSourceManifest(scope,source());
    const result=compareNexusReportOriginal(manifest,report({sourceIdSetSha256:manifest.sourceIdSetSha256}),bytes);
    expect(result).toMatchObject({
      status:'COUNTS_MATCH_PENDING_INDEPENDENT_APPROVAL',
      independentOfficialReportVerified:false,acceptedByReviewer:false,
      authorizesActionClosure:false,authorizesWorkRestart:false,
      sourceIdSetWasIndependentlyProvided:true,sourceRecordCount:3,officialDenominator:3,
    });
    expect(JSON.stringify(result)).not.toContain(id1);
    expect(JSON.stringify(result)).not.toContain('Independent signed field report service');
  });
  it('still refuses to call a matching count an official verification when ID set was not published',()=>{
    const manifest=buildNexusSourceManifest(scope,source());
    const result=compareNexusReportOriginal(manifest,report(),bytes);
    expect(result.sourceIdSetWasIndependentlyProvided).toBe(false);
    expect(result.independentOfficialReportVerified).toBe(false);
  });
  it('fails closed with invalid scope and malformed unrecognized self-risk levels',()=>{
    code(()=>buildNexusSourceManifest({...scope,siteId:'not-a-uuid'},source()),'INVALID_SCOPE');
    code(()=>buildNexusSourceManifest(scope,[row(id1,{selfRisk:'매우높음' as any})]),'INVALID_SOURCE_RECORD');
  });
});
