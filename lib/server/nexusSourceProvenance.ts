import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * SAFETY NEXUS P2 · staging-only deterministic provenance.
 * Source rows MUST be loaded by a server-authorized, site_id-scoped reader.
 * This function does not attest its own caller, write any DB table, or approve reports.
 * No worker name, personal statement, or raw document body is persisted.
 */
export type NexusAssessmentLevel = '상' | '중' | '하' | null;
export type NexusDenominatorKind = 'assessment_record_rows' | 'distinct_workers';
export type NexusOriginMime = 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export type NexusProvenanceFailure =
  | 'INVALID_SCOPE' | 'INVALID_SOURCE_RECORD' | 'EMPTY_SOURCE'
  | 'MISSING_SOURCE_ID' | 'DUPLICATE_SOURCE_ID' | 'CROSS_SITE_SOURCE'
  | 'SOURCE_MONTH_MISMATCH' | 'SOURCE_TRADE_MISMATCH'
  | 'SOURCE_AFTER_CUTOFF' | 'INVALID_REPORT_ORIGINAL'
  | 'REPORT_SCOPE_MISMATCH' | 'DENOMINATOR_DEFINITION_MISMATCH'
  | 'REPORT_ORIGINAL_HASH_MISMATCH' | 'DENOMINATOR_MISMATCH'
  | 'SOURCE_ID_SET_MISMATCH' | 'REPORT_ISSUED_BEFORE_CUTOFF';

export class NexusProvenanceError extends Error {
  constructor(public readonly code: NexusProvenanceFailure) {
    super(code);
    this.name = 'NexusProvenanceError';
  }
}
export interface NexusSourceScope {
  tenantId: string;
  siteId: string;
  month: string; // YYYY-MM (assessment date, not education-release month)
  trade: string; // same canonical trade code/label as source and report
  cutoffAt: string; // UTC timestamp, immutable snapshot boundary
}
export interface NexusSourceRecord {
  recordId: string; // new site-bound source IDs must be stable UUIDs
  tenantId: string;
  siteId: string;
  assessmentDate: string; // YYYY-MM-DD
  trade: string;
  committedAt: string; // source DB last-committed timestamp, not client's edit time
  selfRisk: NexusAssessmentLevel;
}
export interface NexusSourceManifest {
  schema: 'psi-nexus-source-manifest-v1';
  scope: NexusSourceScope;
  denominatorKind: 'assessment_record_rows';
  sourceRecordCount: number;
  riskLevels: { high: number; medium: number; low: number; unknown: number };
  sourceIdSetSha256: string;
  canonicalSnapshotSha256: string;
  provenanceStatus: 'SCOPE_VALIDATED_NOT_SERVER_ATTESTED';
}
export interface NexusOriginalReport {
  scope: NexusSourceScope;
  denominatorKind: NexusDenominatorKind;
  denominator: number;
  mime: NexusOriginMime;
  originalSha256: string;
  sourceSystem: string; // independent official report system must be verified elsewhere
  reportReference: string; // nonsecret external document identifier, not a URL/secret
  issuedAt: string;
  sourceIdSetSha256?: string; // only when the official system actually publishes the same set
}
export interface NexusComparison {
  status: 'COUNTS_MATCH_PENDING_INDEPENDENT_APPROVAL';
  scope: NexusSourceScope;
  sourceRecordCount: number;
  officialDenominator: number;
  originalSha256: string;
  sourceIdSetSha256: string;
  canonicalSnapshotSha256: string;
  sourceIdSetWasIndependentlyProvided: boolean;
  independentOfficialReportVerified: false;
  acceptedByReviewer: false;
  authorizesActionClosure: false;
  authorizesWorkRestart: false;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/i;
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const sha=(source:Uint8Array|string)=>createHash('sha256').update(source).digest('hex');

function validDay(day:unknown):day is string {
  if(typeof day!=='string'||!DAY.test(day))return false;
  const date=new Date(day+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===day;
}
function validUtc(iso:unknown):iso is string {
  if(typeof iso!=='string'||!UTC.test(iso))return false;
  const date=new Date(iso);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,19)===iso.slice(0,19);
}
function utcValue(value:string):number {return new Date(value).getTime();}
function checkedScope(scope:NexusSourceScope):void {
  if(!scope||!UUID.test(scope.tenantId)||!UUID.test(scope.siteId)
     ||!MONTH.test(scope.month)||scope.month<'2000-01'||scope.month>'2100-12'
     ||typeof scope.trade!=='string'||scope.trade.trim()!==scope.trade
     ||scope.trade.length<1||scope.trade.length>120
     ||!validUtc(scope.cutoffAt)||utcValue(scope.cutoffAt)>Date.now()
     ||utcValue(scope.cutoffAt)<Date.parse('2000-01-01T00:00:00Z')) {
    throw new NexusProvenanceError('INVALID_SCOPE');
  }
}
function fail(code:NexusProvenanceFailure):never {throw new NexusProvenanceError(code);}
function sameScope(left:NexusSourceScope,right:NexusSourceScope):boolean {
  return left.tenantId===right.tenantId&&left.siteId===right.siteId
    &&left.month===right.month&&left.trade===right.trade
    &&utcValue(left.cutoffAt)===utcValue(right.cutoffAt);
}
function safeHashEqual(left:string,right:string):boolean {
  if(!SHA.test(left)||!SHA.test(right))return false;
  return timingSafeEqual(Buffer.from(left.toLowerCase(),'hex'),Buffer.from(right.toLowerCase(),'hex'));
}

/** A deterministic digest over the *exact set of reviewed source IDs*, not the count alone. */
export function buildNexusSourceManifest(
  scope:NexusSourceScope,sourceRecords:readonly NexusSourceRecord[]
):NexusSourceManifest {
  checkedScope(scope);
  if(!Array.isArray(sourceRecords)||!sourceRecords.length)fail('EMPTY_SOURCE');
  if(sourceRecords.length>10000)fail('INVALID_SOURCE_RECORD');
  const seen=new Set<string>();
  const canonical:{recordId:string;assessmentDate:string;committedAt:string;selfRisk:NexusAssessmentLevel}[]=[];
  const riskLevels={high:0,medium:0,low:0,unknown:0};
  const cutoff=utcValue(scope.cutoffAt);
  for(const row of sourceRecords) {
    if(!row||typeof row!=='object')fail('INVALID_SOURCE_RECORD');
    if(typeof row.recordId!=='string'||!UUID.test(row.recordId))fail('MISSING_SOURCE_ID');
    const id=row.recordId.toLowerCase();
    if(seen.has(id))fail('DUPLICATE_SOURCE_ID');
    seen.add(id);
    if(row.tenantId!==scope.tenantId||row.siteId!==scope.siteId)fail('CROSS_SITE_SOURCE');
    if(!validDay(row.assessmentDate))fail('INVALID_SOURCE_RECORD');
    if(row.assessmentDate.slice(0,7)!==scope.month)fail('SOURCE_MONTH_MISMATCH');
    if(row.trade!==scope.trade)fail('SOURCE_TRADE_MISMATCH');
    if(!validUtc(row.committedAt))fail('INVALID_SOURCE_RECORD');
    if(utcValue(row.committedAt)>cutoff || Date.parse(row.assessmentDate+'T00:00:00Z')>cutoff) {
      fail('SOURCE_AFTER_CUTOFF');
    }
    if(row.selfRisk!==null&&!['상','중','하'].includes(row.selfRisk))fail('INVALID_SOURCE_RECORD');
    if(row.selfRisk==='상')riskLevels.high++;
    else if(row.selfRisk==='중')riskLevels.medium++;
    else if(row.selfRisk==='하')riskLevels.low++;
    else riskLevels.unknown++;
    canonical.push({recordId:id,assessmentDate:row.assessmentDate,committedAt:new Date(row.committedAt).toISOString(),selfRisk:row.selfRisk});
  }
  canonical.sort((a,b)=>a.recordId.localeCompare(b.recordId));
  const normalizedScope={tenantId:scope.tenantId.toLowerCase(),siteId:scope.siteId.toLowerCase(),
    month:scope.month,trade:scope.trade,cutoffAt:new Date(scope.cutoffAt).toISOString()};
  const sourceIdSetSha256=sha('PSI-NEXUS-IDS-V1\n'+JSON.stringify(canonical.map(row=>row.recordId)));
  const canonicalSnapshotSha256=sha('PSI-NEXUS-SNAPSHOT-V1\n'
    +JSON.stringify({scope:normalizedScope,sourceIdSetSha256,rows:canonical,riskLevels}));
  return {
    schema:'psi-nexus-source-manifest-v1',scope:{...scope},
    denominatorKind:'assessment_record_rows',sourceRecordCount:canonical.length,riskLevels,
    sourceIdSetSha256,canonicalSnapshotSha256,
    provenanceStatus:'SCOPE_VALIDATED_NOT_SERVER_ATTESTED'
  };
}

/**
 * The official report bytes MUST be independently obtained and verified by
 * a separate, authorized source adapter. A matching count/hash only yields
 * PENDING_INDEPENDENT_APPROVAL; never 'officially verified' or work-restart authority.
 */
export function compareNexusReportOriginal(
  manifest:NexusSourceManifest,
  report:NexusOriginalReport,
  originalBytes:Uint8Array
):NexusComparison {
  checkedScope(manifest.scope);
  if(!report||!report.scope||typeof report!=='object')fail('INVALID_REPORT_ORIGINAL');
  checkedScope(report.scope);
  if(!sameScope(manifest.scope,report.scope))fail('REPORT_SCOPE_MISMATCH');
  if(report.denominatorKind!=='assessment_record_rows')fail('DENOMINATOR_DEFINITION_MISMATCH');
  if(!Number.isSafeInteger(report.denominator)||report.denominator<0
     ||!SHA.test(report.originalSha256)
     ||!['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(report.mime)
     ||typeof report.sourceSystem!=='string'||!report.sourceSystem.trim()||report.sourceSystem.length>160
     ||typeof report.reportReference!=='string'||!report.reportReference.trim()
     ||report.reportReference.length>160
     ||!validUtc(report.issuedAt)
     ||!(originalBytes instanceof Uint8Array)||!originalBytes.byteLength||originalBytes.byteLength>50*1024*1024
     ||manifest.schema!=='psi-nexus-source-manifest-v1'
     ||manifest.denominatorKind!=='assessment_record_rows'
     ||!SHA.test(manifest.sourceIdSetSha256)||!SHA.test(manifest.canonicalSnapshotSha256)
     ||manifest.riskLevels.high+manifest.riskLevels.medium+manifest.riskLevels.low+manifest.riskLevels.unknown!==manifest.sourceRecordCount
  )fail('INVALID_REPORT_ORIGINAL');
  if(utcValue(report.issuedAt)<utcValue(manifest.scope.cutoffAt))fail('REPORT_ISSUED_BEFORE_CUTOFF');
  if(!safeHashEqual(sha(originalBytes),report.originalSha256))fail('REPORT_ORIGINAL_HASH_MISMATCH');
  if(report.denominator!==manifest.sourceRecordCount)fail('DENOMINATOR_MISMATCH');
  if(report.sourceIdSetSha256!==undefined
     &&!safeHashEqual(report.sourceIdSetSha256,manifest.sourceIdSetSha256))fail('SOURCE_ID_SET_MISMATCH');
  return {
    status:'COUNTS_MATCH_PENDING_INDEPENDENT_APPROVAL',scope:{...manifest.scope},
    sourceRecordCount:manifest.sourceRecordCount,officialDenominator:report.denominator,
    originalSha256:report.originalSha256,sourceIdSetSha256:manifest.sourceIdSetSha256,
    canonicalSnapshotSha256:manifest.canonicalSnapshotSha256,
    sourceIdSetWasIndependentlyProvided:report.sourceIdSetSha256!==undefined,
    independentOfficialReportVerified:false,acceptedByReviewer:false,
    authorizesActionClosure:false,authorizesWorkRestart:false
  };
}
