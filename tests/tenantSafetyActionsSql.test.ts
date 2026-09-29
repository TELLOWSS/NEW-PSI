import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const companyA = 'b9300000-0000-4000-8000-000000000001';
const companyB = 'b9300000-0000-4000-8000-000000000002';
const ownerA = 'a9300000-0000-4000-8000-000000000001';
const ownerB = 'a9300000-0000-4000-8000-000000000002';
const reviewer = 'a9300000-0000-4000-8000-000000000003';
const viewer = 'a9300000-0000-4000-8000-000000000004';
let db: PGlite;
let actionA: string;
let actionB: string;

const asUser = async (id: string) => {
    await db.exec('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
};
const expectDenied = async (sql: string, values: unknown[] = []) => {
    await db.exec('savepoint denied_write');
    await expect(db.query(sql, values)).rejects.toBeDefined();
    await db.exec('rollback to savepoint denied_write; release savepoint denied_write');
};
const insert = async (company: string) => {
    const result = await db.query<{ id: string }>(`insert into public.psi_tenant_actions(tenant_id,title,site_name,description)
        values($1,'Guardrail repair','Test site','Repair the missing protective guardrail') returning id`, [company]);
    return result.rows[0].id;
};
const change = (status: string, note = '') => db.query('update public.psi_tenant_actions set status=$1,verification_note=$2 where tenant_id=$3 and id=$4 returning revision', [status, note, companyA, actionA]);

beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth; create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    for (const file of ['20260929000000_tenant_identity_foundation.sql', '20260930000000_tenant_safety_actions.sql']) {
        await db.exec(await readFile(resolve('supabase/migrations', file), 'utf8'));
    }
}, 30_000);
beforeEach(async () => {
    await db.exec('begin');
    await db.query('insert into auth.users(id) values($1),($2),($3),($4)', [ownerA, ownerB, reviewer, viewer]);
    await db.query("insert into public.psi_tenants(id,name) values($1,'Company A'),($2,'Company B')", [companyA, companyB]);
    await db.query(`insert into public.psi_tenant_memberships(tenant_id,user_id,role) values
        ($1,$3,'owner'),($2,$4,'owner'),($1,$5,'reviewer'),($1,$6,'viewer')`, [companyA,companyB,ownerA,ownerB,reviewer,viewer]);
    await asUser(ownerA); actionA = await insert(companyA);
    await asUser(ownerB); actionB = await insert(companyB);
    await asUser(ownerA);
});
afterEach(async () => { await db.exec('rollback'); });
afterAll(async () => { await db.close(); });

describe('real PostgreSQL safety-action isolation and workflow', () => {
    it('isolates both directions, including revisions and verification history', async () => {
        for (const [user, own, foreign] of [[ownerA,actionA,actionB],[ownerB,actionB,actionA]]) {
            await asUser(user);
            expect((await db.query('select id from public.psi_tenant_actions')).rows).toEqual([{id:own}]);
            expect((await db.query('select action_id from public.psi_tenant_action_events')).rows).toEqual([{action_id:own}]);
            expect((await db.query('update public.psi_tenant_actions set title=$1 where id=$2 returning id', ['Attack',foreign])).rows).toHaveLength(0);
        }
        await expectDenied('insert into public.psi_tenant_actions(tenant_id,title,site_name,description) values($1,$2,$2,$2)', [companyA,'Foreign insert']);
    });
    it('rejects anonymous access and a viewer write while permitting viewer reads', async () => {
        await asUser(viewer);
        expect((await db.query('select id from public.psi_tenant_actions')).rows).toHaveLength(1);
        expect((await change('in-progress')).rows).toHaveLength(0);
        await expectDenied('insert into public.psi_tenant_actions(tenant_id,title,site_name,description) values($1,$2,$2,$2)', [companyA,'Viewer insert']);
        await db.exec('set local role anon');
        await expectDenied('select * from public.psi_tenant_actions');
        await expectDenied('select * from public.psi_tenant_action_events');
    });
    it('requires manager verification with evidence and records the verified actor atomically', async () => {
        await asUser(reviewer);
        await change('in-progress'); await change('review-requested');
        await expectDenied('update public.psi_tenant_actions set status=$1,verification_note=$2 where id=$3', ['closed','Reviewer cannot approve',actionA]);
        await asUser(ownerA);
        await expectDenied('update public.psi_tenant_actions set status=$1,verification_note=$2 where id=$3', ['closed','',actionA]);
        await change('closed','Guardrail checked on site');
        const events=await db.query<{actor_id:string,to_status:string,action_revision:number}>('select actor_id,to_status,action_revision from public.psi_tenant_action_events order by action_revision');
        expect(events.rows.map(row=>row.to_status)).toEqual(['open','in-progress','review-requested','closed']);
        expect(events.rows[1].actor_id).toBe(reviewer);
        expect(events.rows[3]).toMatchObject({actor_id:ownerA,action_revision:4});
    });
    it('blocks shortcuts and locks completed records until an administrator reopens with a reason', async () => {
        await expectDenied('update public.psi_tenant_actions set status=$1,verification_note=$2 where id=$3', ['closed','Skip required review',actionA]);
        await change('review-requested'); await change('closed','Site verification complete');
        await expectDenied('update public.psi_tenant_actions set title=$1 where id=$2', ['Change evidence',actionA]);
        await asUser(reviewer);
        await expectDenied('update public.psi_tenant_actions set status=$1,verification_note=$2 where id=$3', ['open','Reviewer reopens',actionA]);
        await asUser(ownerA);
        await expectDenied('update public.psi_tenant_actions set status=$1,verification_note=$2 where id=$3', ['open','',actionA]);
        await change('open','Additional repair needed');
        expect((await db.query('select status,revision from public.psi_tenant_actions')).rows[0]).toMatchObject({status:'open',revision:4});
    });
    it('prevents identity/actor/revision tampering and audit forgery or deletion', async () => {
        for (const statement of [
            "update public.psi_tenant_actions set tenant_id='"+companyB+"'",
            'update public.psi_tenant_actions set revision=99',
            "update public.psi_tenant_actions set updated_by='"+ownerB+"'",
            'delete from public.psi_tenant_actions',
            'delete from public.psi_tenant_action_events',
            "update public.psi_tenant_action_events set verification_note='Forged evidence'",
            "insert into public.psi_tenant_action_events(tenant_id,action_id,action_revision,actor_id,to_status,verification_note) values('"+companyA+"','"+actionA+"',10,'"+ownerA+"','closed','Fake')",
        ]) await expectDenied(statement);
        expect((await db.query('select revision from public.psi_tenant_actions')).rows[0]).toMatchObject({revision:1});
    });
    it('enforces compound foreign keys even for trusted SQL and forbids cross-company event links', async () => {
        await db.exec('reset role');
        await expectDenied(`insert into public.psi_tenant_action_events(tenant_id,action_id,action_revision,actor_id,to_status,verification_note)
            values($1,$2,2,$3,'closed','Foreign record')`, [companyA,actionB,ownerA]);
    });
    it('revokes reads and writes on the next statement when membership is suspended', async () => {
        await db.exec('reset role');
        await db.query("update public.psi_tenant_memberships set status='suspended' where tenant_id=$1 and user_id=$2",[companyA,ownerA]);
        await asUser(ownerA);
        expect((await db.query('select id from public.psi_tenant_actions')).rows).toHaveLength(0);
        expect((await db.query('select id from public.psi_tenant_action_events')).rows).toHaveLength(0);
        expect((await change('in-progress')).rows).toHaveLength(0);
    });
    it('uses optimistic revisions without overwriting a newer change or adding a false audit event', async () => {
        await change('in-progress');
        expect((await db.query('update public.psi_tenant_actions set title=$1 where id=$2 and revision=1 returning id',['Stale write',actionA])).rows).toHaveLength(0);
        expect((await db.query('select action_revision from public.psi_tenant_action_events order by action_revision')).rows).toEqual([{action_revision:1},{action_revision:2}]);
    });
    it('enforces idempotency per company and records only one successful creation', async () => {
        const requestId='d9300000-0000-4000-8000-000000000001';
        await db.query('insert into public.psi_tenant_actions(tenant_id,request_id,title,site_name,description) values($1,$2,$3,$3,$3)',[companyA,requestId,'Idempotent']);
        await expectDenied('insert into public.psi_tenant_actions(tenant_id,request_id,title,site_name,description) values($1,$2,$3,$3,$3)',[companyA,requestId,'Duplicate']);
        expect((await db.query('select id from public.psi_tenant_actions')).rows).toHaveLength(2);
        await asUser(ownerB);
        await db.query('insert into public.psi_tenant_actions(tenant_id,request_id,title,site_name,description) values($1,$2,$3,$3,$3)',[companyB,requestId,'Same request in B']);
        expect((await db.query('select id from public.psi_tenant_actions')).rows).toHaveLength(2);
    });
    it('rolls back an action change when the audit append fails', async () => {
        await db.exec('reset role; alter table public.psi_tenant_action_events add constraint synthetic_audit_failure check(action_revision <> 2)');
        await asUser(ownerA);
        await expectDenied('update public.psi_tenant_actions set status=$1 where id=$2',['in-progress',actionA]);
        expect((await db.query('select status,revision from public.psi_tenant_actions')).rows[0]).toMatchObject({status:'open',revision:1});
    });
});
