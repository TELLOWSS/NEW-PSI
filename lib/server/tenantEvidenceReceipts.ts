import { createHash } from 'node:crypto';
import { requireTenantContext, sendTenantError, TenantAccessError, type TenantContext } from './tenantAuth.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_BODY_BYTES = 2_900_000;
const allowedRoles = ['owner','admin','reviewer'] as const;
const types = new Set(['worker_form','field_evidence']);
const media = new Set(['image/jpeg','image/png','image/webp','application/pdf']);
const columns = 'tenant_id,id,request_id,worker_id,source_kind,media_type,byte_size,received_at,received_by,original_bytes';

const invalid = (): never => { throw new TenantAccessError(400,'INVALID_EVIDENCE_INPUT','원본 파일과 기록 정보를 확인해 주세요.'); };
const enabled = (): boolean => process.env.PSI_TENANT_EVIDENCE_ENABLED === 'true';

function parseBody(req:any): Record<string,unknown> {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (!raw || Buffer.byteLength(raw,'utf8') > MAX_BODY_BYTES) {
        throw new TenantAccessError(413,'EVIDENCE_TOO_LARGE','2MB 이하 파일을 선택해 주세요.');
    }
    let data: unknown;
    try { data = JSON.parse(raw); } catch { invalid(); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) invalid();
    return data as Record<string,unknown>;
}

function bytesFromBase64(value:unknown):Buffer {
    if (typeof value !== 'string' || value.length < 4 || value.length > 2_800_000
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) invalid();
    const bytes = Buffer.from(value,'base64');
    if (!bytes.length || bytes.length > MAX_BYTES || bytes.toString('base64') !== value) invalid();
    return bytes;
}

function validateMedia(bytes:Buffer, mediaType:string):void {
    let valid=false;
    if (mediaType==='image/jpeg') valid=bytes.length>=3 && bytes.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff]));
    else if (mediaType==='image/png') valid=bytes.length>=8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    else if (mediaType==='image/webp') valid=bytes.length>=12 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP';
    else if (mediaType==='application/pdf') valid=bytes.length>=5 && bytes.toString('ascii',0,5)==='%PDF-';
    if (!valid) invalid();
}

function readBytes(raw:unknown):Buffer {
    if (typeof raw !== 'string' || !/^\\x[0-9a-f]+$/i.test(raw) || raw.length%2!==0) {
        throw new TenantAccessError(503,'EVIDENCE_STORAGE_UNAVAILABLE','원본 보관 기록을 확인할 수 없습니다.');
    }
    const bytes=Buffer.from(raw.slice(2),'hex');
    if (!bytes.length || bytes.length>MAX_BYTES) {
        throw new TenantAccessError(503,'EVIDENCE_STORAGE_UNAVAILABLE','원본 보관 기록을 확인할 수 없습니다.');
    }
    return bytes;
}

const hash=(buffer:Buffer):string=>createHash('sha256').update(buffer).digest('hex');

async function createReceipt(context:TenantContext,req:any) {
    const body=parseBody(req);
    const keys=Object.keys(body);
    if (keys.some(key => !['requestId','workerId','sourceKind','mediaType','base64','clientRecordedAt'].includes(key))) invalid();
    if (typeof body.requestId!=='string'||!uuid.test(body.requestId)
        ||typeof body.workerId!=='string'||!uuid.test(body.workerId)
        ||typeof body.sourceKind!=='string'||!types.has(body.sourceKind)
        ||typeof body.mediaType!=='string'||!media.has(body.mediaType)) invalid();
    const original=bytesFromBase64(body.base64);
    validateMedia(original,body.mediaType);
    let clientRecordedAt:string|null=null;
    if (body.clientRecordedAt!==undefined && body.clientRecordedAt!==null) {
        if (typeof body.clientRecordedAt!=='string'
          ||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(body.clientRecordedAt)
          || !Number.isFinite(Date.parse(body.clientRecordedAt))) invalid();
        clientRecordedAt=body.clientRecordedAt;
    }
    const {data,error}=await context.client.from('psi_tenant_evidence_receipts').insert({
        tenant_id:context.tenantId,request_id:body.requestId,worker_id:body.workerId,
        source_kind:body.sourceKind,media_type:body.mediaType,
        original_bytes:'\\x'+original.toString('hex'),client_recorded_at:clientRecordedAt,
    }).select('tenant_id,id,worker_id,source_kind,media_type,byte_size,received_at,received_by').single();
    if(error) {
        if(error.code==='23505') throw new TenantAccessError(409,'EVIDENCE_DUPLICATE','이미 접수된 요청입니다. 중복 업로드하지 마세요.');
        if(['42501','23503'].includes(error.code)) throw new TenantAccessError(403,'EVIDENCE_FORBIDDEN','이 근로자 원본을 등록할 권한이 없습니다.');
        if(error.code==='23514') invalid();
        throw new TenantAccessError(503,'EVIDENCE_STORAGE_UNAVAILABLE','증빙 원본 저장소가 준비되지 않았습니다.');
    }
    if(!data||data.tenant_id!==context.tenantId||data.worker_id!==body.workerId
       ||data.received_by!==context.userId||data.byte_size!==original.length
       ||!uuid.test(String(data.id||''))) {
        throw new TenantAccessError(503,'EVIDENCE_STORAGE_UNAVAILABLE','원본 접수 결과가 일치하지 않습니다.');
    }
    return {ok:true,receipt:{
        id:data.id,workerId:data.worker_id,sourceKind:data.source_kind,mediaType:data.media_type,
        receivedAt:data.received_at,byteSize:data.byte_size,sha256:hash(original),
        hashScope:'submitted-bytes',serverReceiptTime:true,immutableByApp:true,
    }};
}
async function receiptMetadata(context:TenantContext,req:any) {
    if(typeof req.query?.id!=='string'||!uuid.test(req.query.id)) invalid();
    const {data,error}=await context.client.from('psi_tenant_evidence_receipts')
        .select(columns).eq('tenant_id',context.tenantId).eq('id',req.query.id).maybeSingle();
    if(error) throw new TenantAccessError(503,'EVIDENCE_STORAGE_UNAVAILABLE','원본 보관 내역을 조회할 수 없습니다.');
    if(!data||data.tenant_id!==context.tenantId) throw new TenantAccessError(404,'EVIDENCE_NOT_FOUND','원본 보관 내역을 찾을 수 없습니다.');
    const bytes=readBytes(data.original_bytes);
    if(bytes.length!==data.byte_size) throw new TenantAccessError(503,'EVIDENCE_STORAGE_UNAVAILABLE','원본 크기가 일치하지 않습니다.');
    return {ok:true,receipt:{
        id:data.id,workerId:data.worker_id,sourceKind:data.source_kind,mediaType:data.media_type,
        receivedAt:data.received_at,byteSize:bytes.length,sha256:hash(bytes),
        hashScope:'currently-stored-original-bytes',serverReceiptTime:true,immutableByApp:true,
    }};
}

/** Gated foundation; do not expose legacy records or auto-enable in single-site mode. */
export default async function tenantEvidenceReceipts(req:any,res:any) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Vary','Authorization, X-PSI-Tenant-ID');
    if (!enabled()) return res.status(503).json({ok:false,code:'TENANT_EVIDENCE_NOT_READY'});
    if (req.method!=='GET'&&req.method!=='POST') {
        res.setHeader('Allow','GET, POST');
        return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED'});
    }
    try {
        const context=await requireTenantContext(req,allowedRoles);
        const result=req.method==='POST'?await createReceipt(context,req):await receiptMetadata(context,req);
        return res.status(req.method==='POST'?201:200).json(result);
    } catch(error) {return sendTenantError(res,error);}
}
