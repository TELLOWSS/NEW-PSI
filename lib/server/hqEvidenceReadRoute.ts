import {requireTenantContext,sendTenantError,TenantAccessError} from './tenantAuth.js';
import {
 reserveEvidenceRead,releaseEvidenceRead,EvidenceCapacityFailure,
 type EvidenceCapacityPorts,type EvidenceCapacityLease
} from './hqEvidenceReadAdmission.js';
import {
  readScopedEvidence,EvidenceReadFailure,
  type EvidenceReadPorts,type EvidenceActor,type EvidenceReadRequest
} from './hqEvidenceAccessGate.js';

/**
 * Phase 15: explicit opt-in HTTP *adapter boundary*, not an enabled endpoint.
 *
 * The default handler has NO Storage/DB ports and always fails closed. A future
 * reviewed server-only composition root must supply trusted adapters after:
 * tenant/site auth, private Storage activation, independent audit persistence,
 * malware scanner and operational security approval.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedQueryKeys=new Set(['resource','siteId','caseId','evidenceId']);
const mimetypes=new Set(['image/png','image/jpeg','application/pdf']);
const extension:Record<string,string>={
 'image/png':'png','image/jpeg':'jpg','application/pdf':'pdf'
};
type ReadContext=Awaited<ReturnType<typeof requireTenantContext>>;
type Dependencies={
 authenticate:(req:any)=>Promise<ReadContext>;
 buildPorts?:()=>Promise<EvidenceReadPorts>;
 admission?:EvidenceCapacityPorts;
 flagEnabled:()=>boolean;
};
function parse(req:any):EvidenceReadRequest {
 const query=req?.query;
 if(!query||typeof query!=='object'||Array.isArray(query)||
  Object.keys(query).some(k=>!allowedQueryKeys.has(k))||
  query.resource!=='hq-evidence-read'){
  throw new TenantAccessError(400,'HQ_EVIDENCE_QUERY_SHAPE','조회할 사고 증빙번호를 확인해 주세요.');
 }
 for(const key of ['siteId','caseId','evidenceId']){
  if(typeof query[key]!=='string'||!uuid.test(query[key])||query[key].length!==36){
   throw new TenantAccessError(400,'HQ_EVIDENCE_ID_INVALID','조회할 사고 증빙번호를 확인해 주세요.');
  }
 }
 return {
  siteId:query.siteId,caseId:query.caseId,evidenceId:query.evidenceId
 };
}
const unavailable=(res:any)=>res.status(503).json({
 ok:false,code:'HQ_EVIDENCE_NOT_READY',message:'사고 증빙 열람 시스템은 운영 승인 전입니다.'
});
export function createHqEvidenceReadRoute(deps:Dependencies) {
 return async function hqEvidenceRead(req:any,res:any) {
  let lease:EvidenceCapacityLease|null=null;
  let released=false;
  const releaseOnce=async()=>{
   if(!lease||released)return;
   released=true;
   if(deps.admission)await releaseEvidenceRead(lease,deps.admission);
  };
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Vary','Authorization, X-PSI-Tenant-ID, X-PSI-Site-ID');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  if(req.method!=='GET'){
   res.setHeader('Allow','GET');
   return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED'});
  }
  if(!deps.flagEnabled())return unavailable(res);
  try{
   const request=parse(req);
   // Ports are not available in production until a separately reviewed,
   // server-only implementation is installed. No service key is accepted.
   if(!deps.buildPorts||!deps.admission)return unavailable(res);
   if(typeof res.once!=='function')return unavailable(res);
   const context=await deps.authenticate(req);
   const actor:EvidenceActor={tenantId:context.tenantId,userId:context.userId,role:context.role};
   // Distributed capacity reservation precedes authorization lookups and private Storage.
   lease=await reserveEvidenceRead({tenantId:actor.tenantId,userId:actor.userId},deps.admission);
   const ports=await deps.buildPorts();
   const verified=await readScopedEvidence(actor,request,ports);
   if(!mimetypes.has(verified.mediaType))return unavailable(res);
   res.setHeader('Content-Type',verified.mediaType);
   res.setHeader('Content-Length',String(verified.byteCount));
   res.setHeader('Content-Disposition',
     'attachment; filename="hq-evidence.'+extension[verified.mediaType]+'"');
   // Release only after server response termination. Neither 'finish' nor 'close'
   // proves a browser received the bytes; download_completed is NEVER recorded.
   res.once('finish',()=>{void releaseOnce();});
   res.once('close',()=>{void releaseOnce();});
   return res.status(200).send(Buffer.from(verified.bytes));
  }catch(error){
   await releaseOnce();
   if(error instanceof EvidenceCapacityFailure){
    if(error.retryAfterSeconds!==null)res.setHeader('Retry-After',String(error.retryAfterSeconds));
    return res.status(error.status).json({ok:false,code:error.code});
   }
   if(error instanceof EvidenceReadFailure){
    return res.status(error.status).json({ok:false,code:error.code});
   }
   return sendTenantError(res,error);
  }
 };
}
const hqEvidenceReadRoute=createHqEvidenceReadRoute({
 authenticate:requireTenantContext,
 flagEnabled:()=>process.env.PSI_HQ_EVIDENCE_READ_ENABLED==='true'
 // No buildPorts: fail closed even if environment flag is changed accidentally.
});
export default hqEvidenceReadRoute;
