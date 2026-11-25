/**
 * L06 worker/site/cycle authorization preflight: unconnected SOURCE-ONLY adapter.
 *
 * The real Supabase project has worker-account links but has NOT proved the
 * worker-specific site assignment + cycle tables or their RLS. This module
 * intentionally has no database client, no endpoint and no writes.
 *
 * Only an authenticated server can supply a verifiedPrincipal. Never build it
 * from browser fields, JWT user_metadata, query parameters or arbitrary JSON.
 */
export type L06ScopeRow = Record<string, unknown>;
export interface L06ServerVerifiedPrincipal {
    userId: string;
    sessionExpiresAt: string; // Server-verified expiry, not a client claim.
}
export interface L06RequestedScope {
    tenantId: string;
    siteId: string;
    cycleId: string;
}
export interface L06ScopeLookupPort {
    linkedAccountsForVerifiedUser: (userId: string) => Promise<unknown>;
    activeWorker: (tenantId: string, workerId: string) => Promise<unknown>;
    workerSiteAssignments: (tenantId: string, workerId: string) => Promise<unknown>;
    site: (tenantId: string, siteId: string) => Promise<unknown>;
    assessmentCycle: (tenantId: string, siteId: string, cycleId: string) => Promise<unknown>;
}
export type L06ScopeCode =
    | 'AUTH_INVALID' | 'SELECTION_INVALID' | 'NO_WORKER_LINK'
    | 'WORKER_NOT_ACTIVE' | 'SITE_NOT_ASSIGNED' | 'SITE_NOT_ACTIVE'
    | 'CYCLE_NOT_OPEN' | 'SOURCE_UNAVAILABLE';
export type L06ScopeResolution =
    | { ok: false; code: L06ScopeCode; submissionAuthorized: false }
    | { ok: true; scope: { userId: string; tenantId: string; siteId: string; cycleId: string; workerId: string };
        checkedFor: 'identity-site-cycle-only'; submissionAuthorized: false };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isRow = (v: unknown): v is L06ScopeRow => !!v && typeof v === 'object' && !Array.isArray(v);
const fail = (code: L06ScopeCode): L06ScopeResolution => ({ ok: false, code, submissionAuthorized: false });
const limit = 100;
const isoTime = (v: unknown): number | null => {
    if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)) return null;
    const t = Date.parse(v);
    if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 19) !== v.slice(0, 19)) return null;
    return t;
};
const exactly = (record: L06ScopeRow, expected: Record<string, unknown>) =>
    Object.entries(expected).every(([key, value]) => record[key] === value);

/**
 * This is a deterministic authorization-check contract, NOT a DB RLS policy.
 * Any missing/error/ambiguous relationship DENIES. Even a complete match
 * cannot create a submission: that still requires privacy, durable receipt,
 * idempotency, RLS, audit and explicit owner approval.
 */
export async function resolveL06WorkerScope(
    verifiedPrincipal: L06ServerVerifiedPrincipal | null,
    requested: L06RequestedScope,
    port: L06ScopeLookupPort,
    now: Date,
): Promise<L06ScopeResolution> {
    const nowMs = now instanceof Date ? now.getTime() : NaN;
    if (!verifiedPrincipal || !UUID.test(verifiedPrincipal.userId)
        || !Number.isFinite(nowMs) || isoTime(verifiedPrincipal.sessionExpiresAt) === null
        || (isoTime(verifiedPrincipal.sessionExpiresAt) as number) <= nowMs) return fail('AUTH_INVALID');
    if (!requested || !UUID.test(requested.tenantId) || !UUID.test(requested.siteId)
        || !UUID.test(requested.cycleId)) return fail('SELECTION_INVALID');

    const userId = verifiedPrincipal.userId.toLowerCase();
    const tenantId = requested.tenantId.toLowerCase();
    const siteId = requested.siteId.toLowerCase();
    const cycleId = requested.cycleId.toLowerCase();

    try {
        const links = await port.linkedAccountsForVerifiedUser(userId);
        if (!Array.isArray(links) || links.length > limit || links.some(row =>
            !isRow(row) || row.userId !== userId || !UUID.test(String(row.tenantId || ''))
            || !UUID.test(String(row.workerId || '')) || typeof row.active !== 'boolean')) return fail('SOURCE_UNAVAILABLE');
        const matching = links.filter(row => row.tenantId === tenantId && row.active === true);
        // Ambiguous linked workers for one tenant must be resolved by staff.
        if (matching.length !== 1) return fail('NO_WORKER_LINK');
        const workerId = String(matching[0].workerId);

        const worker = await port.activeWorker(tenantId, workerId);
        if (!isRow(worker) || !exactly(worker, {tenantId, workerId, active: true}))
            return fail('WORKER_NOT_ACTIVE');

        const assignments = await port.workerSiteAssignments(tenantId, workerId);
        if (!Array.isArray(assignments) || assignments.length > limit
            || assignments.some(row => !isRow(row)
                || row.tenantId !== tenantId || row.workerId !== workerId
                || !UUID.test(String(row.siteId || '')) || typeof row.active !== 'boolean'))
            return fail('SOURCE_UNAVAILABLE');
        const assigned = assignments.filter(row => row.siteId === siteId && row.active === true);
        if (assigned.length !== 1) return fail('SITE_NOT_ASSIGNED');

        const site = await port.site(tenantId, siteId);
        if (!isRow(site) || !exactly(site, {tenantId, siteId, active: true}))
            return fail('SITE_NOT_ACTIVE');

        const cycle = await port.assessmentCycle(tenantId, siteId, cycleId);
        if (!isRow(cycle) || !exactly(cycle, {tenantId, siteId, cycleId, status: 'open'}))
            return fail('CYCLE_NOT_OPEN');
        const start = isoTime(cycle.opensAt);
        const end = isoTime(cycle.closesAt);
        if (start === null || end === null || start >= end || nowMs < start || nowMs >= end)
            return fail('CYCLE_NOT_OPEN');

        return {
            ok: true,
            checkedFor: 'identity-site-cycle-only',
            scope: {userId, tenantId, siteId, cycleId, workerId},
            submissionAuthorized: false,
        };
    } catch {
        // Do not disclose DB errors or existence of another tenant or worker.
        return fail('SOURCE_UNAVAILABLE');
    }
}
