import { authenticateTenantUser, requireTenantContext, sendTenantError, TenantAccessError } from './tenantAuth.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const managers = ['owner', 'admin'] as const;
const releaseColumns = 'tenant_id,id,draft_id,draft_revision,title,site_name,worker_ids,expires_at,revoked,revision,created_at';
function invalid(): never { throw new TenantAccessError(400, 'INVALID_EDUCATION_INPUT', '입력 내용을 확인해 주세요.'); }
function id(value: unknown): string { if (typeof value !== 'string' || !uuid.test(value)) return invalid(); return value.toLowerCase(); }
function revision(value: unknown, min = 1): number {
    if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > 2147483646) return invalid();
    return Number(value);
}
function body(req: any, allowed: string[]): Record<string, unknown> {
    try {
        const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        if (!raw || Buffer.byteLength(raw, 'utf8') > 4096) throw new TenantAccessError(413, 'EDUCATION_INPUT_TOO_LARGE', '입력 내용이 너무 큽니다.');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).some(key => !allowed.includes(key))) return invalid();
        return parsed;
    } catch (error) { if (error instanceof TenantAccessError) throw error; return invalid(); }
}
function database(error: any, account = false): never {
    if (error?.code === '42501') throw new TenantAccessError(403, 'EDUCATION_FORBIDDEN', '이 교육 또는 계정에 대한 이용 권한이 없습니다.');
    if (['40001', '23505'].includes(error?.code)) throw new TenantAccessError(409, 'EDUCATION_REVISION_CONFLICT', '다른 사용자가 변경했거나 이미 연결된 계정입니다. 목록을 다시 확인해 주세요.');
    if (error?.code === '23514') throw new TenantAccessError(409, 'EDUCATION_NOT_READY', account
        ? '이용 중인 근로자와 이메일 확인을 마친 개인 계정이 필요합니다. 운영 관리자에게 확인해 주세요.'
        : '대상자 명단과 개인 계정 연결을 확인해 주세요. 초안을 다시 조회한 후 배포할 수 있습니다.');
    throw new TenantAccessError(503, 'EDUCATION_UNAVAILABLE', '교육 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.');
}
function row(value: any): any { if (Array.isArray(value)) { if (value.length !== 1) return database(null); return value[0]; } return value; }
function accountDto(value: any, tenant: string, worker: string) {
    const item = row(value);
    if (!item || item.tenant_id !== tenant || item.worker_id !== worker || typeof item.email !== 'string'
        || typeof item.active !== 'boolean' || !Number.isSafeInteger(item.revision) || item.revision < 1) return database(null);
    return { email: item.email, active: item.active, revision: item.revision, updatedAt: item.updated_at };
}
function releaseDto(value: any, tenant: string) {
    const item = row(value);
    if (!item || item.tenant_id !== tenant || !uuid.test(item.id) || !Array.isArray(item.worker_ids)
        || item.worker_ids.length < 1 || item.worker_ids.length > 200 || item.worker_ids.some((worker: unknown) => typeof worker !== 'string' || !uuid.test(worker))
        || typeof item.revoked !== 'boolean' || ![1,2].includes(item.revision)) return database(null);
    return { id: item.id, draftId: item.draft_id, draftRevision: item.draft_revision, title: item.title,
        siteName: item.site_name, workerIds: item.worker_ids, expiresAt: item.expires_at,
        revoked: item.revoked, revision: item.revision, createdAt: item.created_at };
}
function method(req: any, res: any, allowed: string[]) {
    if (allowed.includes(req.method)) return true;
    res.setHeader('Allow', allowed.join(', ')); res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' }); return false;
}
function cursor(value: unknown): { createdAt: string; id: string } | null {
    if (value === undefined) return null;
    if (typeof value !== 'string' || value.length > 300 || !/^[A-Za-z0-9_-]+$/.test(value)) return invalid();
    try {
        const parsed=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
        if (typeof parsed.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(parsed.createdAt)
            || !Number.isFinite(Date.parse(parsed.createdAt))) return invalid();
        return {createdAt:parsed.createdAt,id:id(parsed.id)};
    } catch { return invalid(); }
}
export async function tenantWorkerAccounts(req: any, res: any) {
    if (!method(req,res,['GET','POST','PATCH'])) return;
    try {
        const context=await requireTenantContext(req,managers);
        if (req.method==='GET') {
            const worker=id(req.query?.workerId);
            const exists=await context.client.from('psi_tenant_workers').select('id').eq('tenant_id',context.tenantId).eq('id',worker).maybeSingle();
            if(exists.error) database(exists.error,true);
            if(!exists.data) throw new TenantAccessError(404,'WORKER_NOT_FOUND','근로자 명단을 찾을 수 없습니다.');
            const result=await context.client.from('psi_tenant_worker_accounts').select('tenant_id,worker_id,email,active,revision,updated_at')
                .eq('tenant_id',context.tenantId).eq('worker_id',worker).maybeSingle();
            if(result.error) database(result.error,true);
            return res.status(200).json({ok:true,account:result.data?accountDto(result.data,context.tenantId,worker):null});
        }
        const input=body(req,req.method==='POST'?['workerId','email','expectedRevision']:['workerId','expectedRevision']);
        const worker=id(input.workerId), expected=revision(input.expectedRevision,req.method==='POST'?0:1);
        let result;
        if(req.method==='POST') {
            if(typeof input.email!=='string' || input.email.length>320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return invalid();
            result=await context.client.rpc('psi_link_worker_account',{p_tenant:context.tenantId,p_worker:worker,p_email:input.email.trim().toLowerCase(),p_expected:expected});
        } else result=await context.client.rpc('psi_suspend_worker_account',{p_tenant:context.tenantId,p_worker:worker,p_expected:expected});
        if(result.error) database(result.error,true);
        return res.status(200).json({ok:true,account:accountDto(result.data,context.tenantId,worker)});
    } catch(error) { return sendTenantError(res,error); }
}
export async function tenantEducationReleases(req: any, res: any) {
    if(!method(req,res,['GET','POST','PATCH'])) return;
    try {
        const context=await requireTenantContext(req,req.method==='GET'?undefined:managers);
        if(req.method==='GET') {
            const draft=id(req.query?.draftId), after=cursor(req.query?.cursor);
            let query=context.client.from('psi_tenant_education_releases').select(releaseColumns)
                .eq('tenant_id',context.tenantId).eq('draft_id',draft).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(26);
            if(after) query=query.or(`created_at.lt.${after.createdAt},and(created_at.eq.${after.createdAt},id.lt.${after.id})`);
            const result=await query; if(result.error) database(result.error);
            const items=(result.data||[]).slice(0,25).map(item=>releaseDto(item,context.tenantId));
            const last=items.at(-1);
            return res.status(200).json({ok:true,items,nextCursor:(result.data||[]).length>25&&last?Buffer.from(JSON.stringify({createdAt:last.createdAt,id:last.id})).toString('base64url'):null});
        }
        const input=body(req,req.method==='POST'?['draftId','expectedRevision','requestId','hours']:['releaseId','expectedRevision']);
        const expected=revision(input.expectedRevision); let result;
        if(req.method==='POST') {
            if(!Number.isInteger(input.hours) || Number(input.hours)<1 || Number(input.hours)>168) return invalid();
            result=await context.client.rpc('psi_publish_tenant_education',{p_tenant:context.tenantId,p_draft:id(input.draftId),p_expected:expected,p_request:id(input.requestId),p_hours:input.hours});
        } else result=await context.client.rpc('psi_revoke_tenant_education',{p_tenant:context.tenantId,p_release:id(input.releaseId),p_expected:expected});
        if(result.error) database(result.error);
        return res.status(req.method==='POST'?201:200).json({ok:true,item:releaseDto(result.data,context.tenantId)});
    } catch(error) { return sendTenantError(res,error); }
}
export async function workerEducation(req: any, res: any) {
    if(!method(req,res,['GET'])) return;
    try {
        const principal=await authenticateTenantUser(req);
        const result=await principal.client.rpc('psi_read_worker_education',{p_release:id(req.query?.releaseId),p_worker:id(req.query?.workerId)});
        if(result.error) database(result.error);
        const item=result.data;
        if(!item || typeof item.title!=='string' || typeof item.siteName!=='string' || typeof item.sourceTextKo!=='string'
            || typeof item.workerName!=='string' || typeof item.expiresAt!=='string' || !Number.isSafeInteger(item.draftRevision)) return database(null);
        return res.status(200).json({ok:true,education:{title:item.title,siteName:item.siteName,sourceTextKo:item.sourceTextKo,
            workerName:item.workerName,expiresAt:item.expiresAt,draftRevision:item.draftRevision}});
    } catch(error) { return sendTenantError(res,error); }
}
