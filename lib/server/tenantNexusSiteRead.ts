import { requireTenantContext, sendTenantError, TenantAccessError, type TenantContext } from './tenantAuth.js';

/**
 * SAFETY NEXUS · authenticated read contract (feature-flagged, OFF by default).
 * The data table is still a proposal, not a production migration or data source.
 * No admin shared-password bypass, service-role client, write method, or PII.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = [
  'tenant_id','site_id','period_month','job_field','source_cutoff_at','loaded_record_rows',
  'self_risk_high','self_risk_medium','self_risk_low','self_risk_unknown',
  'followup_unresolved','followup_overdue','followup_interim','followup_scheduled',
  'followup_reopened_history','followup_completion_logged',
  'official_report_denominator','report_reconciled_at'
].join(',');
const MAX_SITES = 100;
const QUERY_KEYS = new Set(['resource','mode','siteId','month','trade','cutoffAt']);
const METRIC_KEYS = [
  'loaded_record_rows','self_risk_high','self_risk_medium','self_risk_low','self_risk_unknown',
  'followup_unresolved','followup_overdue','followup_interim','followup_scheduled',
  'followup_reopened_history','followup_completion_logged'
] as const;
function invalid(): never {
  throw new TenantAccessError(400,'NEXUS_INVALID_FILTER','현장, 작성 월, 공종 또는 기준시각을 확인해 주세요.');
}
function storageUnavailable(): never {
  throw new TenantAccessError(503,'NEXUS_SCOPE_UNAVAILABLE','현장별 인증 조회가 준비되지 않았습니다.');
}
function singleText(input: unknown, max: number): string {
  if (typeof input !== 'string' || input !== input.trim() || !input || input.length > max) return invalid();
  return input;
}
function readCutoff(value: unknown): string {
  const raw=singleText(value,35);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(raw)) return invalid();
  const time=new Date(raw).getTime();
  if (!Number.isFinite(time) || time > Date.now() || time < Date.parse('2000-01-01T00:00:00Z')) return invalid();
  if (new Date(time).toISOString().slice(0,19)!==raw.slice(0,19)) return invalid();
  return raw;
}
function verifyRows(rows: unknown, context: TenantContext): {id:string;name:string}[] {
  if (!Array.isArray(rows) || rows.length>MAX_SITES) return storageUnavailable();
  const result: {id:string;name:string}[]=[];
  const ids=new Set<string>();
  for (const row of rows) {
    if (!row || typeof row!=='object') return storageUnavailable();
    const r=row as Record<string,unknown>;
    if (r.tenant_id!==context.tenantId || typeof r.id!=='string' || !UUID.test(r.id)
        || r.active!==true || typeof r.name!=='string' || r.name.length>160 || !r.name.trim()
        || ids.has(r.id)) return storageUnavailable();
    ids.add(r.id);
    result.push({id:r.id,name:r.name});
  }
  return result;
}
async function authorizedSites(context: TenantContext) {
  const memberships=await context.client.from('psi_tenant_site_memberships')
    .select('tenant_id,site_id,user_id,status')
    .eq('tenant_id',context.tenantId).eq('user_id',context.userId).eq('status','active').limit(MAX_SITES+1);
  if (memberships.error || !Array.isArray(memberships.data) || memberships.data.length>MAX_SITES) return storageUnavailable();
  const ids=new Set<string>();
  for(const row of memberships.data){
    if (!row || row.tenant_id!==context.tenantId || row.user_id!==context.userId
      || row.status!=='active' || !UUID.test(row.site_id) || ids.has(row.site_id)) return storageUnavailable();
    ids.add(row.site_id);
  }
  if (!ids.size) return [];
  const sites=await context.client.from('psi_tenant_sites')
    .select('tenant_id,id,name,active').eq('tenant_id',context.tenantId)
    .eq('active',true).in('id',[...ids]).limit(MAX_SITES+1);
  if (sites.error) return storageUnavailable();
  const verified=verifyRows(sites.data,context);
  if(verified.some(site=>!ids.has(site.id)))return storageUnavailable();
  return verified;
}
function verifiedAggregate(row: unknown, context: TenantContext,
  filter: {siteId:string;month:string;trade:string;cutoffAt:string}) {
  if (!row || typeof row!=='object') return storageUnavailable();
  const data=row as Record<string,unknown>;
  if (data.tenant_id!==context.tenantId || data.site_id!==filter.siteId
      || data.period_month!==filter.month+'-01' || data.job_field!==filter.trade
      || typeof data.source_cutoff_at!=='string' ||
      new Date(data.source_cutoff_at).getTime()!==new Date(filter.cutoffAt).getTime()) return storageUnavailable();
  for(const key of METRIC_KEYS) {
    if(!Number.isSafeInteger(data[key]) || (data[key] as number)<0) return storageUnavailable();
  }
  const sum=(data.self_risk_high as number)+(data.self_risk_medium as number)
    +(data.self_risk_low as number)+(data.self_risk_unknown as number);
  if(sum!==data.loaded_record_rows) return storageUnavailable();
  const denominator=data.official_report_denominator;
  if(denominator!==null && (!Number.isSafeInteger(denominator) || (denominator as number)<0)) return storageUnavailable();
  if (data.report_reconciled_at!==null && data.report_reconciled_at!==undefined
      && (denominator===null || denominator!==data.loaded_record_rows)) return storageUnavailable();
  // A recorded reconciliation flag is not independent proof of an official report.
  return {
    siteId:filter.siteId,month:filter.month,trade:filter.trade,sourceCutoffAt:filter.cutoffAt,
    source:'STAGING_AUTHENTICATED_AGGREGATE' as const,
    selfAssessment:{records:data.loaded_record_rows,high:data.self_risk_high,
      medium:data.self_risk_medium,low:data.self_risk_low,unknown:data.self_risk_unknown},
    followup:{unresolved:data.followup_unresolved,overdue:data.followup_overdue,
      interim:data.followup_interim,scheduled:data.followup_scheduled,
      reopenedHistory:data.followup_reopened_history,completionLogged:data.followup_completion_logged},
    recordedReportDenominator:denominator,
    recordedInternalMatch:Boolean(data.report_reconciled_at) && denominator===data.loaded_record_rows,
    independentOfficialReportVerified:false,
    verifiedWorkerSiteAssignments:false,
    verifiedReinspectionApproval:false,
    workRestartAuthorized:false,
  };
}
export default async function tenantNexusSiteRead(req:any,res:any) {
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED'});
  }
  // Fail closed until separately approved migrations, tenant API and source provenance are ready.
  if(process.env.PSI_NEXUS_SITE_READ_ENABLED!=='true') return res.status(503)
    .json({ok:false,code:'NEXUS_NOT_ACTIVATED',message:'현장별 안전지능 조회는 운영 승인 전입니다.'});
  try{
    const query=req.query || {};
    if(Object.keys(query).some(key=>!QUERY_KEYS.has(key)))return invalid();
    const mode=query.mode===undefined?'aggregate':singleText(query.mode,15);
    if(mode!=='sites' && mode!=='aggregate')return invalid();
    // Validate the complete untrusted query BEFORE contacting identity or database.
    if(mode==='sites' && Object.keys(query).some(key=>!['resource','mode'].includes(key)))return invalid();
    const filter=mode==='aggregate'?(()=>{
      const siteId=singleText(query.siteId,36);
      if(!UUID.test(siteId))return invalid();
      const month=singleText(query.month,7);
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month<'2000-01'||month>'2100-12')return invalid();
      const trade=singleText(query.trade,120);
      const cutoffAt=readCutoff(query.cutoffAt);
      return {siteId,month,trade,cutoffAt};
    })():null;
    const context=await requireTenantContext(req);
    const sites=await authorizedSites(context);
    if(mode==='sites'){
      return res.status(200).json({ok:true,scope:'SERVER_AUTHENTICATED_SITE_MEMBERSHIP',
        sites,sourceReady:false,sourceAvailability:'PROPOSAL_ONLY_NOT_ACTIVATED',recordsRead:false,officialReportVerified:false});
    }
    if(!filter)return invalid();
    const {siteId,month,trade,cutoffAt}=filter;
    if(!sites.some(site=>site.id===siteId)) throw new TenantAccessError(403,'NEXUS_SITE_FORBIDDEN','해당 현장 조회 권한이 없습니다.');
    const {data,error}=await context.client.from('psi_nexus_site_aggregate_staging')
      .select(COLUMNS).eq('tenant_id',context.tenantId).eq('site_id',siteId)
      .eq('period_month',month+'-01').eq('job_field',trade)
      .eq('source_cutoff_at',cutoffAt).maybeSingle();
    if(error)return storageUnavailable();
    if(!data)return res.status(200).json({ok:true,scope:'SERVER_AUTHENTICATED_SITE_MEMBERSHIP',
      status:'NO_AUTHORIZED_AGGREGATE',aggregate:null,officialReportVerified:false});
    return res.status(200).json({ok:true,scope:'SERVER_AUTHENTICATED_SITE_MEMBERSHIP',
      status:'STAGING_RECORD',aggregate:verifiedAggregate(data,context,{siteId,month,trade,cutoffAt}),
      officialReportVerified:false});
  } catch(error) { return sendTenantError(res,error); }
}
