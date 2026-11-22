/**
 * L06 manager revision evidence read: SOURCE-ONLY server authorization contract.
 *
 * NOT an API handler or a Supabase implementation. Only a trusted backend
 * may construct principal + port. Never derive either from browser payload,
 * query-string userId, JWT user_metadata or a service_role browser client.
 *
 * A real adapter must revalidate Supabase Auth/session revocation, use
 * caller-scoped DB permissions, and independently recheck authorization
 * inside psi_read_worker_risk_revision_chain_l06. No production API is wired.
 */
export interface L06VerifiedManagerPrincipal {
    userId: string;
    sessionId: string;
    expiresAt: string; // trusted server verification, ISO UTC
}
export interface L06ManagerRevisionRequest {
    tenantId: string;
    siteId: string;
    originalSubmissionId: string;
}
export interface L06ManagerRevisionReadPort {
    activeSession: (userId: string, sessionId: string) => Promise<unknown>;
    membership: (tenantId: string, userId: string) => Promise<unknown>;
    siteMembership: (tenantId: string, siteId: string, userId: string) => Promise<unknown>;
    site: (tenantId: string, siteId: string) => Promise<unknown>;
    // This port MUST independently authorize the verified DB caller in SQL.
    // Never call using a privileged service client that bypasses tenant RLS.
    authorizedRevisionChain: (
        tenantId: string, siteId: string, originalSubmissionId: string, userId: string,
    ) => Promise<unknown>;
}
export type L06ManagerReadDenied =
    | 'SESSION_INVALID' | 'SCOPE_INVALID' | 'MANAGER_NOT_AUTHORIZED'
    | 'SITE_NOT_AUTHORIZED' | 'EVIDENCE_UNAVAILABLE';
export type L06ManagerReadResult =
    | { ok: false; code: L06ManagerReadDenied; dataReleased: false }
    | { ok: true; evidence: Record<string, unknown>; dataReleased: true;
        verification: 'isolated-adapter-contract-only'; workClearanceGranted: false };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hasShape = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
const fail = (code: L06ManagerReadDenied): L06ManagerReadResult =>
    ({ok:false,code,dataReleased:false});
const utc = (v: unknown): number | null => {
    if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)) return null;
    const n = Date.parse(v);
    return Number.isFinite(n) && new Date(n).toISOString().slice(0,19)===v.slice(0,19) ? n : null;
};
const exactly = (v: unknown, fields: Record<string, unknown>) =>
    hasShape(v) && Object.entries(fields).every(([k,val])=>v[k]===val);
const keys = ['Q1','Q2','Q3','Q4','Q5'];
const grades = ['상','중','하'];
const revisionEventsValid = (events: unknown, terminalChanges: boolean): boolean => {
    if (!Array.isArray(events) || events.length>2) return false;
    if(terminalChanges && events.length===0) return false;
    for(let i=0;i<events.length;i++){
        const e=events[i];
        if(!hasShape(e) || e.revision!==i+1 ||
            typeof e.note!=='string' || e.note.trim().length<10 || e.note.length>800 ||
            !['reviewed','request_changes','approved'].includes(String(e.action))) return false;
        if(i===0 && e.action==='approved') return false;
        if(i===1 && (events[0].action!=='reviewed' || e.action==='reviewed')) return false;
    }
    return !terminalChanges || events[events.length-1].action==='request_changes';
};
const recordValid = (v: unknown, tenantId:string, siteId:string): v is Record<string,unknown> => {
    if(!exactly(v,{schema:'psi-worker-risk-manager-review-v1',tenantId,siteId,workClearanceGranted:false})
        || !hasShape(v)) return false;
    const answers = hasShape(v.answers) ? v.answers : null;
    if(!UUID.test(String(v.submissionId||'')) || !UUID.test(String(v.workerId||''))
        || !['ko','vi','zh','th','km','uz','id','mn','ru','my','kk','bn'].includes(String(v.sourceLanguage))
        || !grades.includes(String(v.selfRiskGrade))
        || typeof v.gradeReason!=='string' || v.gradeReason.length>500
        || utc(v.receivedAt)===null || !answers
        || Object.keys(answers).length!==5
        || !keys.every(k=>typeof answers[k]==='string' && (answers[k] as string).length<=500 &&
            (k==='Q3' ? answers[k]===v.selfRiskGrade : (answers[k] as string).trim().length>=2))) return false;
    return revisionEventsValid(v.events,false);
};

/**
 * This verifies the *output shape and scope* of a source-only read adapter,
 * NOT actual Supabase Auth/RLS or legal eligibility to display worker data.
 * No network/storage is performed by this function.
 */
export async function inspectL06ManagerRevisionRead(
    principal: L06VerifiedManagerPrincipal|null,
    req: L06ManagerRevisionRequest,
    port: L06ManagerRevisionReadPort,
    now: Date,
): Promise<L06ManagerReadResult> {
    const nowMs = now instanceof Date ? now.getTime() : NaN;
    if(!principal || !UUID.test(principal.userId) || !UUID.test(principal.sessionId) ||
        !Number.isFinite(nowMs) || utc(principal.expiresAt)===null ||
        (utc(principal.expiresAt) as number)<=nowMs) return fail('SESSION_INVALID');
    if(!req || !UUID.test(req.tenantId) || !UUID.test(req.siteId) ||
        !UUID.test(req.originalSubmissionId)) return fail('SCOPE_INVALID');
    const userId=principal.userId.toLowerCase();
    const sessionId=principal.sessionId.toLowerCase();
    const tenantId=req.tenantId.toLowerCase();
    const siteId=req.siteId.toLowerCase();
    const originalSubmissionId=req.originalSubmissionId.toLowerCase();
    try{
        const session=await port.activeSession(userId,sessionId);
        if(!exactly(session,{userId,sessionId,active:true}) || !hasShape(session) ||
           utc(session.expiresAt)===null || (utc(session.expiresAt) as number)<=nowMs) return fail('SESSION_INVALID');
        const member=await port.membership(tenantId,userId);
        if(!hasShape(member) || !exactly(member,{tenantId,userId,status:'active'}) ||
           !['owner','admin','reviewer'].includes(String(member.role))) return fail('MANAGER_NOT_AUTHORIZED');
        const assigned=await port.siteMembership(tenantId,siteId,userId);
        if(!exactly(assigned,{tenantId,siteId,userId,status:'active'})) return fail('SITE_NOT_AUTHORIZED');
        const site=await port.site(tenantId,siteId);
        if(!exactly(site,{tenantId,siteId,active:true})) return fail('SITE_NOT_AUTHORIZED');

        const chain=await port.authorizedRevisionChain(tenantId,siteId,originalSubmissionId,userId);
        if(!exactly(chain,{schema:'psi-worker-risk-revision-chain-v1',workClearanceGranted:false}) ||
           !hasShape(chain) || !recordValid(chain.original,tenantId,siteId) ||
           !recordValid(chain.replacement,tenantId,siteId) ||
           !hasShape(chain.original)||!hasShape(chain.replacement) ||
           chain.original.submissionId!==originalSubmissionId ||
           chain.original.workerId!==chain.replacement.workerId ||
           chain.original.submissionId===chain.replacement.submissionId ||
           !revisionEventsValid(chain.original.events,true) ||
           chain.original.workerId===userId || utc(chain.linkedAt)===null ||
           (utc(chain.original.receivedAt) as number)>=(utc(chain.replacement.receivedAt) as number) ||
           (utc(chain.linkedAt) as number)<(utc(chain.replacement.receivedAt) as number)) return fail('EVIDENCE_UNAVAILABLE');
        // The real SQL read RPC must check manager's DB role AGAIN.
        return {ok:true,evidence:chain,dataReleased:true,
            verification:'isolated-adapter-contract-only',workClearanceGranted:false};
    }catch{
        // Never leak row existence, errors, names or cross-tenant data.
        return fail('EVIDENCE_UNAVAILABLE');
    }
}
