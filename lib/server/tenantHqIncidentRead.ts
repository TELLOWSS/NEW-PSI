import { requireTenantContext, sendTenantError, TenantAccessError, type TenantContext } from './tenantAuth.js';

/**
 * HQ-SAFE incident read contract, OFF by default.
 * Proposal-only table: psi_hq_incident_cases (not a production migration).
 * No writes, no service-role client, no free-text narratives / injury or personal data.
 * Explicit tenant + site membership is required even for owner/admin.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZONES = new Set(['기초','지하','지상','옥탑']);
const PROCESSES = new Set(['underground-wall','underground-slab','formwork','gangform','alform',
  'rebar','pour','shoring','scaffold','lifting']);
const INCIDENT_TYPES = new Set(['추락','넘어짐','미끄러짐','낙하·비래','맞음','끼임','끼임·협착',
  '무너짐·전도','충돌','감전','절단','절단·베임','화재·폭발','질식','화상','교통사고','기타·아차사고']);
const QUERY_KEYS = new Set(['resource','siteId','zone','processId','caseId','page']);
const MAX_PAGE = 99;
const COLUMNS = 'tenant_id,site_id,id,occurred_on,construction_zone,process_code,incident_type,created_at';
const PAGE_SIZE = 25;

function invalid():never {
  throw new TenantAccessError(400,'HQ_INVALID_QUERY','기업, 현장 또는 조회 조건을 확인해 주세요.');
}
function unavailable():never {
  throw new TenantAccessError(503,'HQ_SCOPE_UNAVAILABLE','사고사례 현장별 조회 준비가 완료되지 않았습니다.');
}
function forbidden():never {
  throw new TenantAccessError(403,'HQ_SITE_FORBIDDEN','이 현장의 사고사례 조회 권한이 없습니다.');
}
function exactText(value:unknown,max:number):string {
  if(typeof value!=='string'||!value||value!==value.trim()||value.length>max)return invalid();
  return value;
}
function dateOnly(value:unknown):value is string {
  return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value+'T00:00:00.000Z'))
    && new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)===value;
}
function parseQuery(query:Record<string,unknown>) {
  if(Object.keys(query).some(key=>!QUERY_KEYS.has(key)))return invalid();
  const siteId=exactText(query.siteId,36);
  if(!UUID.test(siteId))return invalid();
  const zone=query.zone===undefined?null:exactText(query.zone,8);
  if(zone!==null&&!ZONES.has(zone))return invalid();
  const processId=query.processId===undefined?null:exactText(query.processId,40);
  if(processId!==null&&!PROCESSES.has(processId))return invalid();
  const caseId=query.caseId===undefined?null:exactText(query.caseId,36);
  if(caseId!==null&&!UUID.test(caseId))return invalid();
  const rawPage=query.page===undefined?'0':exactText(query.page,2);
  if(!/^(0|[1-9][0-9]?)$/.test(rawPage))return invalid();
  const page=Number(rawPage);
  if(page>MAX_PAGE||(caseId!==null&&page!==0))return invalid();
  return {siteId,zone,processId,caseId,page};
}
async function requireSite(context:TenantContext,siteId:string):Promise<void> {
  let member;
  try{
    member=await context.client.from('psi_tenant_site_memberships')
      .select('tenant_id,site_id,user_id,status')
      .eq('tenant_id',context.tenantId)
      .eq('site_id',siteId)
      .eq('user_id',context.userId)
      .eq('status','active').maybeSingle();
  }catch{return unavailable();}
  if(member.error)return unavailable();
  if(!member.data)return forbidden();
  if(member.data.tenant_id!==context.tenantId||member.data.site_id!==siteId
    ||member.data.user_id!==context.userId||member.data.status!=='active')return unavailable();
  let site;
  try{
    site=await context.client.from('psi_tenant_sites')
      .select('tenant_id,id,active')
      .eq('tenant_id',context.tenantId).eq('id',siteId).eq('active',true).maybeSingle();
  }catch{return unavailable();}
  if(site.error)return unavailable();
  if(!site.data)return forbidden();
  if(site.data.tenant_id!==context.tenantId||site.data.id!==siteId||site.data.active!==true)return unavailable();
}
function safeCase(row:unknown,context:TenantContext,siteId:string) {
  if(!row||typeof row!=='object')return unavailable();
  const r=row as Record<string,unknown>;
  if(r.tenant_id!==context.tenantId||r.site_id!==siteId
    ||typeof r.id!=='string'||!UUID.test(r.id)||!dateOnly(r.occurred_on)
    ||typeof r.construction_zone!=='string'||!ZONES.has(r.construction_zone)
    ||typeof r.process_code!=='string'||!PROCESSES.has(r.process_code)
    ||typeof r.incident_type!=='string'||!INCIDENT_TYPES.has(r.incident_type)
    ||typeof r.created_at!=='string'||!Number.isFinite(Date.parse(r.created_at)))return unavailable();
  return {id:r.id,occurredOn:r.occurred_on,zone:r.construction_zone,processId:r.process_code,
    incidentType:r.incident_type,createdAt:r.created_at};
}
export default async function tenantHqIncidentRead(req:any,res:any) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Vary','Authorization, X-PSI-Tenant-ID, X-PSI-Site-ID');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED'});
  }
  // Never fall back to legacy PSI records or public access.
  if(process.env.PSI_HQ_INCIDENT_READ_ENABLED!=='true')
    return res.status(503).json({ok:false,code:'HQ_NOT_ACTIVATED',message:'현장별 사고사례 조회는 운영 승인 전입니다.'});
  try{
    const filter=parseQuery(req.query||{});
    const context=await requireTenantContext(req);
    await requireSite(context,filter.siteId);
    let query:any=context.client.from('psi_hq_incident_cases').select(COLUMNS)
      .eq('tenant_id',context.tenantId).eq('site_id',filter.siteId);
    if(filter.zone!==null)query=query.eq('construction_zone',filter.zone);
    if(filter.processId!==null)query=query.eq('process_code',filter.processId);
    if(filter.caseId!==null)query=query.eq('id',filter.caseId);
    let result;
    try{
      result=await query.order('created_at',{ascending:false}).order('id',{ascending:false})
        .range(filter.page*PAGE_SIZE,filter.page*PAGE_SIZE+PAGE_SIZE);
    }catch{return unavailable();}
    if(result.error||!Array.isArray(result.data)||result.data.length>PAGE_SIZE+1)return unavailable();
    const validated=result.data.map((r:unknown)=>safeCase(r,context,filter.siteId));
    if(new Set(validated.map(item=>item.id)).size!==validated.length)return unavailable();
    if(filter.caseId!==null&&(validated.length>1||validated.some(x=>x.id!==filter.caseId)))return unavailable();
    if(filter.zone!==null&&validated.some(x=>x.zone!==filter.zone))return unavailable();
    if(filter.processId!==null&&validated.some(x=>x.processId!==filter.processId))return unavailable();
    const hasMore=validated.length>PAGE_SIZE;
    return res.status(200).json({
      ok:true,scope:'AUTHENTICATED_TENANT_AND_SITE',source:'HQ_INCIDENT_STAGING',
      siteId:filter.siteId,filters:{zone:filter.zone,processId:filter.processId,caseId:filter.caseId},
      items:validated.slice(0,PAGE_SIZE),page:filter.page,
      nextPage:hasMore&&filter.page<MAX_PAGE?String(filter.page+1):null,
      pageWindowIsSnapshot:false,
      hasMore,returnedCount:Math.min(PAGE_SIZE,validated.length),
      totalCount:null,independentVerification:false,officialAccidentStatistics:false,
      workRestartAuthorized:false
    });
  }catch(error){return sendTenantError(res,error);}
}
