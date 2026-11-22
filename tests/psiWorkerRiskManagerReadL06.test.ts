import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspectL06ManagerRevisionRead, type L06ManagerRevisionReadPort } from '../lib/server/workerRiskManagerReadL06';

// Fictional IDs and work text. Never connect these source-only tests to real Auth/DB.
const tenant='96060000-0000-4000-8000-000000000001';
const tenantOther='96060000-0000-4000-8000-000000000002';
const site='96061000-0000-4000-8000-000000000001';
const siteOther='96061000-0000-4000-8000-000000000002';
const actor='96064000-0000-4000-8000-000000000003';
const worker='96064000-0000-4000-8000-000000000001';
const session='96067000-0000-4000-8000-000000000001';
const parent='96068000-0000-4000-8000-000000000001';
const child='96068000-0000-4000-8000-000000000002';
const now = new Date('2026-11-22T12:00:00.000Z');
const principal = {userId:actor,sessionId:session,expiresAt:'2026-11-22T13:00:00.000Z'};
const request = {tenantId:tenant,siteId:site,originalSubmissionId:parent};
const answers = {Q1:'2001동 갱폼 인상',Q2:'단부 난간 미설치 추락 위험',Q3:'상',
    Q4:'단부 안전난간 설치 후 작업',Q5:'작업 전 관리자와 점검'};
const reviewNote='추락위험 구간의 난간 설치와 고정점 확인을 추가 기재하세요.';
const record = (id:string, receivedAt:string, changes:{[key:string]:unknown}={})=>({
    schema:'psi-worker-risk-manager-review-v1',tenantId:tenant,siteId:site,
    submissionId:id,workerId:worker,formVersion:'psi-form-master-2026-11-22-v2-legacy-compatible',sourceLanguage:'ko',
    selfRiskGrade:'상',gradeReason:'단부 추락 위험',receivedAt,answers,
    events:[],workClearanceGranted:false,...changes,
});
const chain = ()=>({
    schema:'psi-worker-risk-revision-chain-v1',workClearanceGranted:false,
    linkedAt:'2026-11-22T11:08:00.000Z',
    original:record(parent,'2026-11-22T11:00:00.000Z',{
        events:[{revision:1,action:'request_changes',note:reviewNote,
            reviewerId:actor,recordedAt:'2026-11-22T11:04:00.000Z'}],
    }),
    replacement:record(child,'2026-11-22T11:07:00.000Z',{answers:{...answers,Q4:'난간 설치 확인 후 안전고리 체결'}}),
});
const makePort = (snapshot:unknown=chain()) => {
    const calls: string[]=[];
    const port: L06ManagerRevisionReadPort={
        activeSession:async()=>{calls.push('session');return {userId:actor,sessionId:session,expiresAt:principal.expiresAt,active:true};},
        membership:async()=>{calls.push('membership');return {tenantId:tenant,userId:actor,status:'active',role:'reviewer'};},
        siteMembership:async()=>{calls.push('siteMembership');return {tenantId:tenant,siteId:site,userId:actor,status:'active'};},
        site:async()=>{calls.push('site');return {tenantId:tenant,siteId:site,active:true};},
        authorizedRevisionChain:async()=>{calls.push('chain');return snapshot;},
    };
    return {calls,port};
};
const clone = <T>(v:T):T=>JSON.parse(JSON.stringify(v));
const read = async(port:L06ManagerRevisionReadPort,who=principal,scope=request,
    clock:()=>Date=()=>now)=>
    inspectL06ManagerRevisionRead(who,scope,port,clock);

describe('L06 manager Q1-Q5 revision read, fail-closed SOURCE-ONLY server adapter',()=>{
    it('releases source evidence only after server session, tenant role, site and scoped SQL read',async()=>{
        const {calls,port}=makePort();
        const result=await read(port);
        expect(result).toMatchObject({ok:true,dataReleased:true,
            verification:'isolated-adapter-contract-only',workClearanceGranted:false});
        expect(calls).toEqual(['session','membership','siteMembership','site','chain',
            'session','membership','siteMembership','site']);
        if(result.ok) {
            expect(result.evidence.original).toMatchObject({submissionId:parent,workerId:worker});
            expect(result.evidence.replacement).toMatchObject({submissionId:child,workerId:worker});
        }
    });
    it('stops before any port call for expired/untrusted session and forged query scope',async()=>{
        for(const who of [
            null,{...principal,userId:worker,sessionId:'bad'},
            {...principal,expiresAt:'2026-11-22T11:59:59.000Z'},
            {...principal,expiresAt:'invalid'}
        ]){
            const {calls,port}=makePort();
            expect(await inspectL06ManagerRevisionRead(who,request,port,()=>now))
                .toEqual({ok:false,code:'SESSION_INVALID',dataReleased:false});
            expect(calls).toHaveLength(0);
        }
        for(const scope of [{...request,tenantId:'bad'}, {...request,siteId:'bad'},
            {...request,originalSubmissionId:'not-a-uuid'}]){
            const {calls,port}=makePort();
            expect(await read(port,principal,scope)).toEqual({ok:false,code:'SCOPE_INVALID',dataReleased:false});
            expect(calls).toHaveLength(0);
        }
    });
    it('requires a CURRENT server-confirmed session, not just a syntactically valid JWT',async()=>{
        for(const sessionRecord of [
            null,{userId:actor,sessionId:session,expiresAt:principal.expiresAt,active:false},
            {userId:worker,sessionId:session,expiresAt:principal.expiresAt,active:true},
            {userId:actor,sessionId:session,expiresAt:'2026-11-22T11:00:00.000Z',active:true},
        ]){
            const {port,calls}=makePort();
            port.activeSession=async()=>{calls.push('session');return sessionRecord;};
            expect(await read(port)).toEqual({ok:false,code:'SESSION_INVALID',dataReleased:false});
            expect(calls).toEqual(['session']);
        }
    });
    it('rejects suspended, absent or worker-role tenant membership before reading any Q1-Q5',async()=>{
        for(const membership of [
            null,{tenantId:tenantOther,userId:actor,status:'active',role:'owner'},
            {tenantId:tenant,userId:actor,status:'suspended',role:'reviewer'},
            {tenantId:tenant,userId:actor,status:'active',role:'worker'},
        ]){
            const {port,calls}=makePort();
            port.membership=async()=>{calls.push('membership');return membership;};
            expect(await read(port)).toEqual({ok:false,code:'MANAGER_NOT_AUTHORIZED',dataReleased:false});
            expect(calls).toEqual(['session','membership']);
        }
    });
    it('rejects a disabled site, missing assignment, cross-company or revoked site membership',async()=>{
        for(const member of [
            null,{tenantId:tenantOther,siteId:site,userId:actor,status:'active'},
            {tenantId:tenant,siteId:siteOther,userId:actor,status:'active'},
            {tenantId:tenant,siteId:site,userId:actor,status:'suspended'}
        ]){
            const {port,calls}=makePort();
            port.siteMembership=async()=>{calls.push('siteMembership');return member;};
            expect(await read(port)).toEqual({ok:false,code:'SITE_NOT_AUTHORIZED',dataReleased:false});
            expect(calls).not.toContain('chain');
        }
        const {port,calls}=makePort();
        port.site=async()=>{calls.push('site');return {tenantId:tenant,siteId:site,active:false};};
        expect(await read(port)).toEqual({ok:false,code:'SITE_NOT_AUTHORIZED',dataReleased:false});
        expect(calls).not.toContain('chain');
    });
    it('rejects cross-tenant, cross-site, cross-worker, another original and client-authorized clearance',async()=>{
        const cases=[
            (s:any)=>{s.original.tenantId=tenantOther;},
            (s:any)=>{s.replacement.tenantId=tenantOther;},
            (s:any)=>{s.replacement.siteId=siteOther;},
            (s:any)=>{s.replacement.workerId='96064000-0000-4000-8000-000000000002';},
            (s:any)=>{s.original.submissionId=child;},
            (s:any)=>{s.replacement.submissionId=parent;},
            (s:any)=>{s.workClearanceGranted=true;},
            (s:any)=>{s.original.workClearanceGranted=true;},
            (s:any)=>{s.original.workerId=actor;},
            (s:any)=>{s.original.name='PRIVATE-WORKER-NAME';},
            (s:any)=>{s.original.events[0].email='hidden@example.invalid';},
            (s:any)=>{s.replacement.accessToken='never expose';},
        ];
        for(const change of cases){
            const c=clone(chain());change(c);
            const {port}=makePort(c);
            const result=await read(port);
            expect(result).toEqual({ok:false,code:'EVIDENCE_UNAVAILABLE',dataReleased:false});
            expect('evidence' in result).toBe(false);
        }
    });
    it('rejects forged original review state and incomplete/malformed original or replacement Q1-Q5',async()=>{
        const cases=[
            (s:any)=>{s.original.events=[];},
            (s:any)=>{s.original.events[0].action='approved';},
            (s:any)=>{s.original.events[0].note='bad';},
            (s:any)=>{s.replacement.events=[{revision:1,action:'approved',note:reviewNote}];},
            (s:any)=>{s.replacement.answers.Q5='';},
            (s:any)=>{s.original.answers.Q3='중';},
            (s:any)=>{s.original.answers.Q6='악성 추가';},
            (s:any)=>{s.original.selfRiskGrade='최상';},
            (s:any)=>{s.original.receivedAt='invalid';},
            (s:any)=>{s.replacement.sourceLanguage='invalid';},
            (s:any)=>{s.original.formVersion='untrusted-form-version';},
            (s:any)=>{s.original.events[0].reviewerId='invalid-user';},
            (s:any)=>{s.original.events[0].recordedAt='bad';},
            (s:any)=>{s.replacement.events=[{revision:1,action:'reviewed',note:reviewNote,
                reviewerId:actor,recordedAt:'2026-11-22T11:09:00.000Z'},
                {revision:2,action:'approved',note:reviewNote,reviewerId:actor,
                recordedAt:'2026-11-22T11:10:00.000Z'}];},
        ];
        for(const change of cases){
            const c=clone(chain());change(c);
            const {port}=makePort(c);
            expect(await read(port)).toEqual({ok:false,code:'EVIDENCE_UNAVAILABLE',dataReleased:false});
        }
    });
    it('rejects a stale/false time chain and never returns partial originals on read failure',async()=>{
        const cases=[
            (s:any)=>{s.replacement.receivedAt='2026-11-22T10:59:00.000Z';},
            (s:any)=>{s.linkedAt='2026-11-22T11:01:00.000Z';},
            (s:any)=>{s.linkedAt='not-an-ISO-date';},
            (s:any)=>{s.original.events[0].recordedAt='2026-11-22T10:58:00.000Z';},
            (s:any)=>{s.original.events[0].recordedAt='2026-11-22T11:08:00.000Z';},
        ];
        for(const change of cases){
            const c=clone(chain());change(c);
            const {port}=makePort(c);
            expect(await read(port)).toEqual({ok:false,code:'EVIDENCE_UNAVAILABLE',dataReleased:false});
        }
        const {port}=makePort();
        port.authorizedRevisionChain=async()=>{throw new Error('private database error');};
        expect(await read(port)).toEqual({ok:false,code:'EVIDENCE_UNAVAILABLE',dataReleased:false});
    });
    it('rejects a session revoked during a slow manager read without releasing Q1-Q5',async()=>{
        let active=true;
        const {port,calls}=makePort();
        port.activeSession=async()=>{calls.push('session');return {
            userId:actor,sessionId:session,active,expiresAt:principal.expiresAt,
        };};
        port.authorizedRevisionChain=async()=>{calls.push('chain');active=false;return chain();};
        const result=await read(port);
        expect(result).toEqual({ok:false,code:'SESSION_INVALID',dataReleased:false});
        expect('evidence' in result).toBe(false);
        expect(calls).toEqual(['session','membership','siteMembership','site','chain','session']);
    });
    it('rejects tenant role or site assignment withdrawn mid-read (TOCTOU defense)',async()=>{
        for(const revoke of ['membership','siteMembership','site'] as const){
            let current=true;
            const {port,calls}=makePort();
            port.authorizedRevisionChain=async()=>{calls.push('chain');current=false;return chain();};
            if(revoke==='membership') port.membership=async()=>{
                calls.push('membership');
                return {tenantId:tenant,userId:actor,status:current?'active':'suspended',role:'reviewer'};
            };
            if(revoke==='siteMembership') port.siteMembership=async()=>{
                calls.push('siteMembership');
                return {tenantId:tenant,siteId:site,userId:actor,status:current?'active':'suspended'};
            };
            if(revoke==='site') port.site=async()=>{
                calls.push('site');
                return {tenantId:tenant,siteId:site,active:current};
            };
            const result=await read(port);
            expect(result).toEqual({ok:false,code:revoke==='membership'
                ?'MANAGER_NOT_AUTHORIZED':'SITE_NOT_AUTHORIZED',dataReleased:false});
            expect('evidence' in result).toBe(false);
            expect(calls).toContain('chain');
        }
    });
    it('re-samples trusted server time and blocks expiry, clock rollback or clock failure',async()=>{
        for(const later of [
            '2026-11-22T13:00:00.000Z','2026-11-22T11:59:59.000Z',null,
        ]){
            let samples=0;
            const clock=()=>{samples++;
                if(samples===1) return now;
                if(later===null) throw new Error('trusted clock unavailable');
                return new Date(later);
            };
            const {port}=makePort();
            const result=await read(port,principal,request,clock);
            expect(result).toMatchObject({ok:false,dataReleased:false});
            expect('evidence' in result).toBe(false);
            expect(samples).toBe(2);
        }
        const {port}=makePort();
        const result=await read(port,principal,request,()=>new Date('invalid'));
        expect(result).toEqual({ok:false,code:'SESSION_INVALID',dataReleased:false});
    });
    it('refuses a final-session recheck fault without releasing partial evidence',async()=>{
        let attempts=0;
        const {port}=makePort();
        port.activeSession=async()=>{
            attempts++;
            if(attempts===2) throw new Error('test database connection interrupted');
            return {userId:actor,sessionId:session,expiresAt:principal.expiresAt,active:true};
        };
        const result=await read(port);
        expect(result).toEqual({ok:false,code:'EVIDENCE_UNAVAILABLE',dataReleased:false});
        expect('evidence' in result).toBe(false);
    });
    it('never exposes a live endpoint, service role, browser secrets or automatic work clearance',()=>{
        const source=readFileSync(resolve('lib/server/workerRiskManagerReadL06.ts'),'utf8');
        expect(source).not.toMatch(/\bfetch\s*\(|createClient\s*\(|service_role\s*:\s*|process\.env|localStorage|XMLHttpRequest/);
        expect(source).not.toMatch(/approved\s*:\s*true|workClearanceGranted\s*:\s*true/);
        expect(source).toContain("verification:'isolated-adapter-contract-only'");
    });
});
