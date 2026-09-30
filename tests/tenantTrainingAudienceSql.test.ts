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
    const result = await db.query<{ id: string }>(`insert into public.psi_tenant_workers(tenant_id,name,worker_code,trade)
        values($1,'Guardrail repair','Test site','Repair the missing protective guardrail') returning id`, [company]);
    return result.rows[0].id;
};
const change = (name: string) => db.query('update public.psi_tenant_workers set name=$1 where tenant_id=$2 and id=$3 returning revision', [name, companyA, actionA]);

beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth; create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    for (const file of ['20260929000000_tenant_identity_foundation.sql', '20260930010000_tenant_training_drafts.sql', '20260930020000_tenant_training_audience.sql']) {
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

describe('real PostgreSQL worker registry and target isolation', () => {
    it('isolates both directions, including revisions and verification history', async () => {
        for (const [user, own, foreign] of [[ownerA,actionA,actionB],[ownerB,actionB,actionA]]) {
            await asUser(user);
            expect((await db.query('select id from public.psi_tenant_workers')).rows).toEqual([{id:own}]);
            expect((await db.query('select worker_id from public.psi_tenant_worker_events')).rows).toEqual([{worker_id:own}]);
            expect((await db.query('update public.psi_tenant_workers set name=$1 where id=$2 returning id', ['Attack',foreign])).rows).toHaveLength(0);
        }
        await expectDenied('insert into public.psi_tenant_workers(tenant_id,name,worker_code,trade) values($1,$2,$2,$2)', [companyA,'Foreign insert']);
    });
    it('rejects anonymous access and a viewer write while permitting viewer reads', async () => {
        await asUser(viewer);
        expect((await db.query('select id from public.psi_tenant_workers')).rows).toHaveLength(1);
        expect((await change('in-progress')).rows).toHaveLength(0);
        await expectDenied('insert into public.psi_tenant_workers(tenant_id,name,worker_code,trade) values($1,$2,$2,$2)', [companyA,'Viewer insert']);
        await db.exec('set local role anon');
        await expectDenied('select * from public.psi_tenant_workers');
        await expectDenied('select * from public.psi_tenant_worker_events');
    });
    it('keeps reviewers read-only for the registry but permits an administrator to edit', async () => {
        await asUser(reviewer);
        expect((await change('Reviewer attack')).rows).toHaveLength(0);
        await expectDenied('insert into public.psi_tenant_workers(tenant_id,name,worker_code,trade) values($1,$2,$2,$2)', [companyA,'Reviewer attack']);
        await db.exec('reset role');
        await db.query("update public.psi_tenant_memberships set role='admin' where user_id=$1", [reviewer]);
        await asUser(reviewer); await change('Admin update');
        expect((await db.query('select name,worker_revision,actor_id from public.psi_tenant_worker_events order by worker_revision')).rows).toEqual([
            {name:'Guardrail repair',worker_revision:1,actor_id:ownerA}, {name:'Admin update',worker_revision:2,actor_id:reviewer}]);
    });
    it('prevents identity/actor/revision tampering and audit forgery or deletion', async () => {
        for (const statement of [
            "update public.psi_tenant_workers set tenant_id='"+companyB+"'",
            'update public.psi_tenant_workers set revision=99',
            "update public.psi_tenant_workers set worker_code='Changed identity'",
            "update public.psi_tenant_workers set updated_by='"+ownerB+"'",
            'delete from public.psi_tenant_workers',
            'delete from public.psi_tenant_worker_events',
            "update public.psi_tenant_worker_events set name='Forged evidence'",
            "insert into public.psi_tenant_worker_events(tenant_id,worker_id,worker_revision,actor_id,name,worker_code,trade,active) values('"+companyA+"','"+actionA+"',10,'"+ownerA+"','Fake','Fake site','Fake body',true)",
        ]) await expectDenied(statement);
        expect((await db.query('select revision from public.psi_tenant_workers')).rows[0]).toMatchObject({revision:1});
    });
    it('enforces compound foreign keys even for trusted SQL and forbids cross-company event links', async () => {
        await db.exec('reset role');
        await expectDenied(`insert into public.psi_tenant_worker_events(tenant_id,worker_id,worker_revision,actor_id,name,worker_code,trade,active)
            values($1,$2,2,$3,'Foreign record','Site','Body',true)`, [companyA,actionB,ownerA]);
    });
    it('revokes reads and writes on the next statement when membership is suspended', async () => {
        await db.exec('reset role');
        await db.query("update public.psi_tenant_memberships set status='suspended' where tenant_id=$1 and user_id=$2",[companyA,ownerA]);
        await asUser(ownerA);
        expect((await db.query('select id from public.psi_tenant_workers')).rows).toHaveLength(0);
        expect((await db.query('select id from public.psi_tenant_worker_events')).rows).toHaveLength(0);
        expect((await change('in-progress')).rows).toHaveLength(0);
    });
    it('uses optimistic revisions without overwriting a newer change or adding a false audit event', async () => {
        await change('in-progress');
        expect((await db.query('update public.psi_tenant_workers set name=$1 where id=$2 and revision=1 returning id',['Stale write',actionA])).rows).toHaveLength(0);
        expect((await db.query('select worker_revision from public.psi_tenant_worker_events order by worker_revision')).rows).toEqual([{worker_revision:1},{worker_revision:2}]);
    });
    it('enforces idempotency per company and records only one successful creation', async () => {
        const requestId='d9300000-0000-4000-8000-000000000001';
        await db.query('insert into public.psi_tenant_workers(tenant_id,request_id,name,worker_code,trade) values($1,$2,$3,$3,$3)',[companyA,requestId,'Idempotent']);
        await expectDenied('insert into public.psi_tenant_workers(tenant_id,request_id,name,worker_code,trade) values($1,$2,$3,$3,$3)',[companyA,requestId,'Duplicate']);
        expect((await db.query('select id from public.psi_tenant_workers')).rows).toHaveLength(2);
        await asUser(ownerB);
        await db.query('insert into public.psi_tenant_workers(tenant_id,request_id,name,worker_code,trade) values($1,$2,$3,$3,$3)',[companyB,requestId,'Same request in B']);
        expect((await db.query('select id from public.psi_tenant_workers')).rows).toHaveLength(2);
    });
    it('rolls back a registry change when the audit append fails', async () => {
        await db.exec('reset role; alter table public.psi_tenant_worker_events add constraint synthetic_audit_failure check(worker_revision <> 2)');
        await asUser(ownerA);
        await expectDenied('update public.psi_tenant_workers set name=$1 where id=$2',['in-progress',actionA]);
        expect((await db.query('select name,revision from public.psi_tenant_workers')).rows[0]).toMatchObject({name:'Guardrail repair',revision:1});
    });
    it('links reviewer-selected active workers and snapshots IDs in the draft audit', async () => {
        await asUser(reviewer);
        const created = await db.query<{id:string}>(`insert into public.psi_tenant_training_drafts(tenant_id,title,site_name,source_text_ko,worker_ids)
          values($1,'Education','Site','Body',$2) returning id`,[companyA,[actionA]]);
        expect((await db.query('select worker_ids from public.psi_tenant_training_drafts where id=$1',[created.rows[0].id])).rows).toEqual([{worker_ids:[actionA]}]);
        expect((await db.query('select worker_ids from public.psi_tenant_training_draft_events where draft_id=$1',[created.rows[0].id])).rows).toEqual([{worker_ids:[actionA]}]);
    });
    it('rejects foreign, inactive, duplicated and absent workers without leaving a draft or audit', async () => {
        await db.query('update public.psi_tenant_workers set active=false where id=$1',[actionA]);
        for (const ids of [[actionB],[actionA],[actionB,actionB],['c9300000-0000-4000-8000-000000000099']]) {
            await expectDenied(`insert into public.psi_tenant_training_drafts(tenant_id,title,site_name,source_text_ko,worker_ids)
              values($1,'Education','Site','Body',$2)`,[companyA,ids]);
        }
        expect((await db.query('select id from public.psi_tenant_training_drafts')).rows).toHaveLength(0);
        expect((await db.query('select id from public.psi_tenant_training_draft_events')).rows).toHaveLength(0);
    });
    it('records target changes as new draft revisions and prevents stale overwrite', async () => {
        const draft = await db.query<{id:string}>(`insert into public.psi_tenant_training_drafts(tenant_id,title,site_name,source_text_ko)
          values($1,'Education','Site','Body') returning id`,[companyA]);
        await asUser(reviewer);
        await db.query('update public.psi_tenant_training_drafts set worker_ids=$1 where id=$2 and revision=1',[[actionA],draft.rows[0].id]);
        expect((await db.query('update public.psi_tenant_training_drafts set worker_ids=$1 where id=$2 and revision=1 returning id',[[],draft.rows[0].id])).rows).toHaveLength(0);
        expect((await db.query('select draft_revision,worker_ids from public.psi_tenant_training_draft_events order by draft_revision')).rows).toEqual([{draft_revision:1,worker_ids:[]},{draft_revision:2,worker_ids:[actionA]}]);
    });
    it('keeps company codes unique while permitting the same code in a different company', async () => {
        await expectDenied(`insert into public.psi_tenant_workers(tenant_id,name,worker_code,trade)
          values($1,'Other person','Test site','Other trade')`,[companyA]);
        await asUser(ownerB);
        expect((await db.query('select worker_code from public.psi_tenant_workers')).rows).toEqual([{worker_code:'Test site'}]);
    });
    it('allows removal of inactive targets but rejects keeping them while editing the draft', async () => {
        const draft=await db.query<{id:string}>(`insert into public.psi_tenant_training_drafts(tenant_id,title,site_name,source_text_ko,worker_ids)
          values($1,'Education','Site','Body',$2) returning id`,[companyA,[actionA]]);
        await db.query('update public.psi_tenant_workers set active=false where id=$1',[actionA]);
        await expectDenied('update public.psi_tenant_training_drafts set title=$1 where id=$2',['Edited',draft.rows[0].id]);
        await db.query('update public.psi_tenant_training_drafts set worker_ids=$1 where id=$2',[[],draft.rows[0].id]);
        expect((await db.query('select worker_ids,revision from public.psi_tenant_training_drafts')).rows).toEqual([{worker_ids:[],revision:2}]);
    });
    it('does not grant reviewers direct execution of target validation or audit functions', async () => {
        await asUser(reviewer);
        expect((await db.query("select has_function_privilege(current_user,'public.psi_validate_draft_workers()','EXECUTE') as allowed")).rows).toEqual([{allowed:false}]);
        expect((await db.query("select has_function_privilege(current_user,'public.psi_append_tenant_worker_event()','EXECUTE') as allowed")).rows).toEqual([{allowed:false}]);
    });

});
