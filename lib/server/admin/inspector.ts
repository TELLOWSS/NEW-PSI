import { createHash, randomUUID } from 'node:crypto';
import { isValidAdminAuthRequest } from '../adminAuthGuard.js';
import { createSupabaseServerClient } from '../supabaseServer.js';
import { consumeApiQuota, resolveRequestFingerprint } from '../apiSecurity.js';
import { assertSafeEdit, InspectorInputError, UUID, validateDocument } from '../../inspector/validation.js';
import { serializeSnapshot } from '../../inspector/snapshot.js';
import { newInspectionDocument, type Evidence, type Inspection } from '../../inspector/types.js';

const BUCKET = 'psi-inspector-evidence';
const MAX_PHOTO = 3 * 1024 * 1024;
const columns = 'id,revision,document,created_at,updated_at';
class RequestError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
const reject = (status: number, code: string, message: string): never => { throw new RequestError(status,code,message); };
const id = (value: unknown): string => typeof value === 'string' && UUID.test(value) ? value : reject(400,'INVALID_ID','점검번호를 확인해 주세요.');
function bodyInput(req: any) {
    let body: any;
    try {
        const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        if (!raw || Buffer.byteLength(raw,'utf8') > 4_250_000) reject(413,'INPUT_TOO_LARGE','입력 내용이 너무 큽니다.');
        body = JSON.parse(raw);
    } catch(error) { if(error instanceof RequestError) throw error; reject(400,'INVALID_JSON','요청 형식을 확인해 주세요.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400,'INVALID_JSON','요청 형식을 확인해 주세요.');
    return body;
}
function keys(body: any, allowed: string[]) {
    if(Object.keys(body).some(k => !['op',...allowed].includes(k))) reject(400,'INVALID_INPUT','지원하지 않는 입력 항목입니다.');
}
function dbError(error: any) {
    if (!error) return;
    if (error.code === '23505') reject(409,'REVISION_CONFLICT','이미 등록된 요청입니다. 목록을 새로 확인해 주세요.');
    reject(503,'INSPECTOR_STORAGE_UNAVAILABLE','점검 보관을 사용할 수 없습니다. 잠시 후 다시 확인해 주세요.');
}
async function getInspection(db: any, inspectionId: string): Promise<Inspection> {
    const {data,error} = await db.from('psi_inspector_inspections').select(columns).eq('id',inspectionId).maybeSingle(); dbError(error);
    if (!data) reject(404,'NOT_FOUND','점검 기록을 찾을 수 없습니다.');
    return data;
}
async function getEvidence(db: any, inspectionId: string): Promise<Evidence[]> {
    const {data,error} = await db.from('psi_inspector_evidence').select('id,inspection_id,sha256,mime_type,byte_size,created_at').eq('inspection_id',inspectionId).order('created_at'); dbError(error);
    return data || [];
}
async function update(db: any, current: Inspection, document: any, revision: unknown) {
    if(!Number.isSafeInteger(revision) || revision !== current.revision) reject(409,'REVISION_CONFLICT','다른 변경사항이 있습니다. 저장한 기록을 다시 열어 주세요.');
    const {data,error} = await db.from('psi_inspector_inspections').update({document})
        .eq('id',current.id).eq('revision',revision).select(columns).maybeSingle(); dbError(error);
    if(!data) reject(409,'REVISION_CONFLICT','다른 변경사항이 있습니다. 저장한 기록을 다시 열어 주세요.');
    return data;
}
function photoFormat(bytes: Buffer): { mime: string; extension: string } {
    if(bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return {mime:'image/jpeg',extension:'jpg'};
    if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return {mime:'image/png',extension:'png'};
    if(bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP') return {mime:'image/webp',extension:'webp'};
    return reject(400,'PHOTO_FORMAT','JPG·PNG·WebP 원본사진을 선택해 주세요.');
}
export default async function inspector(req: any, res: any) {
    res.setHeader('Cache-Control','private, no-store');
    if(req.method !== 'POST') {res.setHeader('Allow','POST'); return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED'});}
    // A shared password must never become cross-tenant authority. Tenant rollout is a separate milestone.
    if(!isValidAdminAuthRequest(req)) return res.status(401).json({ok:false,code:'AUTH_REQUIRED',message:'관리자 로그인이 필요합니다.'});
    if(process.env.PSI_DEPLOYMENT_MODEL === 'shared-saas') return res.status(403).json({ok:false,code:'DEDICATED_ONLY',message:'기업별 점검 권한 준비가 필요합니다.'});
    try {
        const body = bodyInput(req);
        if(['analyze','paid-analyze','siwc'].includes(body.op)) reject(403,'AI_DISABLED','자동 AI 호출은 활성화되지 않았습니다. 수동 결과 가져오기를 이용해 주세요.');
        const db = createSupabaseServerClient({includeAdminSecret:false});
        const quota = await consumeApiQuota(db,{scope:'inspector.admin',clientKeyHash:resolveRequestFingerprint(req),maxRequests:120,windowSeconds:60});
        if(!quota.allowed) {res.setHeader('Retry-After',String(quota.retryAfterSeconds)); reject(429,'RATE_LIMIT','요청이 많습니다. 잠시 후 다시 시도해 주세요.');}
        if(body.op === 'list') {
            keys(body,['before','beforeId']);
            let query = db.from('psi_inspector_summary').select('id,revision,title,work_type,location,urgent,open_actions,needs_review,created_at,updated_at').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(51);
            if(body.beforeId !== undefined && (body.before === undefined || typeof body.beforeId !== 'string' || !UUID.test(body.beforeId))) reject(400,'INVALID_CURSOR','목록 위치를 확인해 주세요.');
            if(body.before !== undefined) {
                if(typeof body.before !== 'string' || body.before.length > 40 || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|\+00:00)$/.test(body.before) || !Number.isFinite(Date.parse(body.before))) reject(400,'INVALID_CURSOR','목록 위치를 확인해 주세요.');
                query=body.beforeId ? query.or(`created_at.lt.${body.before},and(created_at.eq.${body.before},id.lt.${body.beforeId})`) : query.lt('created_at',body.before);
            }
            const {data,error} = await query; dbError(error);
            const items=(data||[]).slice(0,50),hasMore=(data||[]).length>50,last=items.at(-1);
            return res.status(200).json({ok:true,items,hasMore,nextCursor:hasMore && last ? {before:last.created_at,beforeId:last.id} : null});
        }
        if(body.op === 'create') {
            keys(body,['id']); const inspectionId=id(body.id);
            const {data,error} = await db.from('psi_inspector_inspections').insert({id:inspectionId,document:newInspectionDocument()}).select(columns).single();
            if(error?.code==='23505') return res.status(200).json({ok:true,item:await getInspection(db,inspectionId),replayed:true});
            dbError(error); return res.status(201).json({ok:true,item:data});
        }
        const inspectionId=id(body.id), current=await getInspection(db,inspectionId);
        if(body.op==='detail') {keys(body,['id']); const evidence=await getEvidence(db,inspectionId);
            const {data:reports,error:reportsError}=await db.from('psi_inspector_reports').select('id,inspection_revision,created_at').eq('inspection_id',inspectionId).order('created_at',{ascending:false}).limit(20);dbError(reportsError);
            const {data:events,error}=await db.from('psi_inspector_events').select('revision,occurred_at,actor_label').eq('inspection_id',inspectionId).order('revision',{ascending:false}).limit(100);dbError(error);
            return res.status(200).json({ok:true,item:current,evidence,events:events||[],reports:reports||[]});}
        if(body.op==='save') {
            keys(body,['id','expectedRevision','document']);
            const document=validateDocument(body.document,inspectionId,await getEvidence(db,inspectionId));assertSafeEdit(document,current.document);
            return res.status(200).json({ok:true,item:await update(db,current,document,body.expectedRevision)});
        }
        if(body.op==='upload') {
            keys(body,['id','photoId','base64','uploadConfirmed']); if(body.uploadConfirmed!==true) reject(400,'UPLOAD_CONFIRMATION','사진의 보관 허용과 민감정보 처리를 확인해 주세요.'); const photoId=id(body.photoId);
            if(typeof body.base64!=='string' || body.base64.length>4_194_304 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.base64)) reject(413,'PHOTO_SIZE','사진은 3MB 이하로 선택해 주세요.');
            const bytes=Buffer.from(body.base64,'base64');if(!bytes.length || bytes.length>MAX_PHOTO) reject(413,'PHOTO_SIZE','사진은 3MB 이하로 선택해 주세요.');
            const format=photoFormat(bytes),hash=createHash('sha256').update(bytes).digest('hex');
            const evidence=await getEvidence(db,inspectionId), prior=evidence.find(p=>p.id===photoId);
            if(prior) {if(prior.sha256!==hash) reject(409,'PHOTO_CONFLICT','사진번호에 다른 원본이 등록되어 있습니다.');return res.status(200).json({ok:true,photo:prior,replayed:true});}
            if(evidence.length>=20) reject(400,'PHOTO_LIMIT','점검당 사진은 20개까지 등록할 수 있습니다.');
            const storageKey=`${inspectionId}/${photoId}/${hash}.${format.extension}`;
            const uploaded=await db.storage.from(BUCKET).upload(storageKey,bytes,{contentType:format.mime,upsert:false});
            if(uploaded.error) {
                const status=String(uploaded.error.statusCode ?? uploaded.error.status ?? '');
                if(status!=='409' && status!=='Duplicate' && status!=='ResourceAlreadyExists') dbError(uploaded.error);
                // A previous request may have stored the bytes but lost its DB response.
                const replay=(await getEvidence(db,inspectionId)).find(p=>p.id===photoId);
                if(replay) {if(replay.sha256!==hash) reject(409,'PHOTO_CONFLICT','사진번호에 다른 원본이 등록되어 있습니다.');return res.status(200).json({ok:true,photo:replay,replayed:true});}
                const recovered=await db.storage.from(BUCKET).download(storageKey);dbError(recovered.error);
                if(!recovered.data || createHash('sha256').update(Buffer.from(await recovered.data.arrayBuffer())).digest('hex')!==hash) reject(409,'PHOTO_CONFLICT','보관된 원본을 확인할 수 없습니다.');
            }
            const {data,error}=await db.from('psi_inspector_evidence').insert({id:photoId,inspection_id:inspectionId,sha256:hash,mime_type:format.mime,byte_size:bytes.length,storage_key:storageKey})
                .select('id,inspection_id,sha256,mime_type,byte_size,created_at').single();
            if(error) {
                if(error.code==='23505') {
                    const replay=(await getEvidence(db,inspectionId)).find(p=>p.id===photoId);
                    if(replay?.sha256===hash) return res.status(200).json({ok:true,photo:replay,replayed:true});
                    if(replay) reject(409,'PHOTO_CONFLICT','사진번호에 다른 원본이 등록되어 있습니다.');
                }
                // Never delete bytes here: another concurrent retry may already reference them.
                // Unlinked bytes remain private and can be recovered by the same upload ID.
                dbError(error);
            }
            return res.status(201).json({ok:true,photo:data});
        }
        if(body.op==='photo') {
            keys(body,['id','photoId']);const photoId=id(body.photoId);
            const {data,error}=await db.from('psi_inspector_evidence').select('storage_key').eq('inspection_id',inspectionId).eq('id',photoId).maybeSingle();dbError(error);
            if(!data) reject(404,'PHOTO_NOT_FOUND','원본사진을 찾을 수 없습니다.');
            const signed=await db.storage.from(BUCKET).createSignedUrl(data.storage_key,120);dbError(signed.error);
            return res.status(200).json({ok:true,url:signed.data.signedUrl,expiresIn:120});
        }
        if(body.op==='verify-action') {
            keys(body,['id','actionId','expectedRevision','verificationNote']);const actionId=id(body.actionId);
            if(typeof body.verificationNote!=='string' || body.verificationNote.trim().length<5 || body.verificationNote.length>2000) reject(400,'REVIEW_REQUIRED','현장 재점검 내용을 5자 이상 기록해 주세요.');
            const document=structuredClone(current.document),action=document.actions.find(a=>a.id===actionId);
            if(!action || action.status!=='review-requested' || !action.completionPhotoId) reject(409,'REINSPECTION_REQUIRED','개선사진을 등록하고 완료 검토를 요청한 뒤 재점검해 주세요.');
            const evidence=await getEvidence(db,inspectionId);if(!evidence.some(p=>p.id===action.completionPhotoId)) reject(409,'EVIDENCE_REQUIRED','개선사진 원본을 확인해 주세요.');
            action.status='verified';action.note=body.verificationNote.trim();action.verifiedAt=new Date().toISOString();
            validateDocument(document,inspectionId,evidence);
            return res.status(200).json({ok:true,item:await update(db,current,document,body.expectedRevision)});
        }
        if(body.op==='read-report') {
            keys(body,['id','reportId']);const reportId=id(body.reportId);
            const {data,error}=await db.from('psi_inspector_reports').select('id,inspection_id,inspection_revision,snapshot,snapshot_sha256,created_at').eq('inspection_id',inspectionId).eq('id',reportId).maybeSingle();dbError(error);
            if(!data) reject(404,'REPORT_NOT_FOUND','보고서를 찾을 수 없습니다.');
            return res.status(200).json({ok:true,report:data});
        }
        if(body.op==='report') {
            keys(body,['id','expectedRevision']);if(body.expectedRevision!==current.revision) reject(409,'REVISION_CONFLICT','최신 저장본을 다시 확인해 주세요.');
            const evidence=await getEvidence(db,inspectionId);
            const snapshot={inspection:current,evidence,legalStatus:'UNVERIFIED',reportStatus:'DRAFT',generatedAt:new Date().toISOString()};
            const hash=createHash('sha256').update(serializeSnapshot(snapshot)).digest('hex');
            const {data,error}=await db.from('psi_inspector_reports').insert({id:randomUUID(),inspection_id:inspectionId,inspection_revision:current.revision,snapshot,snapshot_sha256:hash}).select('id,inspection_id,inspection_revision,snapshot,snapshot_sha256,created_at').single();dbError(error);
            return res.status(201).json({ok:true,report:data});
        }
        reject(400,'UNKNOWN_OPERATION','지원하지 않는 점검 요청입니다.');
    } catch(error) {
        if(error instanceof InspectorInputError) return res.status(400).json({ok:false,code:'INVALID_INPUT',message:error.message});
        if(error instanceof RequestError) return res.status(error.status).json({ok:false,code:error.code,message:error.message});
        return res.status(503).json({ok:false,code:'INSPECTOR_UNAVAILABLE',message:'점검 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.'});
    }
}
