import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';

const a='b9400000-0000-4000-8000-000000000001';
const b='b9400000-0000-4000-8000-000000000002';
const ua='a9400000-0000-4000-8000-000000000001';
const ub='a9400000-0000-4000-8000-000000000002';
const reviewer='a9400000-0000-4000-8000-000000000003';
const viewer='a9400000-0000-4000-8000-000000000004';
const wa='c9400000-0000-4000-8000-000000000001';
const wb='c9400000-0000-4000-8000-000000000002';
const ra='d9400000-0000-4000-8000-000000000001';
const rb='d9400000-0000-4000-8000-000000000002';
let db: PGlite;

async function asUser(user: string) {
  await db.exec('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
}
async function deny(sql:string, params:unknown[] = []) {
  await db.exec('savepoint rejected');
  await expect(db.query(sql,params)).rejects.toBeDefined();
  await db.exec('rollback to savepoint rejected; release savepoint rejected');
}
const createReceipt = (tenant:string,worker:string,request:string) =>
  db.query<{id:string;received_at:string;received_by:string;byte_size:number}>(
    "insert into public.psi_tenant_evidence_receipts (tenant_id,request_id,worker_id,source_kind,media_type,original_bytes) values($1,$2,$3,'worker_form','image/jpeg',decode('ffd8ff0001','hex')) returning id,received_at,received_by,byte_size",
    [tenant,request,worker]
  );

beforeAll(async()=>{
  db=new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;");
  await db.exec(await readFile(resolve('supabase/migrations/20260929000000_tenant_identity_foundation.sql'),'utf8'));
  // Dependency-compatible fixture only, never a substitute for real worker migration.
  await db.exec('create table public.psi_tenant_workers(tenant_id uuid not null references public.psi_tenants(id),id uuid not null,primary key(tenant_id,id));');
  await db.exec(await readFile(resolve('supabase/proposals/psi_tenant_evidence_receipts_staging.sql'),'utf8'));
},30000);
beforeEach(async()=>{
  await db.exec('begin');
  await db.query('insert into auth.users(id) values($1),($2),($3),($4)',[ua,ub,reviewer,viewer]);
  await db.query("insert into public.psi_tenants(id,name) values($1,'Company A'),($2,'Company B')",[a,b]);
  await db.query("insert into public.psi_tenant_memberships(tenant_id,user_id,role) values($1,$3,'owner'),($2,$4,'owner'),($1,$5,'reviewer'),($1,$6,'viewer')",[a,b,ua,ub,reviewer,viewer]);
  await db.query('insert into public.psi_tenant_workers(tenant_id,id) values($1,$3),($2,$4)',[a,b,wa,wb]);
});
afterEach(async()=>{await db.exec('rollback');});
afterAll(async()=>{await db.close();});

describe('new isolated tenant evidence receipt proposal',()=>{
  it('records receipt time at the DB and forbids clients from writing a backdated server timestamp',async()=>{
    await asUser(ua);
    const result=await createReceipt(a,wa,ra);
    expect(result.rows[0].byte_size).toBe(5);
    expect(result.rows[0].received_by).toBe(ua);
    expect(Number.isFinite(Date.parse(result.rows[0].received_at))).toBe(true);
    await deny("insert into public.psi_tenant_evidence_receipts(tenant_id,request_id,worker_id,source_kind,media_type,original_bytes,received_at) values($1,$2,$3,'worker_form','image/jpeg',decode('ffd8ff','hex'),'2025-01-01')",[a,rb,wa]);
  });
  it('rejects forged cross-tenant worker ownership and segregates both company records',async()=>{
    await asUser(ua);
    await createReceipt(a,wa,ra);
    await deny("insert into public.psi_tenant_evidence_receipts(tenant_id,request_id,worker_id,source_kind,media_type,original_bytes) values($1,$2,$3,'worker_form','image/jpeg',decode('ffd8ff','hex'))",[b,rb,wb]);
    await deny("insert into public.psi_tenant_evidence_receipts(tenant_id,request_id,worker_id,source_kind,media_type,original_bytes) values($1,$2,$3,'worker_form','image/jpeg',decode('ffd8ff','hex'))",[a,rb,wb]);
    await asUser(ub);
    expect((await db.query('select id from public.psi_tenant_evidence_receipts')).rows).toHaveLength(0);
    await createReceipt(b,wb,rb);
    expect((await db.query('select id from public.psi_tenant_evidence_receipts')).rows).toHaveLength(1);
  });
  it('denies viewer, anonymous and suspended member access',async()=>{
    await asUser(ua); await createReceipt(a,wa,ra);
    await asUser(viewer);
    expect((await db.query('select id from public.psi_tenant_evidence_receipts')).rows).toHaveLength(0);
    await deny("insert into public.psi_tenant_evidence_receipts(tenant_id,request_id,worker_id,source_kind,media_type,original_bytes) values($1,$2,$3,'worker_form','image/jpeg',decode('ffd8ff','hex'))",[a,rb,wa]);
    await db.exec('set local role anon');
    await deny('select id from public.psi_tenant_evidence_receipts');
    await asUser(reviewer);
    expect((await db.query('select id from public.psi_tenant_evidence_receipts')).rows).toHaveLength(1);
    await db.exec('reset role');
    await db.query("update public.psi_tenant_memberships set status='suspended' where tenant_id=$1 and user_id=$2",[a,reviewer]);
    await asUser(reviewer);
    expect((await db.query('select id from public.psi_tenant_evidence_receipts')).rows).toHaveLength(0);
  });
  it('blocks modification or deletion by RLS and by trigger even for a bypass-RLS database role',async()=>{
    await asUser(ua); const result=await createReceipt(a,wa,ra);
    // Authenticated users have no UPDATE/DELETE policies. SQL may return zero
    // affected rows instead of throwing, which is the correct RLS behavior.
    await db.exec('reset role');
    await db.exec('grant update,delete on public.psi_tenant_evidence_receipts to authenticated');
    await asUser(ua);
    const untouched=await db.query('update public.psi_tenant_evidence_receipts set source_kind=$1 where id=$2 returning id',['field_evidence',result.rows[0].id]);
    expect(untouched.rows).toHaveLength(0);
    const notDeleted=await db.query('delete from public.psi_tenant_evidence_receipts where id=$1 returning id',[result.rows[0].id]);
    expect(notDeleted.rows).toHaveLength(0);
    expect((await db.query('select id from public.psi_tenant_evidence_receipts')).rows).toHaveLength(1);

    // A privileged role bypasses RLS, but the append-only triggers still apply.
    await db.exec('reset role');
    await db.exec('grant select,update,delete on public.psi_tenant_evidence_receipts to service_role');
    await db.exec('set local role service_role');
    await deny('update public.psi_tenant_evidence_receipts set source_kind=$1 where id=$2',['field_evidence',result.rows[0].id]);
    await deny('delete from public.psi_tenant_evidence_receipts where id=$1',[result.rows[0].id]);
  });
  it('rejects replayed request IDs, invalid media type and oversize file',async()=>{
    await asUser(ua);await createReceipt(a,wa,ra);
    await deny("insert into public.psi_tenant_evidence_receipts(tenant_id,request_id,worker_id,source_kind,media_type,original_bytes) values($1,$2,$3,'worker_form','image/jpeg',decode('ffd8ff','hex'))",[a,ra,wa]);
    await deny("insert into public.psi_tenant_evidence_receipts(tenant_id,request_id,worker_id,source_kind,media_type,original_bytes) values($1,$2,$3,'worker_form','text/html',decode('ffd8ff','hex'))",[a,rb,wa]);
    await deny("insert into public.psi_tenant_evidence_receipts(tenant_id,request_id,worker_id,source_kind,media_type,original_bytes) values($1,$2,$3,'worker_form','image/jpeg',repeat('x',2100000)::bytea)",[a,rb,wa]);
  });
},30000);
