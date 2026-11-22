import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Every value here is synthetic. No production credentials or worker data.
const TENANT_A='26060000-0000-4000-8000-000000000001';
const TENANT_B='26060000-0000-4000-8000-000000000002';
const SITE_A='26061000-0000-4000-8000-000000000001';
const SITE_B='26061000-0000-4000-8000-000000000002';
const SITE_A2='26061000-0000-4000-8000-000000000003';
const CYCLE_A='26062000-0000-4000-8000-000000000001';
const CYCLE_B='26062000-0000-4000-8000-000000000002';
const CYCLE_A2='26062000-0000-4000-8000-000000000003';
const WORKER_A='26063000-0000-4000-8000-000000000001';
const WORKER_B='26063000-0000-4000-8000-000000000002';
const USER_A='26064000-0000-4000-8000-000000000001';
const USER_B='26064000-0000-4000-8000-000000000002';
const OWNER_A='26064000-0000-4000-8000-000000000003';
const OUTSIDER='26064000-0000-4000-8000-000000000004';
const NONCE_A='26065000-0000-4000-8000-000000000001';
const NONCE_B='26065000-0000-4000-8000-000000000002';
const VERSION='psi-form-master-2026-11-22-v2-legacy-compatible';
const ANSWERS={Q1:'슬라브 철근 조립',Q2:'단부 개구부 추락 위험',Q3:'상',Q4:'안전난간 설치 후 작업',Q5:'관리자와 확인하고 작업'};
let db:PGlite;
const sql='select public.psi_submit_worker_risk_l06($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) as receipt';
const params=(tenant=TENANT_A,site=SITE_A,cycle=CYCLE_A,nonce=NONCE_A,answers:unknown=ANSWERS,
  language='ko',grade='상',reason='개구부') =>
  [tenant,site,cycle,nonce,VERSION,language,JSON.stringify(answers),grade,reason];
async function user(id:string) {
  await db.exec('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
}
async function deny(query:string,args:unknown[]=[]){
  await db.exec('savepoint l06_deny');
  await expect(db.query(query,args)).rejects.toBeDefined();
  await db.exec('rollback to savepoint l06_deny; release savepoint l06_deny');
}
const submit=(...args:unknown[])=>db.query<{receipt:Record<string,unknown>}>(sql,args.length?args:params());

beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,
      deleted_at timestamptz,banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  for(const file of ['20260929000000_tenant_identity_foundation.sql',
    '20260930010000_tenant_training_drafts.sql','20260930020000_tenant_training_audience.sql',
    '20260930030000_tenant_education_release.sql'])
    await db.exec(await readFile(resolve('supabase/migrations',file),'utf8'));
  await db.exec(await readFile(resolve('supabase/proposals/psi_tenant_site_memberships_staging.sql'),'utf8'));
  await db.exec(await readFile(resolve('supabase/proposals/psi_site_worker_read_policy_staging.sql'),'utf8'));
  try {
    await db.exec(await readFile(resolve('supabase/proposals/psi_worker_risk_submission_l06_staging.sql'),'utf8'));
  } catch (error) {
    // The staging SQL runs only in PGlite. This marker identifies the exact
    // failed stage without printing source data or credentials.
    throw new Error('L06_PGLITE_STAGING_SQL_INITIALIZATION_FAILED', { cause: error });
  }
},40000);

beforeEach(async()=>{
  await db.exec('begin');
  await db.query(`insert into auth.users(id,email,email_confirmed_at)
    values($1,'l06-a@example.invalid',now()),($2,'l06-b@example.invalid',now()),
    ($3,'l06-owner@example.invalid',now()),($4,'l06-outsider@example.invalid',now())`,
    [USER_A,USER_B,OWNER_A,OUTSIDER]);
  await db.query("insert into public.psi_tenants(id,name) values($1,'Tenant A'),($2,'Tenant B')",[TENANT_A,TENANT_B]);
  await db.query("insert into public.psi_tenant_memberships(tenant_id,user_id,role) values($1,$2,'owner'),($3,$4,'owner')",
    [TENANT_A,OWNER_A,TENANT_B,OUTSIDER]);
  // The existing tenant worker integrity trigger requires an active manager;
  // provision both synthetic workers through their own tenant managers.
  await user(OWNER_A);
  await db.query(`insert into public.psi_tenant_workers(tenant_id,id,name,worker_code,trade)
    values($1,$2,'가상 근로자 A','A-1','형틀')`,[TENANT_A,WORKER_A]);
  await user(OUTSIDER);
  await db.query(`insert into public.psi_tenant_workers(tenant_id,id,name,worker_code,trade)
    values($1,$2,'가상 근로자 B','B-1','철근')`,[TENANT_B,WORKER_B]);
  await db.exec('reset role');
  // Use the actual existing audited account-binding RPC, not privileged
  // direct inserts that could seed cross-tenant test data unrealistically.
  await user(OWNER_A);
  await db.query("select public.psi_link_worker_account($1,$2,'l06-a@example.invalid',0)",[TENANT_A,WORKER_A]);
  await user(OUTSIDER);
  await db.query("select public.psi_link_worker_account($1,$2,'l06-b@example.invalid',0)",[TENANT_B,WORKER_B]);
  await db.exec('reset role');
  await db.query(`insert into public.psi_tenant_sites(tenant_id,id,name)
    values($1,$2,'Site A'),($3,$4,'Site B'),($1,$5,'Site A2')`,
    [TENANT_A,SITE_A,TENANT_B,SITE_B,SITE_A2]);
  await db.query(`insert into public.psi_tenant_site_worker_assignments(tenant_id,site_id,worker_id)
    values($1,$2,$3),($4,$5,$6)`,
    [TENANT_A,SITE_A,WORKER_A,TENANT_B,SITE_B,WORKER_B]);
  await db.query(`insert into public.psi_tenant_risk_cycles(tenant_id,site_id,id,label,status,opens_at,closes_at)
    values($1,$2,$3,'이번 주 안전점검','open',now()-interval '1 hour',now()+interval '1 hour'),
    ($4,$5,$6,'이번 주 안전점검','open',now()-interval '1 hour',now()+interval '1 hour'),
    ($1,$7,$8,'미배정 현장','open',now()-interval '1 hour',now()+interval '1 hour')`,
    [TENANT_A,SITE_A,CYCLE_A,TENANT_B,SITE_B,CYCLE_B,SITE_A2,CYCLE_A2]);
});
afterEach(async()=>{await db.exec('rollback');});
afterAll(async()=>{await db.close();});
describe('L06 staged PostgreSQL atomic worker self-entry (NOT a live migration)',()=>{
  it('gives A→A and B→B distinct server receipts while preserving Q1–Q5 originals',async()=>{
    await user(USER_A);
    const a=(await submit(...params())).rows[0].receipt;
    expect(a).toMatchObject({schema:'psi-worker-self-risk-receipt-v1',tenantId:TENANT_A,
      siteId:SITE_A,workerId:WORKER_A,requestId:NONCE_A,state:'received-pending-manager-review'});
    expect(Object.keys(a).sort()).toEqual(['receiptId','receivedAt','requestId','schema','siteId','state','tenantId','workerId']);
    expect(typeof a.receivedAt).toBe('string');
    await user(USER_B);
    const b=(await submit(...params(TENANT_B,SITE_B,CYCLE_B,NONCE_B))).rows[0].receipt;
    expect(b).toMatchObject({tenantId:TENANT_B,siteId:SITE_B,workerId:WORKER_B});
    expect(a.receiptId).not.toBe(b.receiptId);
    await db.exec('reset role');
    const original=await db.query<{answers:Record<string,string>;state:string}>(
      'select answers,state from public.psi_worker_risk_submissions where tenant_id=$1',[TENANT_A]);
    expect(original.rows).toEqual([{answers:ANSWERS,state:'received-pending-manager-review'}]);
    const audit=await db.query('select * from public.psi_worker_risk_receipt_events');
    expect(audit.rows).toHaveLength(2);
  });
  it('denies A→B and B→A, same-tenant other site and unlinked account',async()=>{
    await user(USER_A);
    await deny(sql,params(TENANT_B,SITE_B,CYCLE_B));
    await deny(sql,params(TENANT_A,SITE_A2,CYCLE_A2));
    await user(USER_B);
    await deny(sql,params(TENANT_A,SITE_A,CYCLE_A));
    await user(OUTSIDER);
    await deny(sql,params());
  });
  it('replays identical request without new audit/time, rejects a changed retry',async()=>{
    await user(USER_A);
    const first=(await submit(...params())).rows[0].receipt;
    const second=(await submit(...params())).rows[0].receipt;
    expect(second).toEqual(first);
    await deny(sql,params(TENANT_A,SITE_A,CYCLE_A,NONCE_A,{...ANSWERS,Q2:'변조된 위험 원인'}));
    await deny(sql,params(TENANT_A,SITE_A2,CYCLE_A2,NONCE_A));
    await db.exec('reset role');
    expect((await db.query('select * from public.psi_worker_risk_submissions')).rows).toHaveLength(1);
    expect((await db.query('select * from public.psi_worker_risk_receipt_events')).rows).toHaveLength(1);
  });
  it('validates exactly Q1–Q5, no injected identity/translation, source language and risk grade',async()=>{
    await user(USER_A);
    for(const answers of [{...ANSWERS,Q6:'위험'}, {...ANSWERS,workerId:WORKER_B},
      {...ANSWERS,Q4:''},{...ANSWERS,Q1:'A'},{...ANSWERS,Q2:1},
      {...ANSWERS,Q5:'x'.repeat(501)},{...ANSWERS,Q3:'중'}])
      await deny(sql,params(TENANT_A,SITE_A,CYCLE_A,NONCE_A,answers));
    await deny(sql,params(TENANT_A,SITE_A,CYCLE_A,NONCE_A,ANSWERS,'xx'));
    await deny(sql,params(TENANT_A,SITE_A,CYCLE_A,NONCE_A,ANSWERS,'ko','최상'));
    await deny(sql,[...params().slice(0,4),'legacy',...params().slice(5)]);
    await db.exec('reset role');
    expect((await db.query('select * from public.psi_worker_risk_submissions')).rows).toHaveLength(0);
  });
  it('rejects disabled account/worker/assignment/site, unconfirmed and banned users',async()=>{
    for(const [table,update] of [
      ['psi_tenant_worker_accounts',"set active=false where tenant_id=$1"],
      ['psi_tenant_workers',"set active=false where tenant_id=$1"],
      ['psi_tenant_site_worker_assignments',"set active=false where tenant_id=$1"],
      ['psi_tenant_sites',"set active=false where tenant_id=$1"],
    ]){
      await db.query(`update public.${table} ${update}`,[TENANT_A]);
      await user(USER_A);await deny(sql,params());
      await db.exec('reset role');
      await db.query(`update public.${table} set active=true where tenant_id=$1`,[TENANT_A]);
    }
    for(const [field,value] of [['email_confirmed_at',null],['banned_until','infinity']]){
      await db.query(`update auth.users set ${field}=$1 where id=$2`,[value,USER_A]);
      await user(USER_A); await deny(sql,params()); await db.exec('reset role');
      await db.query(`update auth.users set ${field}=${field==='email_confirmed_at'?'now()':'null'} where id=$1`,[USER_A]);
    }
  });
  it('rejects closed, expired and not-yet-open cycles',async()=>{
    for(const change of ["status='closed'","opens_at=now()+interval '1 hour'","closes_at=now()-interval '1 minute'"]){
      await db.query(`update public.psi_tenant_risk_cycles set ${change} where tenant_id=$1`,[TENANT_A]);
      await user(USER_A);await deny(sql,params());await db.exec('reset role');
      await db.query(`update public.psi_tenant_risk_cycles set status='open',
        opens_at=now()-interval '1 hour',closes_at=now()+interval '1 hour' where tenant_id=$1`,[TENANT_A]);
    }
  });
  it('blocks direct table operations by anon, worker and manager even with a user session',async()=>{
    for(const role of ['anon','authenticated']){
      await db.exec(`set local role ${role}`);
      for(const table of ['psi_tenant_risk_cycles','psi_worker_risk_submissions','psi_worker_risk_receipt_events']){
        await deny(`select * from public.${table}`);
        await deny(`delete from public.${table}`);
      }
    }
    await db.exec('set local role anon');
    await deny(sql,params());
  });
  it('rolls back receipt when appending the immutable audit event fails',async()=>{
    await db.exec("alter table public.psi_worker_risk_receipt_events add constraint l06_synthetic_audit_failure check(kind<>'received')");
    await user(USER_A);
    await deny(sql,params());
    await db.exec('reset role');
    expect((await db.query('select id from public.psi_worker_risk_submissions')).rows).toHaveLength(0);
    expect((await db.query('select * from public.psi_worker_risk_receipt_events')).rows).toHaveLength(0);
  });
  it('proves RLS is enabled/forced and no direct grants are present',async()=>{
    const settings=await db.query<{relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean}>(
      `select relname,relrowsecurity,relforcerowsecurity from pg_class
       where relname in ('psi_tenant_risk_cycles','psi_worker_risk_submissions','psi_worker_risk_receipt_events')`);
    expect(settings.rows).toHaveLength(3);
    for(const r of settings.rows){
      expect(r.relrowsecurity).toBe(true);
      expect(r.relforcerowsecurity).toBe(true);
    }
    for(const table of ['psi_tenant_risk_cycles','psi_worker_risk_submissions','psi_worker_risk_receipt_events']){
      const access=await db.query<{allowed:boolean}>(
        "select has_table_privilege('authenticated',$1,'INSERT') as allowed",['public.'+table]);
      expect(access.rows[0].allowed).toBe(false);
    }
  });
},60000);
