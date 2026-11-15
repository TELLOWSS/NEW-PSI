import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from 'vitest';

/**
 * STAGING-ONLY security regression.
 * Database RLS is the security boundary. This does NOT activate or migrate
 * ordinary WorkerRecord, safety-cases or production worker records.
 */
const tenantA='b9600000-0000-4000-8000-000000000001';
const tenantB='b9600000-0000-4000-8000-000000000002';
const siteA1='f9600000-0000-4000-8000-000000000001';
const siteA2='f9600000-0000-4000-8000-000000000002';
const siteB1='f9600000-0000-4000-8000-000000000003';
const workerA='a9600000-0000-4000-8000-000000000001';
const workerA2='a9600000-0000-4000-8000-000000000002';
const workerB='a9600000-0000-4000-8000-000000000003';
const cut='2026-11-15T08:00:00Z';
let db:PGlite;
async function asUser(user:string) {
  await db.exec('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
}
async function failWrite(query:string, args:unknown[]=[]) {
  await db.exec('savepoint psi_no_write');
  await expect(db.query(query,args)).rejects.toBeDefined();
  await db.exec('rollback to savepoint psi_no_write; release savepoint psi_no_write');
}
async function seed(tenant:string,site:string,period:string,trade:string,total:number) {
  await db.query(
    `insert into public.psi_nexus_site_aggregate_staging (
      tenant_id,site_id,period_month,job_field,source_cutoff_at,loaded_record_rows,
      self_risk_high,self_risk_medium,self_risk_low,self_risk_unknown,
      followup_unresolved,followup_overdue,followup_interim,followup_scheduled,
      followup_reopened_history,followup_completion_logged
    ) values($1,$2,$3,$4,$5,$6,1,1,0,$6-2,2,1,1,1,1,1)`,
    [tenant,site,period,trade,cut,total]
  );
}
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(await readFile(resolve('supabase/migrations/20260929000000_tenant_identity_foundation.sql'),'utf8'));
  // The existing site-membership proposal also defines worker assignment FKs.
  // Provide the same minimal synthetic prerequisite as tenantSiteEvidenceScopeSql.test.ts.
  await db.exec('create table public.psi_tenant_workers(tenant_id uuid not null references public.psi_tenants(id),id uuid not null,primary key(tenant_id,id));');
  await db.exec(await readFile(resolve('supabase/proposals/psi_tenant_site_memberships_staging.sql'),'utf8'));
  await db.exec(await readFile(resolve('supabase/proposals/psi_nexus_site_aggregate_staging.sql'),'utf8'));
},30000);
beforeEach(async()=>{
  await db.exec('begin');
  await db.query('insert into auth.users(id) values ($1),($2),($3)',[workerA,workerA2,workerB]);
  await db.query("insert into public.psi_tenants(id,name) values ($1,'Test org A'),($2,'Test org B')",[tenantA,tenantB]);
  await db.query(
    "insert into public.psi_tenant_memberships(tenant_id,user_id,role) values ($1,$3,'owner'),($1,$4,'admin'),($2,$5,'owner')",
    [tenantA,tenantB,workerA,workerA2,workerB]
  );
  await db.query(
    "insert into public.psi_tenant_sites(tenant_id,id,name) values ($1,$3,'Site A-1'),($1,$4,'Site A-2'),($2,$5,'Site B-1')",
    [tenantA,tenantB,siteA1,siteA2,siteB1]
  );
  await db.query(
    'insert into public.psi_tenant_site_memberships(tenant_id,site_id,user_id) values ($1,$3,$5),($1,$4,$6),($2,$7,$8)',
    [tenantA,tenantB,siteA1,siteA2,workerA,workerA2,siteB1,workerB]
  );
  await seed(tenantA,siteA1,'2026-11-01','형틀',6);
  await seed(tenantA,siteA1,'2026-11-01','철근',2);
  await seed(tenantA,siteA1,'2026-10-01','형틀',3);
  await seed(tenantA,siteA2,'2026-11-01','형틀',7);
  await seed(tenantB,siteB1,'2026-11-01','형틀',4);
});
afterEach(async()=>{await db.exec('rollback');});
afterAll(async()=>{await db.close();});

describe('Safety Nexus staging-only site aggregate RLS',()=>{
  it('restricts records to explicit active site membership even for company owner',async()=>{
    await asUser(workerA);
    const data=await db.query<{site_id:string,period_month:string,job_field:string}>(
      'select site_id,period_month,job_field from public.psi_nexus_site_aggregate_staging');
    expect(data.rows).toHaveLength(3);
    expect(data.rows.every(r=>r.site_id===siteA1)).toBe(true);
    await asUser(workerA2);
    const data2=await db.query<{site_id:string}>('select site_id from public.psi_nexus_site_aggregate_staging');
    expect(data2.rows).toHaveLength(1);
    expect(data2.rows[0].site_id).toBe(siteA2);
    await asUser(workerB);
    expect((await db.query('select * from public.psi_nexus_site_aggregate_staging')).rows).toHaveLength(1);
  });
  it('matches a site + month + trade + cutoff denominator with no cross-site inflation',async()=>{
    await asUser(workerA);
    const result=await db.query<{rows:string,records:string}>(
      `select count(*)::text as rows, sum(loaded_record_rows)::text as records
       from public.psi_nexus_site_aggregate_staging
       where tenant_id=$1 and site_id=$2 and period_month=$3 and job_field=$4 and source_cutoff_at=$5`,
      [tenantA,siteA1,'2026-11-01','형틀',cut]
    );
    expect(result.rows[0]).toEqual({rows:'1',records:'6'});
    expect((await db.query(
      'select * from public.psi_nexus_site_aggregate_staging where site_id=$1',
      [siteA2]
    )).rows).toHaveLength(0);
  });
  it('instantly revokes read on a suspended site membership',async()=>{
    await asUser(workerA);
    expect((await db.query('select * from public.psi_nexus_site_aggregate_staging')).rows).toHaveLength(3);
    await db.exec('reset role');
    await db.query(
      "update public.psi_tenant_site_memberships set status='suspended' where tenant_id=$1 and site_id=$2 and user_id=$3",
      [tenantA,siteA1,workerA]
    );
    await asUser(workerA);
    expect((await db.query('select * from public.psi_nexus_site_aggregate_staging')).rows).toHaveLength(0);
  });
  it('also revokes read on suspended tenant membership or inactive site',async()=>{
    await db.query(
      "update public.psi_tenant_memberships set status='suspended' where tenant_id=$1 and user_id=$2",
      [tenantA,workerA]
    );
    await asUser(workerA);
    expect((await db.query('select * from public.psi_nexus_site_aggregate_staging')).rows).toHaveLength(0);
    await db.exec('reset role');
    await db.query(
      "update public.psi_tenant_memberships set status='active' where tenant_id=$1 and user_id=$2",
      [tenantA,workerA]
    );
    await db.query('update public.psi_tenant_sites set active=false where tenant_id=$1 and id=$2',
      [tenantA,siteA1]);
    await asUser(workerA);
    expect((await db.query('select * from public.psi_nexus_site_aggregate_staging')).rows).toHaveLength(0);
  });
  it('refuses browser-role INSERT, UPDATE and DELETE, including a fabricated approved count',async()=>{
    await asUser(workerA);
    await failWrite(
      `insert into public.psi_nexus_site_aggregate_staging
        (tenant_id,site_id,period_month,job_field,source_cutoff_at,loaded_record_rows,
         self_risk_high,self_risk_medium,self_risk_low,self_risk_unknown)
        values ($1,$2,'2026-11-01','형틀',$3,1,1,0,0,0)`,
      [tenantA,siteA1,'2026-11-16T08:00:00Z']
    );
    await failWrite('update public.psi_nexus_site_aggregate_staging set official_report_denominator=999');
    await failWrite('delete from public.psi_nexus_site_aggregate_staging');
  });
  it('rejects impossible self-risk totals and false reconciliation flags',async()=>{
    await failWrite(
      "update public.psi_nexus_site_aggregate_staging set self_risk_high=99 where tenant_id=$1 and site_id=$2",
      [tenantA,siteA1]
    );
    await failWrite(
      "update public.psi_nexus_site_aggregate_staging set report_reconciled_at='2026-11-15T09:00:00Z' where tenant_id=$1 and site_id=$2",
      [tenantA,siteA1]
    );
    await failWrite(
      `update public.psi_nexus_site_aggregate_staging
       set official_report_denominator=999, report_reconciled_at='2026-11-15T09:00:00Z'
       where tenant_id=$1 and site_id=$2`,
      [tenantA,siteA1]
    );
  });
},30000);
