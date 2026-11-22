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
const chainKeys=['schema','original','replacement','linkedAt','workClearanceGranted'];
const recordKeys=['schema','tenantId','siteId','submissionId','workerId','formVersion',
    'sourceLanguage','answers','selfRiskGrade','gradeReason','receivedAt','events','workClearanceGranted'];
const eventKeys=['revision','action','note','reviewerId','recordedAt'];
const exactKeys=(value:Record<string,unknown>,allowed:string[]) =>
    Object.keys(value).length===allowed.length && Object.keys(value).every(k=>allowed.includes(k));
const grades = ['상','중','하'];
const revisionEventsValid = (events: unknown, terminalChanges: boolean): boolean => {
    if (!Array.isArray(events) || events.length>2) return false;
    if(terminalChanges && events.length===0) return false;
    for(let i=0;i<events.length;i++){
        const e=events[i];
        if(!hasShape(e) || !exactKeys(e,eventKeys) || e.revision!==i+1 ||
            !UUID.test(String(e.reviewerId||'')) || utc(e.recordedAt)===null ||
            typeof e.note!=='string' || e.note.trim().length<10 || e.note.length>800 ||
            !['reviewed','request_changes','approved'].includes(String(e.action))) return false;
        if(i===0 && e.action==='approved') return false;
        if(i===1 && (events[0].action!=='reviewed' || e.action==='reviewed' ||
            (e.action==='approved' && e.reviewerId===events[0].reviewerId))) return false;
    }
    return !terminalChanges || events[events.length-1].action==='request_changes';
};
const recordValid = (v: unknown, tenantId:string, siteId:string): v is Record<string,unknown> => {
    if(!exactly(v,{schema:'psi-worker-risk-manager-review-v1',tenantId,siteId,workClearanceGranted:false})
        || !hasShape(v)) return false;
    const answers = hasShape(v.answers) ? v.answers : null;
    if(!exactKeys(v,recordKeys) || !UUID.test(String(v.submissionId||'')) || !UUID.test(String(v.workerId||''))
        || v.formVersion!=='psi-form-master-2026-11-22-v2-legacy-compatible'
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
 * No network/storage is performed directly by this function.
 * Its injected server port can query a test data source. All real DB checks
 * must be atomic/transactionally authorized before final production use.
 */
export async function inspectL06ManagerRevisionRead(
    principal: L06VerifiedManagerPrincipal|null,
    req: L06ManagerRevisionRequest,
    port: L06ManagerRevisionReadPort,
    clock: () => Date,
): Promise<L06ManagerReadResult> {
    // Only a trusted server supplies the clock. Never use a client timestamp.
    let nowMs: number;
    try {
        const sampled = clock();
        nowMs = sampled instanceof Date ? sampled.getTime() : NaN;
    } catch {
        return fail('SESSION_INVALID');
    }
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
           !hasShape(chain) || !exactKeys(chain,chainKeys) ||
           !recordValid(chain.original,tenantId,siteId) ||
           !recordValid(chain.replacement,tenantId,siteId) ||
           !hasShape(chain.original)||!hasShape(chain.replacement) ||
           chain.original.submissionId!==originalSubmissionId ||
           chain.original.workerId!==chain.replacement.workerId ||
           chain.original.submissionId===chain.replacement.submissionId ||
           !revisionEventsValid(chain.original.events,true) ||
           chain.original.workerId===userId || utc(chain.linkedAt)===null ||
           (utc(chain.original.receivedAt) as number)>=(utc(chain.replacement.receivedAt) as number) ||
           (utc(chain.linkedAt) as number)<(utc(chain.replacement.receivedAt) as number) ||
           !Array.isArray(chain.original.events) ||
           (utc(chain.original.events.at(-1)?.recordedAt) as number) <=
             (utc(chain.original.receivedAt) as number) ||
           (utc(chain.original.events.at(-1)?.recordedAt) as number) >=
             (utc(chain.replacement.receivedAt) as number)) return fail('EVIDENCE_UNAVAILABLE');
        // TOCTOU defense in depth: a role, site or session can be revoked while
        // a slow DB read is in flight. Recheck immediately BEFORE release.
        // This does not replace a single-transaction SQL authorization proof.
        const finished = clock();
        const finalMs = finished instanceof Date ? finished.getTime() : NaN;
        if(!Number.isFinite(finalMs) || finalMs<nowMs ||
            (utc(principal.expiresAt) as number)<=finalMs) return fail('SESSION_INVALID');
        const currentSession = await port.activeSession(userId,sessionId);
        if(!exactly(currentSession,{userId,sessionId,active:true}) ||
           !hasShape(currentSession) || utc(currentSession.expiresAt)===null ||
           (utc(currentSession.expiresAt) as number)<=finalMs) return fail('SESSION_INVALID');
        const currentMembership = await port.membership(tenantId,userId);
        if(!hasShape(currentMembership) ||
           !exactly(currentMembership,{tenantId,userId,status:'active'}) ||
           !['owner','admin','reviewer'].includes(String(currentMembership.role)))
            return fail('MANAGER_NOT_AUTHORIZED');
        const currentAssignment = await port.siteMembership(tenantId,siteId,userId);
        if(!exactly(currentAssignment,{tenantId,siteId,userId,status:'active'}))
            return fail('SITE_NOT_AUTHORIZED');
        const currentSite = await port.site(tenantId,siteId);
        if(!exactly(currentSite,{tenantId,siteId,active:true}))
            return fail('SITE_NOT_AUTHORIZED');

        // The real SQL read RPC must independently verify caller credentials
        // against the same tenant/site after acquiring its data.
        return {ok:true,evidence:chain,dataReleased:true,
            verification:'isolated-adapter-contract-only',workClearanceGranted:false};
    }catch{
        // Never leak row existence, errors, names or cross-tenant data.
        return fail('EVIDENCE_UNAVAILABLE');
    }
}
