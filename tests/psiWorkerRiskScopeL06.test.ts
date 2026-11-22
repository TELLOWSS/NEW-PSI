import { describe, expect, it, vi } from 'vitest';
import { resolveL06WorkerScope, type L06ScopeLookupPort } from '../lib/server/workerRiskScopeL06';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Invented IDs and rows only. These are NOT real tenant/user credentials.
const USER_A='10000000-0000-4000-8000-000000000001';
const USER_B='10000000-0000-4000-8000-000000000002';
const TENANT_A='20000000-0000-4000-8000-000000000001';
const TENANT_B='20000000-0000-4000-8000-000000000002';
const SITE_A='30000000-0000-4000-8000-000000000001';
const SITE_B='30000000-0000-4000-8000-000000000002';
const WORKER_A='40000000-0000-4000-8000-000000000001';
const WORKER_B='40000000-0000-4000-8000-000000000002';
const CYCLE_A='50000000-0000-4000-8000-000000000001';
const CYCLE_B='50000000-0000-4000-8000-000000000002';
const NOW = new Date('2026-11-22T03:30:00.000Z');

const principalA={userId:USER_A,sessionExpiresAt:'2026-11-22T04:00:00.000Z'};
const reqA={tenantId:TENANT_A,siteId:SITE_A,cycleId:CYCLE_A};
const validPort=():L06ScopeLookupPort => ({
    linkedAccountsForVerifiedUser:vi.fn(async userId=> [
        {userId,tenantId:TENANT_A,workerId:WORKER_A,active:true},
    ]),
    activeWorker:vi.fn(async (tenantId,workerId)=>({tenantId,workerId,active:true})),
    workerSiteAssignments:vi.fn(async (tenantId,workerId)=>[
        {tenantId,workerId,siteId:SITE_A,active:true},
    ]),
    site:vi.fn(async (tenantId,siteId)=>({tenantId,siteId,active:true})),
    assessmentCycle:vi.fn(async (tenantId,siteId,cycleId)=>({
        tenantId,siteId,cycleId,status:'open',opensAt:'2026-11-22T01:00:00.000Z',
        closesAt:'2026-11-22T23:00:00.000Z',
    })),
});

describe('L06 identity/site/cycle scope (two-tenant synthetic adapter; no live RLS)', () => {
    it('resolves worker ID only from authenticated user-linked account and never authorizes submission', async () => {
        const port=validPort();
        const result=await resolveL06WorkerScope(principalA,reqA,port,NOW);
        expect(result.ok).toBe(true);
        if(!result.ok)return;
        expect(result.scope).toEqual({userId:USER_A,tenantId:TENANT_A,siteId:SITE_A,cycleId:CYCLE_A,workerId:WORKER_A});
        expect(result.checkedFor).toBe('identity-site-cycle-only');
        expect(result.submissionAuthorized).toBe(false);
        expect(port.linkedAccountsForVerifiedUser).toHaveBeenCalledWith(USER_A);
    });
    it('rejects an absent, invalid, expired or forged session before ANY DB read', async () => {
        for(const principal of [null,{userId:'bogus',sessionExpiresAt:principalA.sessionExpiresAt},
            {userId:USER_A,sessionExpiresAt:'2026-11-22T02:00:00.000Z'},
            {userId:USER_A,sessionExpiresAt:'2026-11-22T03:30:00.000Z'}]) {
            const port=validPort();
            const result=await resolveL06WorkerScope(principal,reqA,port,NOW);
            expect(result).toMatchObject({ok:false,code:'AUTH_INVALID',submissionAuthorized:false});
            expect(port.linkedAccountsForVerifiedUser).not.toHaveBeenCalled();
        }
    });
    it('rejects invalid tenant/site/cycle selectors before DB access',async()=>{
        for(const selection of [{...reqA,tenantId:'?'},{...reqA,siteId:'?'},{...reqA,cycleId:''}]) {
            const port=validPort();
            const result=await resolveL06WorkerScope(principalA,selection,port,NOW);
            expect(result).toMatchObject({ok:false,code:'SELECTION_INVALID'});
            expect(port.linkedAccountsForVerifiedUser).not.toHaveBeenCalled();
        }
    });
    it('rejects tenant A worker requesting tenant B even when a site/cycle B selector is valid',async()=>{
        const port=validPort();
        const result=await resolveL06WorkerScope(principalA,{tenantId:TENANT_B,siteId:SITE_B,cycleId:CYCLE_B},port,NOW);
        expect(result).toMatchObject({ok:false,code:'NO_WORKER_LINK'});
        expect(port.activeWorker).not.toHaveBeenCalled();
    });
    it('rejects cross-site access within tenant A, before reading site or cycle',async()=>{
        const port=validPort();
        const result=await resolveL06WorkerScope(principalA,{...reqA,siteId:SITE_B},port,NOW);
        expect(result).toMatchObject({ok:false,code:'SITE_NOT_ASSIGNED'});
        expect(port.site).not.toHaveBeenCalled();
        expect(port.assessmentCycle).not.toHaveBeenCalled();
    });
    it('keeps worker A and B identities separate even with both user accounts present',async()=>{
        const port=validPort();
        port.linkedAccountsForVerifiedUser=vi.fn(async userId=>[
            {userId:USER_A,tenantId:TENANT_A,workerId:WORKER_A,active:true},
            {userId:USER_B,tenantId:TENANT_A,workerId:WORKER_B,active:true},
        ]);
        expect(await resolveL06WorkerScope(principalA,reqA,port,NOW))
            .toMatchObject({ok:false,code:'SOURCE_UNAVAILABLE'});
    });
    it('rejects ambiguous active linked accounts for the same tenant',async()=>{
        const port=validPort();
        port.linkedAccountsForVerifiedUser=vi.fn(async userId=>[
            {userId,tenantId:TENANT_A,workerId:WORKER_A,active:true},
            {userId,tenantId:TENANT_A,workerId:WORKER_B,active:true},
        ]);
        expect(await resolveL06WorkerScope(principalA,reqA,port,NOW))
            .toMatchObject({ok:false,code:'NO_WORKER_LINK'});
    });
    it('requires active worker, assignment and actual site separately',async()=>{
        const port=validPort();
        port.activeWorker=vi.fn(async(tenantId,workerId)=>({tenantId,workerId,active:false}));
        expect(await resolveL06WorkerScope(principalA,reqA,port,NOW))
            .toMatchObject({ok:false,code:'WORKER_NOT_ACTIVE'});
        const port2=validPort();
        port2.workerSiteAssignments=vi.fn(async(tenantId,workerId)=>[{tenantId,workerId,siteId:SITE_A,active:false}]);
        expect(await resolveL06WorkerScope(principalA,reqA,port2,NOW))
            .toMatchObject({ok:false,code:'SITE_NOT_ASSIGNED'});
        const port3=validPort();
        port3.site=vi.fn(async(tenantId,siteId)=>({tenantId,siteId,active:false}));
        expect(await resolveL06WorkerScope(principalA,reqA,port3,NOW))
            .toMatchObject({ok:false,code:'SITE_NOT_ACTIVE'});
    });
    it('rejects closed, future, expired and mismatched assessment cycles',async()=>{
        for(const cycle of [
            {status:'closed',opensAt:'2026-11-22T01:00:00.000Z',closesAt:'2026-11-22T23:00:00.000Z'},
            {status:'open',opensAt:'2026-11-22T04:00:00.000Z',closesAt:'2026-11-22T23:00:00.000Z'},
            {status:'open',opensAt:'2026-11-22T01:00:00.000Z',closesAt:'2026-11-22T03:00:00.000Z'},
            {status:'open',opensAt:'2026-02-31T00:00:00.000Z',closesAt:'2026-11-22T23:00:00.000Z'},
        ]) {
            const port=validPort();
            port.assessmentCycle=vi.fn(async(tenantId,siteId,cycleId)=>({tenantId,siteId,cycleId,...cycle}));
            expect(await resolveL06WorkerScope(principalA,reqA,port,NOW))
                .toMatchObject({ok:false,code:'CYCLE_NOT_OPEN'});
        }
        const port=validPort();
        port.assessmentCycle=vi.fn(async(tenantId,siteId)=>({tenantId,siteId,cycleId:CYCLE_B,
            status:'open',opensAt:'2026-11-22T01:00:00.000Z',closesAt:'2026-11-22T23:00:00.000Z'}));
        expect(await resolveL06WorkerScope(principalA,reqA,port,NOW))
            .toMatchObject({ok:false,code:'CYCLE_NOT_OPEN'});
    });
    it('fails closed on missing schema, malformed DB results and backend errors',async()=>{
        const port=validPort();
        port.workerSiteAssignments=vi.fn(async()=>{throw new Error('42P01: missing table');});
        expect(await resolveL06WorkerScope(principalA,reqA,port,NOW))
            .toMatchObject({ok:false,code:'SOURCE_UNAVAILABLE'});
        const port2=validPort();
        port2.linkedAccountsForVerifiedUser=vi.fn(async()=>null);
        expect(await resolveL06WorkerScope(principalA,reqA,port2,NOW))
            .toMatchObject({ok:false,code:'SOURCE_UNAVAILABLE'});
        const port3=validPort();
        port3.workerSiteAssignments=vi.fn(async()=>[{tenantId:TENANT_B,workerId:WORKER_A,siteId:SITE_A,active:true}]);
        expect(await resolveL06WorkerScope(principalA,reqA,port3,NOW))
            .toMatchObject({ok:false,code:'SOURCE_UNAVAILABLE'});
    });
    it('cannot introduce a live endpoint, service-role client, or worker PII from this contract',()=>{
        const source=readFileSync(resolve(process.cwd(),'lib/server/workerRiskScopeL06.ts'),'utf8');
        const route=readFileSync(resolve(process.cwd(),'api/saas/access.ts'),'utf8');
        expect(source).not.toMatch(/\bfetch\s*\(|createClient\s*\(|service.role|service_role|process\.env|supabase/);
        expect(route).not.toContain("resource === 'worker-risk-submissions'");
        expect(route).not.toContain("resource === 'worker-risk-scope'");
        expect(source).toContain('submissionAuthorized: false');
    });
});
